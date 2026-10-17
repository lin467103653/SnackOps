@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PORT=%~1"
if "%PORT%"=="" set "PORT=5000"
set "DEPLOY_RUN_PORT=%PORT%"

echo ============================================
echo  SnackOps - production start (build + start)
echo  dir  : %CD%
echo  port : %PORT%
echo ============================================
echo.

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] pnpm not found. Install it first: npm i -g pnpm@10
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [INFO] installing dependencies ...
  call pnpm install
  if errorlevel 1 goto :fail
)

echo [INFO] building ...
call pnpm build
if errorlevel 1 goto :fail

echo.
echo [INFO] starting ... open http://127.0.0.1:%PORT%
call pnpm start

echo.
echo [INFO] server exited. Press any key to close.
pause >nul
exit /b 0

:fail
echo.
echo [ERROR] step failed, see messages above.
pause
exit /b 1
