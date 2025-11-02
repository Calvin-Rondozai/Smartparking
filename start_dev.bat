@echo off
REM SmartParking Dev Starter - Batch Wrapper
REM This file allows double-clicking to start the dev servers
REM It automatically bypasses PowerShell execution policy

echo ================ SmartParking Dev Starter ================
echo Starting development servers...
echo ===========================================================

REM Get the directory where this batch file is located
cd /d "%~dp0"

REM Run PowerShell with execution policy bypass
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0start_dev.ps1" %*

REM If there's an error, pause so user can see it
if errorlevel 1 (
    echo.
    echo ERROR: Failed to start development servers
    echo.
    pause
)

