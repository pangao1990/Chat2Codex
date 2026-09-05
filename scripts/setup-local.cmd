@echo off
setlocal
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-local.ps1"
if errorlevel 1 (
  echo.
  echo Setup failed. Read the error above, then see docs\DEVELOPMENT.md.
  pause
  exit /b 1
)
echo.
echo Setup completed successfully. You may close this window.
pause
