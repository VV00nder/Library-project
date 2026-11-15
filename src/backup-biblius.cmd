@echo off
chcp 65001 >nul
setlocal
rem Резервная копия базы 1С «Библиус» и настроек без паролей (ТЗ, раздел 6; T-18).
rem Использование: backup-biblius.cmd [папка базы 1С]. По умолчанию — %USERPROFILE%\Documents\Biblius
set "DB=%USERPROFILE%\Documents\Biblius"
if not "%~1"=="" set "DB=%~1"
net session >nul 2>&1 || goto :noadmin
if not exist "%DB%\1Cv8.1CD" goto :nodb
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm"') do set "TS=%%i"
set "OUT=%~dp0backup\%TS%"
mkdir "%OUT%" >nul 2>&1
echo Перед копированием закройте Конфигуратор и клиент 1С.
echo На время копирования будет остановлен IIS - сайт покажет «1С недоступна».
pause
iisreset /stop >nul
copy /y "%DB%\1Cv8.1CD" "%OUT%\1Cv8.1CD" >nul
set "ERR=%errorlevel%"
iisreset /start >nul
if not "%ERR%"=="0" goto :copyfail
if exist "%~dp0server\.env" powershell -NoProfile -Command "(Get-Content -Encoding UTF8 '%~dp0server\.env') -replace '^([A-Z_]*PASSWORD)=.*','$1=' | Set-Content -Encoding UTF8 '%OUT%\env-без-паролей.txt'"
> "%OUT%\сведения.txt" (
  echo Дата копии: %TS%
  echo База 1С: %DB%
  for /f "delims=" %%v in ('node -v 2^>nul') do echo Node.js: %%v
)
certutil -hashfile "%OUT%\1Cv8.1CD" SHA256 >> "%OUT%\сведения.txt"
echo.
echo Готово: %OUT%
echo Проверка восстановления: restore-biblius.cmd "%OUT%" C:\Biblius-test
pause
exit /b 0
:noadmin
echo Запустите файл от имени администратора: нужно на время остановить IIS.
pause
exit /b 1
:nodb
echo Не найдена база 1С: %DB%\1Cv8.1CD
pause
exit /b 1
:copyfail
echo Не удалось скопировать базу. Закройте все сеансы 1С и повторите.
pause
exit /b 1
