@echo off
chcp 65001 >nul
title Biblius - server
cd /d "%~dp0server"
where node >nul 2>nul || (echo Node.js не найден. Установите Node.js 20 или новее: https://nodejs.org & pause & exit /b 1)
if not exist .env (echo Нет файла server\.env - скопируйте .env.example и заполните. & pause & exit /b 1)
start "" http://localhost:3001
node server.mjs
pause
