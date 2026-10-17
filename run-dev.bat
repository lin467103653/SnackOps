@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem 可选参数：端口号。默认 5000。用法：run-dev.bat 5001
set "PORT=%~1"
if "%PORT%"=="" set "PORT=5000"
set "DEPLOY_RUN_PORT=%PORT%"

echo ============================================
echo  SnackOps - dev server
echo  dir  : %CD%
echo  port : %PORT%
echo ============================================
echo.

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] pnpm not found. Install it first:
  echo         npm i -g pnpm@10
  echo.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo [ERROR] package.json not found. Put this .bat in the project root.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [INFO] node_modules missing, running pnpm install ...
  call pnpm install
  if errorlevel 1 (
    echo [ERROR] pnpm install failed.
    pause
    exit /b 1
  )
)

echo [INFO] starting ... open http://127.0.0.1:%PORT%
echo [INFO] keep this window open. Press Ctrl+C to stop.
echo.
call pnpm dev

echo.
echo [INFO] server exited. Press any key to close.
pause >nul
