@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0node-local.ps1" %*
exit /b %errorlevel%
