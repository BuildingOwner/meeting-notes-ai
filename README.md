# meeting-notes-ai

음성 녹음(회의·세미나·강의)을 업로드하면 **STT → 사용자의 Claude Code 세션 위임 → Notion 자동 등록** 까지 한 흐름으로 처리하는 개인용 파이프라인.

> 컨셉은 SKT 에이닷 노트 / 클로바 노트 — 단 실시간 요약은 다루지 않음 (배치).

## 동작 한 줄 요약

```
[브라우저] → POST /jobs (오디오 + Notion 타겟)
       ↓
[FastAPI + SQLite]   ← 잡 상태 source-of-truth
       ↓ 폴링
[STT 워커] faster-whisper 로 전사 → transcript_path 채우고 TRANSCRIBED
       ↓ 폴링
[bridge 데몬]  tmux send-keys → 사용자의 Claude Code 세션
       ↓ MCP
[Claude Code]  meeting_notes.claim → Notion 페이지 생성 → meeting_notes.complete
       ↓
[Notion]
```

전체 설계 상세는 [docs/design.md](docs/design.md). UI 디자인 토큰은 [DESIGN.md](DESIGN.md) (Apple-style).

## 빠른 시작 (Docker)

```bash
# 1. 모델/데이터 디렉토리 미리 만들기
mkdir -p ~/meeting-notes/{audio,transcripts,logs}

# 2. API + STT + web 컨테이너 빌드 + 기동
docker compose up -d --build

# 3. (호스트에서) bridge 데몬과 tmux Claude Code 세션 띄우기
tmux new-session -d -s meeting-notes-cc -c "$PWD"
tmux send-keys -t meeting-notes-cc:0.0 'claude' Enter
uv run python -m workers.bridge.bridge &

# 4. 동작 확인
curl http://localhost:8088/healthz
open http://localhost:3000     # 프론트엔드
```

> bridge 는 호스트의 tmux 서버에 send-keys 해야 하므로 의도적으로 Docker 외부에서 실행.

환경변수:

| 변수 | 기본 | 설명 |
|---|---|---|
| `MEETING_NOTES_ROOT` | `~/meeting-notes` | 모든 작업 디렉토리 부모 (audio, transcripts, db, logs) |
| `MCP_PORT` | `8088` | API 리스닝 포트 |
| `STT_GPU_INDEX` | `1` | STT 워커가 쓸 CUDA 디바이스 |
| `STT_MODEL_PATH` | (Docker 기본 `/models/faster-whisper-large-v3`) | faster-whisper 모델 경로 |
| `STT_IDLE_UNLOAD` | `1` | 큐가 비면 모델을 GPU 메모리에서 언로드 (0 = 상주) |
| `CC_TMUX_TARGET` | `meeting-notes-cc:0.0` | bridge 가 send-keys 할 tmux 타겟 |

## 호스트 실행 (Docker 없이)

```bash
uv sync
# 1. API + MCP
uv run python -m apps.api.server &
# 2. STT 워커 (GPU 필요)
uv run python -m workers.stt.worker &
# 3. tmux Claude Code (선행: ~/.claude 설정 + Notion MCP 인증)
tmux new-session -d -s meeting-notes-cc -c "$PWD"
tmux send-keys -t meeting-notes-cc:0.0 'claude' Enter
# 4. bridge
uv run python -m workers.bridge.bridge &
```

## 프론트엔드 (Next.js)

Docker 로 띄우면 자동 (`docker compose up web`). 로컬 dev:

```bash
cd apps/web
cp .env.local.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:8088
npm install
npm run dev    # http://localhost:3000
```

3 페이지: `/` 잡 목록 · `/upload` 업로드 · `/jobs/[id]` 상세.
디자인 토큰은 Apple 컨벤션 (단일 Action Blue #0066cc, 17px body, SF Pro 스택, 알터네이팅 light/dark tile, pill CTAs). 자세한 토큰은 `DESIGN.md` 참조.

## 디렉토리 구조

```
meeting-notes-ai/
├── apps/
│   ├── api/                # FastAPI (REST + MCP 마운트)
│   └── web/                # Next.js 프론트 (Apple-style)
├── workers/
│   ├── stt/                # faster-whisper 폴링 데몬
│   └── bridge/             # SQLite 폴링 → tmux send-keys
├── prompts/                # _base.md / meeting.md / seminar.md / lecture.md
├── scripts/                # inject_job.py / cleanup.py / e2e_test.py
├── infra/docker/           # Dockerfile (API), Dockerfile.stt
├── docs/
│   ├── design.md           # 전체 아키텍처
│   └── runbook.md          # 운영 가이드
└── docker-compose.yml
```

## 운영 / 문제 해결

자세한 운영 가이드는 [docs/runbook.md](docs/runbook.md). 자주 보는 것:

| 증상 | 원인·대응 |
|---|---|
| `claude mcp list` 에 `meeting-notes` 안 뜸 | tmux Claude Code 가 `.mcp.json` 보다 먼저 부팅됨 → `/exit` 후 `claude` 다시 실행 |
| `MCP HTTP 500` (`Task group is not initialized`) | FastAPI lifespan 누락 — `apps/api/main.py` 가 `mcp.session_manager.run()` 으로 감싸야 함 |
| `포트 8088 already in use` | Docker container or 다른 프로세스 점유. `lsof -iTCP:8088 -sTCP:LISTEN` 확인 후 종료 |
| Notion `Needs Auth` | 사용자가 Claude Code 의 `/mcp` 메뉴에서 Notion 인증 수동 |
| 잡이 QUEUED 에 머무름 | STT 워커가 안 돔 — `~/meeting-notes/logs/stt-worker.log` 확인 |
| 잡이 TRANSCRIBED 에 머무름 | bridge 안 돔, tmux 세션 없음, Claude Code 가 죽음 — `~/meeting-notes/logs/bridge.log` |

## 자동 정리 (cron)

```bash
0 4 * * *  cd /path/to/meeting-notes-ai && uv run python scripts/cleanup.py
```

`expires_at < now()` 인 잡의 audio 파일만 삭제. transcript 는 영구 보존.

## 의도적 제외 (사용자 후속 작업)

| 항목 | 비고 |
|---|---|
| Cloudflare Tunnel + Cloudflare Access | 외부 노출용. 도메인·토큰·이메일 allowlist 사용자 결정 필요 |
| Vercel 배포 (apps/web) | Vercel 계정·env 사용자 직접 |
| pyannote 화자 분리 (M1.5) | HF 토큰 + pyannote/speaker-diarization-3.1 라이센스 동의 필요. STT 품질 본 뒤 결정 |
| NextAuth 인증 | Phase 1 은 Cloudflare Access 가 경계 인증 담당. Phase 2 BYOK 갈 때 도입 |

## 라이센스 / 크레딧

개인용 프로젝트. 모델 (faster-whisper / pyannote) 의 라이센스를 각자 준수.
