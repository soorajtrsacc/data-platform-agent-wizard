@echo off
echo.
echo  Pipeline Coding Agent - Dev Server
echo  ===================================
echo.

cd /d "%~dp0"

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Node.js is not installed or not in PATH.
    echo  Download from https://nodejs.org
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo  Installing dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo  ERROR: npm install failed.
        pause
        exit /b 1
    )
)

echo  Starting server on http://localhost:3001
echo  Press Ctrl+C to stop.
echo.
npm run dev
