@echo off
setlocal
rem Orbital Fire Support - double-click to play.
rem Opens the game in its own window using Microsoft Edge (built into Windows) or Google Chrome.
rem If neither is found it opens the game in your default browser instead.

set "GAME=%~dp0Orbital-Fire-Support.html"
if not exist "%GAME%" echo Could not find Orbital-Fire-Support.html next to this file. Unzip the whole folder first.
if not exist "%GAME%" pause
if not exist "%GAME%" exit /b 1

set "URL=file:///%GAME:\=/%"
set "URL=%URL: =%%20%"

set "BROWSER="
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"

if defined BROWSER goto :windowed
start "" "%GAME%"
exit /b 0

:windowed
start "" "%BROWSER%" --app="%URL%" --window-size=1280,760
exit /b 0
