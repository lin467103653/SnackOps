@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PORT=%~1"
if "%PORT%"=="" set "PORT=5000"
set "BASE=http://127.0.0.1:%PORT%"

echo ============================================
echo  SnackOps - local checks
echo  base : %BASE%
echo ============================================
echo.

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] pnpm not found. Install it first: npm i -g pnpm@10
  pause
  exit /b 1
)

echo [1/4] typecheck ...
call pnpm typecheck
if errorlevel 1 goto :fail

echo.
echo [2/4] lint ...
call pnpm lint
if errorlevel 1 goto :fail

echo.
echo [3/4] unit tests (eval scorer) ...
call pnpm test:scorer
if errorlevel 1 goto :fail

echo.
echo [4/4] API verification (server must be running on %BASE%) ...
set "SNACKOPS_BASE_URL=%BASE%"
call pnpm verify
if errorlevel 1 (
  echo.
  echo [WARN] verify failed. Is the server running? Start it with run-dev.bat first.
  pause
  exit /b 1
)

echo.
echo [OK] all checks passed.
pause
exit /b 0

:fail
echo.
echo [ERROR] a check failed, see messages above.
pause
exit /b 1
