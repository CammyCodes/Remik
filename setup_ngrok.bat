@echo off
title Setup and Run ngrok Tunnel
echo.

REM Check if ngrok is already installed
where ngrok >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo   Ngrok is already installed. Skipping installation.
) else (
    echo   Installing ngrok via winget...
    winget install Ngrok.Ngrok
)

echo.
echo   ------------------------------------------------------------
echo   Configuring ngrok...
REM Your ngrok Authtoken
set AUTHTOKEN=39m1rsbRHVs6wHX8wGS6sUN9Mpx_89Lz1uFKSC1aDpx4NMz1a

ngrok config add-authtoken %AUTHTOKEN%
echo   ------------------------------------------------------------

echo.
echo   Starting local server (if not already running)...
start /B node server.cjs

echo.
echo   Waiting for server to spin up...
timeout /t 3 >nul

echo.
echo   Starting ngrok tunnel on port 3000...
echo   Look for the "Forwarding" line below (e.g., https://random-name.ngrok-free.app)
echo   Share that URL with your friends!
echo.
ngrok http 3000
pause
