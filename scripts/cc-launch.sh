#!/usr/bin/env bash
# 무인 meeting-notes Claude Code 세션 기동 래퍼. keeper 가 tmux 안에서 이 스크립트를 실행한다.
#
# 토큰을 argv 로 넘기지 않는 이유: /proc/<pid>/cmdline 은 누구나 읽을 수 있고(-r--r--r--),
# tmux 는 `new-session -e VAR=...` 를 실행한 클라이언트 프로세스를 세션 수명 내내 남겨 둔다.
# 반면 /proc/<pid>/environ 은 소유자만 읽는다(-r--------). 그래서 env 파일을 이 프로세스
# 안에서 읽어 환경변수로만 claude 에 넘긴다. keeper 나 tmux 서버 env 는 토큰을 보지 않는다.
set -uo pipefail

ENV_FILE="$HOME/.config/meeting-notes-cc.env"
if [ -r "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

# --model claude-opus-4-8: 디폴트 1M-context 는 별도 크레딧을 요구해 Max 한도와 무관하게 막힘.
# --effort medium: 명세가 고정된 구조화 작문이라 추론 예산을 늘려도 수익이 작다(xhigh 는 잡당 12분).
# --permission-mode dontAsk: allow 에 없어 프롬프트가 뜰 도구를 무프롬프트 자동 거부. 무인 세션이
#   권한 모달에 고착하는 것과, bridge 의 send-keys Enter 가 그 모달을 우발 승인하는 경로를 없앤다.
# --disallowedTools: bare 이름 deny 는 도구를 모델 컨텍스트에서 제거한다. Bash 는 dontAsk 로도
#   못 막는다 — read-only Bash(cat/grep/find …)는 모든 모드에서 프롬프트 없이 실행되기 때문.
#   Read 는 read-only 라 애초에 프롬프트 대상이 아니어서 allow 로 범위를 좁힐 수 없다. 그래서
#   민감 경로만 deny 로 막는다(deny 는 allow 를 이긴다).
# 인자는 반드시 공백 구분: 두 플래그 모두 variadic 이라 "A,B,C" 콤마 문자열을 주면 이름이
#   "A,B,C" 인 도구 1개로 해석돼 아무것도 걸리지 않는다.
exec claude --model claude-opus-4-8 \
  --effort medium \
  --permission-mode dontAsk \
  --allowedTools mcp__meeting-notes mcp__notion ToolSearch TodoWrite \
  --disallowedTools Bash Write Edit NotebookEdit Glob Grep WebFetch WebSearch \
    Task Agent Skill Workflow mcp__plugin_oh-my-claudecode_t mcp__playwright \
    'Read(~/.claude/**)' 'Read(~/.config/**)' 'Read(~/.ssh/**)' 'Read(//**/.env)'
