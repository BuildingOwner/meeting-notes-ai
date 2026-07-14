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
3. **Claude Code 무인 세션 (systemd user service, 자동 재기동)**:
   ```bash
   systemctl --user enable --now meeting-notes-cc.service
   ```
   - 유닛: `~/.config/systemd/user/meeting-notes-cc.service` → `scripts/cc-session-keeper.sh`
     (tmux `meeting-notes-cc` 세션이 없으면 claude 재기동, 크래시 루프 시 백오프).
   - 기동 플래그·토큰 주입은 전부 `scripts/cc-launch.sh` 에 있다(keeper 는 이 스크립트를
     tmux 안에서 실행만 한다). 권한은 **세션 한정 CLI 플래그**로만 건다 — 프로젝트
     `.claude/settings.json` 에 deny 를 넣으면 개발자 세션까지 함께 묶인다.
     - `--model claude-opus-4-8`: **필수**. 디폴트 1M-context 는 별도 크레딧을 요구해 Max 한도와 무관하게 막힘.
     - `--effort medium`: 명세가 고정된 구조화 작문이라 추론 예산을 늘려도 수익이 작다
       (xhigh 는 잡당 12분). 유효값: `low|medium|high|xhigh|max`.
     - `--permission-mode dontAsk`: allow 에 없어 프롬프트가 뜰 도구를 **무프롬프트 자동 거부**.
       무인 세션이 권한 모달에 고착하는 것과, bridge 의 `send-keys` Enter 가 그 모달을
       우발 승인하는 경로를 함께 없앤다. `--dangerously-skip-permissions` 는 쓰지 않는다.
     - `--disallowedTools Bash …`: `dontAsk` 도 **read-only Bash(`cat`·`grep`·`find` 등)는
       모든 모드에서 프롬프트 없이 실행**한다(구성 불가). bare 이름 deny 는 도구를 모델
       컨텍스트에서 아예 제거하므로 그 구멍(토큰·크레덴셜 파일 읽기)까지 막는다.
     - `--allowedTools` 는 최소 집합. `meeting_notes.claim` 이 transcript·prompt·meta 를
       인라인 반환하므로 Bash/Write 없이 처리된다.
     - `Read` 는 read-only 라 **애초에 승인 대상이 아니다**(`dontAsk` 가 거부하지 않고,
       allow 로 범위를 좁힐 수도 없다 — deny 가 allow 를 이기므로 "이것만 허용"은 표현 불가).
       따라서 민감 경로만 deny 로 막는다: `Read(~/.claude/**)`, `Read(~/.config/**)`,
       `Read(~/.ssh/**)`, `Read(//**/.env)`.
     - ⚠️ `--allowedTools`/`--disallowedTools` 는 variadic → **반드시 공백 구분**.
       `"Bash,Write,…"` 처럼 콤마 한 문자열을 주면 이름이 `"Bash,Write,…"` 인 도구 1개로
       해석돼 **아무것도 차단되지 않는다**(2026-07-10 이전 설정의 실제 버그).
     - 검증법: 동일 플래그로 임시 세션을 띄워 `Bash로 echo hi`, `Read ~/.claude/settings.json`,
       `Read ./.env` 가 모두 거부되고 일반 파일 Read 만 되는지 확인.
   - **인증(장수명 토큰, 최초 1회)**: 무인 세션이 대화형(VSCode 등) 세션과 같은
     `~/.claude/.credentials.json` 을 공유하면 refresh-token rotation 으로 유휴 인스턴스가
     `401 Invalid authentication credentials` 로 로그아웃되어 잡이 `TRANSCRIBED` 에서
     멈춘다. 이를 막으려 무인 세션은 전용 장수명 토큰을 쓴다:
     ```bash
     claude setup-token   # 브라우저 OAuth, Max 구독 사용 → 토큰 출력
     ```
     출력 토큰을 `~/.config/meeting-notes-cc.env`(권한 600, git 커밋 금지) 의
     `CLAUDE_CODE_OAUTH_TOKEN=` 뒤에 넣고 재기동:
     ```bash
     systemctl --user daemon-reload && systemctl --user restart meeting-notes-cc
     ```
     `cc-launch.sh` 가 이 파일을 **자기 프로세스 안에서 읽어** 환경변수로만 claude 에 넘긴다.
     systemd `EnvironmentFile` 이나 `tmux new-session -e` 로 넘기지 않는데, 그러면 토큰이
     keeper env(→ tmux 서버가 전역 env 로 복사 → 머신의 모든 tmux 세션이 상속)나
     tmux 클라이언트 argv 에 남기 때문이다. `/proc/<pid>/cmdline` 은 누구나 읽을 수 있고
     (`-r--r--r--`), `/proc/<pid>/environ` 은 소유자만 읽는다(`-r--------`).
     값이 비면 claude 는 공유 creds 로 동작한다.
     확인:
     ```bash
     tmux show-environment -g | grep CLAUDE_CODE_OAUTH_TOKEN   # 결과 없어야 정상
     grep -l sk-ant-oat01 /proc/*/cmdline                      # 결과 없어야 정상
     ```
   - linger 1회 설정(부팅·로그아웃 후 유지): `loginctl enable-linger jwchoi`.
   - 상태/로그: `systemctl --user status meeting-notes-cc` · `journalctl --user -u meeting-notes-cc -f`.
   - 수동 기동(디버그용): `tmux new-session -d -s meeting-notes-cc -c "$PWD"` 후 위 플래그로 `claude` 실행.
4. **Claude Code 안에서 Notion 인증 (최초 1회)**: tmux attach → `/mcp` → plugin:Notion:notion 선택 → 브라우저 OAuth 완료
5. **bridge 데몬 (systemd user service, 자동 재시작)**:
   ```bash
   systemctl --user enable --now meeting-notes-bridge.service
   ```
   - 유닛: `~/.config/systemd/user/meeting-notes-bridge.service` (`Restart=always`, 크래시 시 3초 후 재기동).
   - 부팅/로그아웃 후에도 살리려면 linger 1회 설정: `sudo loginctl enable-linger jwchoi`.
   - 상태/로그: `systemctl --user status meeting-notes-bridge` · `journalctl --user -u meeting-notes-bridge -f`.
6. **검증**: `curl http://localhost:8088/healthz` → `{"status":"ok"}`

## 종료 순서

```bash
# cc 서비스가 keeper 라 tmux kill-session 만으로는 즉시 재생성됨 → 서비스를 멈춰야 함.
systemctl --user stop meeting-notes-cc.service meeting-notes-bridge.service   # 영구 정지면 disable 추가
docker compose down
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
