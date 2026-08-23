@echo off
setlocal
cd /d "%~dp0"
title Ascension - Launcher Local
cls
echo ==========================================
echo            ASCENSION - LOCAL
echo ==========================================
echo.
echo [1] Abrir jogo
echo [2] Abrir editor
echo.
choice /C 12 /N /M "Escolha 1 ou 2: "
if errorlevel 2 (
  call "%~dp0start-editor.bat"
  exit /b
)
call "%~dp0start-game.bat"
endlocal
