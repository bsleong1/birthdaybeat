@echo off
rem Creates this week's birthday PDF and card images in the "output" folder.
cd /d "%~dp0"
"C:\Program Files\nodejs\node.exe" weekly.js %*
