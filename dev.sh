#!/bin/bash
# DeepInk 一键启动/重启脚本
#
# 用法:
#   ./dev.sh          启动（自动杀死旧进程）
#   ./dev.sh restart   重启
#   ./dev.sh stop      停止
#   ./dev.sh status    查看状态

cd "$(dirname "$0")"
unset ELECTRON_RUN_AS_NODE

PID_FILE="/tmp/deepink-dev.pid"
LOG_FILE="/tmp/deepink-dev.log"

stop_deepink() {
  if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
      echo "🛑 正在停止 DeepInk (PID: $OLD_PID)..."
      # 先杀子进程（Electron），再杀父进程（electron-vite）
      pkill -P "$OLD_PID" 2>/dev/null
      kill "$OLD_PID" 2>/dev/null
      # 等 1 秒确保进程退出
      sleep 1
      # 如果还没死，强杀
      if kill -0 "$OLD_PID" 2>/dev/null; then
        echo "💀 强制终止..."
        kill -9 "$OLD_PID" 2>/dev/null
      fi
      rm -f "$PID_FILE"
      echo "✅ 已停止"
    else
      echo "🗑️ 旧进程已不存在，清理 PID 文件"
      rm -f "$PID_FILE"
    fi
  else
    # 没有记录的 PID，尝试按名称查找并杀掉
    RUNNING=$(pgrep -f "electron-vite dev" 2>/dev/null)
    if [ -n "$RUNNING" ]; then
      echo "🛑 发现未记录的 DeepInk 进程，正在停止..."
      echo "$RUNNING" | xargs kill 2>/dev/null
      sleep 1
      echo "✅ 已停止"
    else
      echo "ℹ️ 没有运行中的 DeepInk 进程"
    fi
  fi
}

start_deepink() {
  # 先停旧的
  stop_deepink

  echo "🚀 启动 DeepInk 开发模式..."
  echo "📋 日志: $LOG_FILE"
  echo ""

  # 后台启动，日志写入文件
  nohup npx electron-vite dev > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"

  # 等几秒检查是否真的启动了
  sleep 3
  NEW_PID=$(cat "$PID_FILE")
  if kill -0 "$NEW_PID" 2>/dev/null; then
    echo "✅ DeepInk 已启动 (PID: $NEW_PID)"
    echo "💡 查看日志: tail -f $LOG_FILE"
    echo "🛑 停止: ./dev.sh stop"
  else
    echo "❌ 启动失败，查看日志:"
    tail -20 "$LOG_FILE"
    rm -f "$PID_FILE"
    exit 1
  fi
}

show_status() {
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
      echo "🟢 DeepInk 运行中 (PID: $PID)"
      echo "📋 日志: $LOG_FILE"
      echo ""
      echo "最近日志:"
      tail -10 "$LOG_FILE"
    else
      echo "🔴 DeepInk 已停止（PID 文件残留）"
      rm -f "$PID_FILE"
    fi
  else
    echo "⚪ DeepInk 未运行"
  fi
}

case "${1:-start}" in
  start)
    start_deepink
    ;;
  restart)
    start_deepink
    ;;
  stop)
    stop_deepink
    ;;
  status)
    show_status
    ;;
  log|logs)
    tail -f "$LOG_FILE"
    ;;
  *)
    echo "用法: ./dev.sh [start|stop|restart|status|log]"
    exit 1
    ;;
esac
