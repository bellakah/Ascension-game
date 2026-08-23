@echo off
setlocal
cd /d "%~dp0"
title Ascension - Editor Local
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-local.ps1" -Mode editor
if errorlevel 1 (
  echo.
  echo O launcher encontrou um erro. Veja a mensagem acima.
  pause
)
endlocal
