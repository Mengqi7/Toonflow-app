#!/usr/bin/env bash
# Toonflow 开发服务器启动脚本 (git-bash / MSYS 环境)
# 同时启动后端源码服务(10588) 与 Toonflow-web 前端源码(Vite, 50188)
# 用法: bash start-dev.sh  （Ctrl+C 同时停止两个服务）
set -e
cd "$(dirname "$0")"

export FORCE_COLOR=1

echo "============================================"
echo "  Toonflow Dev (后端 10588 + 前端 50188)"
echo "  浏览器访问: http://127.0.0.1:50188"
echo "============================================"
echo ""
echo "[1/3] Node version:"
node -v
echo ""

echo "[2/3] Starting backend (nodemon + tsx, 10588)..."
npx nodemon --inspect --exec tsx src/app.ts &
BACKEND_PID=$!

echo "[3/3] Starting frontend (Vite dev server, 50188)..."
cd ../Toonflow-web
npx vite --host &
FRONTEND_PID=$!

echo ""
echo "两个服务已启动，浏览器访问: http://127.0.0.1:50188"
echo "按 Ctrl+C 停止两个服务"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
