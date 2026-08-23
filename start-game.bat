@echo off
setlocal
cd /d "%~dp0"
title Ascension - Jogo Local
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-local.ps1" -Mode game
if errorlevel 1 (
  echo.
  echo O launcher encontrou um erro. Veja a mensagem acima.
  pause
)
endlocal
