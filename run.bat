@echo off
title Remik - Polish Rummy
cd /d "%~dp0"
echo.
echo   ♠ ♥ ♦ ♣  Remik — Polish Rummy  ♠ ♥ ♦ ♣
echo.
echo   --- NETWORK INFO ---
echo   Your Local IP Address(es):
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr "IPv4"') do echo     %%a
echo.
echo   TO PLAY WITH FRIENDS:
echo   1. If they are on your WiFi: Give them your Local IP (above) + :3000
echo      Example: http://192.168.1.5:3000
echo   2. If they are external: You need to Port Forward 3000 on your router 
echo      to your local IP, then give them your Public IP + :3000.
echo.
echo   Starting server...
echo.
node server.cjs
pause

