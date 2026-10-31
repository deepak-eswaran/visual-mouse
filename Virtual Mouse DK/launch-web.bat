@echo off
title HoloHand Gesture 3D Studio
cd /d "%~dp0showroom"
echo.
echo ============================================
echo        HOLOHAND - GESTURE 3D STUDIO
echo ============================================
echo.
echo Starting local website at http://localhost:8000
echo Browser camera preview stays inside the page.
echo Keep this terminal window open while testing.
echo.
start "" "http://localhost:8000"
py -m http.server 8000
pause
