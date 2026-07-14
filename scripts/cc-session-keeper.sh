#!/usr/bin/env bash
# meeting-notes Claude Code 세션 keeper.
# tmux 세션(meeting-notes-cc)이 없으면 claude 를 무인 모드로 재기동.
# systemd user service(meeting-notes-cc.service)가 foreground 로 실행 → claude 가
# 죽어 세션이 닫히면 5초 내 자동 복구. README 의 수동 기동을 영구 자동화한 것.
set -uo pipefail

SESSION=meeting-notes-cc
DIR=/home/jwchoi/workspace/meeting-notes-ai

# claude 가 즉시 죽는 크래시 루프(설정 오류·인증 만료 등)일 때 5초 간격 무한 재기동으로
# CPU/세션을 태우지 않도록 연속 실패 횟수에 따라 백오프한다.
fails=0
while true; do
  if ! tmux has-session -t "$SESSION" 2>/dev/null; then
    # 기동 플래그·인증 토큰 주입은 전부 cc-launch.sh 안에서 처리한다. keeper 는 토큰을
    # 보지 않으므로 tmux 서버 env 나 클라이언트 argv 에 토큰이 실릴 일이 없다.
    tmux new-session -d -s "$SESSION" -c "$DIR" "$DIR/scripts/cc-launch.sh"
    fails=$((fails + 1))
  else
    fails=0
  fi
  if [ "$fails" -ge 3 ]; then
    sleep 60   # 연속 재기동 = 크래시 루프 → 백오프
  else
    sleep 5
  fi
done
