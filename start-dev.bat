@echo off
chcp 65001 >nul
title Toonflow Dev (App 后端 + Web 前端)
echo ============================================================
echo   Toonflow 开发模式（前端源码 + 后端源码）
echo.
echo   前端 (Vite 源码):  http://127.0.0.1:50188   -- 浏览器访问入口
echo   后端 (API 服务):   http://127.0.0.1:10588
echo.
echo   前端页面中的 /api /socket.io /oss /skills /assets
echo   均由 Vite dev server 代理到后端 10588
echo ============================================================
echo.

rem 使用系统默认 Node（当前为 v24.x，与 node_modules 中
rem better-sqlite3 的 ABI 匹配；如遇到 ABI 报错请执行 npm rebuild）
node -v >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 node，请先安装 Node.js 24.x 并加入 PATH
    pause
    exit /b 1
)

set "APP_DIR=E:\workspace\Toonflow-app"
set "WEB_DIR=E:\workspace\Toonflow-web"

if not exist "%APP_DIR%\node_modules" (
    echo [错误] %APP_DIR%\node_modules 不存在，请先执行: npm install / yarn install
    pause
    exit /b 1
)
if not exist "%WEB_DIR%\node_modules" (
    echo [错误] %WEB_DIR%\node_modules 不存在，请先到 %WEB_DIR% 执行: npm install / yarn install
    pause
    exit /b 1
)

echo [1/3] 当前 Node 版本:
node -v
echo.

echo [2/3] 启动后端 (nodemon + tsx, 端口 10588)...
start "Toonflow 后端 (10588)" /D "%APP_DIR%" cmd /k "npx nodemon --inspect --exec tsx src/app.ts"

echo [3/3] 启动前端 (Vite dev server, 端口 50188)...
start "Toonflow 前端 (50188)" /D "%WEB_DIR%" cmd /k "npx vite --host"

echo.
echo 两个服务窗口已分别打开，等待就绪后浏览器访问:
echo     http://127.0.0.1:50188
echo.
echo 停止服务：分别在对应窗口按 Ctrl+C（本窗口关闭不影响服务）
pause

