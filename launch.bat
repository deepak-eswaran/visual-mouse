@echo off
title HoloHand Virtual Mouse
cd /d "%~dp0"
py -3.11 -m venv .venv
if not exist ".venv\Scripts\python.exe" (
  echo Could not create Python environment. Install Python 3.11 and try again.
  pause
  exit /b 1
)
call .venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python main.py
pause
