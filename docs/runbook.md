# 운영 가이드 (Runbook)

## 서비스 구성 요약

| 서비스 | 위치 | 책임 | 의존 |
|---|---|---|---|
| FastAPI (API + MCP) | Docker `api` 컨테이너 또는 호스트 `apps.api.server` | REST + MCP `/mcp` | SQLite |
| STT 워커 | Docker `stt` 컨테이너 (GPU) 또는 호스트 `workers.stt.worker` | faster-whisper 전사 | API DB, 호스트 모델 디렉토리 |
| bridge 데몬 | **항상 호스트에서** (`workers.bridge.bridge`) | SQLite 폴링 → tmux send-keys | tmux 서버, API DB |
| Claude Code (tmux) | 호스트 tmux 세션 `meeting-notes-cc` | LLM agent 처리 + Notion MCP | bridge, 우리 MCP, Notion MCP |
| Notion MCP | Claude Code 플러그인 | Notion 페이지 생성 | 사용자 OAuth 인증 |

## 시작 순서

1. **준비**: `mkdir -p ~/meeting-notes/{audio,transcripts,logs}`
2. **API + STT (Docker)**: `docker compose up -d --build`
3. **호스트 tmux + Claude Code**:
   ```bash
   tmux new-session -d -s meeting-notes-cc -c "$PWD"
   tmux send-keys -t meeting-notes-cc:0.0 'claude' Enter
   ```
4. **Claude Code 안에서 Notion 인증 (최초 1회)**: tmux attach → `/mcp` → plugin:Notion:notion 선택 → 브라우저 OAuth 완료
5. **bridge 데몬**: `uv run python -m workers.bridge.bridge &`
6. **검증**: `curl http://localhost:8088/healthz` → `{"status":"ok"}`

## 종료 순서

```bash
pkill -f 'workers.bridge.bridge'
docker compose down
tmux kill-session -t meeting-notes-cc
```

DB 와 audio 는 `~/meeting-notes/` 에 남으므로 데이터 손실 없음.

## 흔한 장애

### Claude Code 가 우리 MCP 인식 못 함

**증상**: tmux Claude Code 에서 `/mcp` 메뉴에 `meeting-notes` 없음. 또는 `claude mcp list` 에 ✗ Failed.

**원인**:
- Claude Code 가 `.mcp.json` 작성 전에 부팅됨
- API 서버 8088 죽음

**조치**:
```bash
curl http://localhost:8088/healthz   # 살아있는지 먼저
tmux send-keys -t meeting-notes-cc:0.0 '/exit' Enter
sleep 2
tmux send-keys -t meeting-notes-cc:0.0 'claude' Enter
```

### MCP `/mcp` 가 500 (`Task group is not initialized`)

FastAPI lifespan 안에서 `mcp.session_manager.run()` 컨텍스트가 가동돼야 함. `apps/api/main.py` 의 `lifespan` 함수가 정상인지 확인.

### 포트 8088 충돌

```bash
lsof -iTCP:8088 -sTCP:LISTEN     # 점유 프로세스 확인
# Docker 가 점유 중이면:
docker compose down
# 다른 임의 프로세스면 PID kill
```

대체 포트 사용: `MCP_PORT=9088 docker compose up -d` 그리고 `.mcp.json` URL 도 동일하게 갱신.

### 잡이 진행 안 됨

각 단계별 정지 지점:

| 잡 상태 | 누가 잡아야 다음으로 가는가 | 점검 |
|---|---|---|
| `QUEUED` | STT 워커 | `~/meeting-notes/logs/stt-worker.log` 마지막 라인 / Docker `docker compose logs stt` |
| `TRANSCRIBING` | STT 워커 처리 중 | 오래 머무르면 워커 에러; FAILED 로 전이될 때까지 대기 또는 강제 종료 |
| `TRANSCRIBED` | bridge | bridge 가 돌고 있는지 (`pgrep -af workers.bridge`), tmux 세션 살아있는지 |
| `PROCESSING` | tmux Claude Code | tmux attach 해서 진행 확인. API 429 면 잠시 후 다시. Notion MCP 인증 풀렸으면 재인증 |
| `FAILED` | 수동 재시도 | `curl -X POST http://localhost:8088/jobs/{id}/retry` |

### Notion `Needs Auth`

사용자의 Claude Code 가 Notion OAuth 토큰을 잃었음. tmux attach → `/mcp` → Notion 항목 선택 → 인증 플로우 재진행.

### 작업 강제 종료

```bash
# 특정 잡 삭제 (오디오·트랜스크립트 파일까지)
curl -X DELETE http://localhost:8088/jobs/<id>
```

## 백업

`~/meeting-notes/db.sqlite3` 만 백업하면 잡 이력 보존. 트랜스크립트와 audio 는 큰 파일이라 별도 정책 권장.

```bash
# 일 백업 예시
sqlite3 ~/meeting-notes/db.sqlite3 ".backup '$HOME/backup/db-$(date +%F).sqlite3'"
```

## 모니터링 신호

- `~/meeting-notes/logs/bridge.log` — send-keys 빈도, tmux 세션 missing 경고
- `~/meeting-notes/logs/stt-worker.log` — model 로드, 잡 처리 시간, 실패
- `docker compose logs -f api stt` — uvicorn / 워커 stdout

## 자동 정리

```bash
# crontab
0 4 * * *  cd /path/to/meeting-notes-ai && uv run python scripts/cleanup.py
```

`expires_at < now()` 인 잡의 audio 만 삭제. transcript 는 영구.

## 마일스톤 상태

| M# | 상태 | 비고 |
|---|---|---|
| M1 STT PoC | ✅ | `workers/stt/transcribe.py` |
| M1.5 화자분리 (pyannote) | ⏸ 보류 | HF 라이센스 동의 필요 |
| M2 MCP + bridge PoC | ✅ | 자동 E2E 검증됨 |
| M3 백엔드 골격 | ✅ | REST + MCP + 업로드 + 폴링 |
| M4 워커 연결 | ✅ | STT 워커 자동 폴링 (`workers/stt/worker.py`) |
| M5 프론트엔드 | ✅ | Next.js + Apple-style UI |
| M6 외부 노출 | ⏸ 제외 | Cloudflare Tunnel + Vercel 사용자 직접 |
| M7 템플릿 정제 | 🔄 1차 완료 | meeting/seminar/lecture + _base. 실데이터로 튜닝은 진행 중 |
| M8 운영 안정화 | 🔄 1차 완료 | cleanup.py, 로그 분리, 재시도 엔드포인트 |
| Docker 패키징 | ✅ | `docker-compose.yml` + `infra/docker/Dockerfile{,.stt}` |
