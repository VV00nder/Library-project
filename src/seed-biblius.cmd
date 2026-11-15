@echo off
chcp 65001 >nul
cd /d "%~dp0server"
node scripts\seed.mjs
pause
