@echo off
title HoloHand Virtual Mouse
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo First run launch.bat to install dependencies.
  pause
  exit /b 1
)
call .venv\Scripts\activate
python main.py
pause
