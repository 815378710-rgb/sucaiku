#!/bin/bash
# sucaiku-webhook 启动/停止脚本
# 在NAS上以nohup方式运行webhook监听服务

SCRIPT_DIR="/volume1/projects/sucaiku"
PID_FILE="/volume1/docker/sucaiku/data/webhook.pid"
LOG_FILE="/volume1/docker/sucaiku/data/webhook-service.log"
PYTHON="/usr/bin/python3"

start() {
    if [ -f "$PID_FILE" ]; then
        OLD_PID=$(cat "$PID_FILE")
        if kill -0 "$OLD_PID" 2>/dev/null; then
            echo "webhook已在运行 (PID: $OLD_PID)"
            return 0
        fi
    fi
    echo "启动webhook服务..."
    nohup $PYTHON "$SCRIPT_DIR/webhook-listener.py" >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    echo "webhook已启动 (PID: $(cat $PID_FILE))"
}

stop() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID"
            rm -f "$PID_FILE"
            echo "webhook已停止"
        else
            rm -f "$PID_FILE"
            echo "进程不存在，清理PID文件"
        fi
    else
        echo "webhook未运行"
    fi
}

status() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo "webhook运行中 (PID: $PID)"
        else
            echo "webhook未运行（PID文件过期）"
        fi
    else
        echo "webhook未运行"
    fi
}

case "$1" in
    start)   start ;;
    stop)    stop ;;
    status)  status ;;
    restart) stop; sleep 1; start ;;
    *)       echo "用法: $0 {start|stop|status|restart}" ;;
esac
