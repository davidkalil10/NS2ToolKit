@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0NS2 Assistente.exe" (
    start "" "%~dp0NS2 Assistente.exe"
    exit /b
)
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0Painel-NS2.ps1"
if errorlevel 1 pause
