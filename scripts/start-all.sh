# ================================
# ToonFlow 一键启动脚本 (Bash/WSL)
# ================================

#!/bin/bash

echo ""
echo "========================================"
echo "   🚀 ToonFlow 项目启动器"
echo "========================================"

# --- 定义路径 ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$BACKEND_DIR/frontend"

# --- 检查依赖 ---
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未检测到 Node.js"
    exit 1
fi

echo "✅ Node.js $(node --version)"
echo ""

# --- 启动后端 ---
echo "[1/2] 启动后端服务..."
cd "$BACKEND_DIR" || exit 1
if [ ! -d "node_modules" ]; then
    echo "   安装依赖中..."
    yarn install || npm install
fi

# --- 启动前端 ---
if [ -d "$FRONTEND_DIR" ]; then
    echo "[2/2] 启动前端服务..."
    cd "$FRONTEND_DIR" || exit 1
    if [ ! -d "node_modules" ]; then
        echo "   安装依赖中..."
        yarn install || npm install
    fi
fi

echo ""
echo "========================================"
echo "   ✅ ToonFlow 启动完成!"
echo "========================================"
echo ""
echo "🖥️  后端 API : http://127.0.0.1:10588"
echo "🎨 前端 Web : http://127.0.0.1:50188"
echo ""
echo "💡 在每个终端中按 Ctrl+C 停止服务"
