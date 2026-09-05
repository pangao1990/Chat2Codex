@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bun-local.ps1" %*
exit /b %errorlevel%
