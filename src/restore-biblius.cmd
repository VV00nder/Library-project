@echo off
chcp 65001 >nul
setlocal
rem Восстановление базы 1С «Библиус» из резервной копии.
rem   restore-biblius.cmd "папка копии"                 - вернуть копию в рабочую базу
rem   restore-biblius.cmd "папка копии" C:\Biblius-test - развернуть копию в отдельную папку для проверки
set "SRC=%~1"
set "DB=%USERPROFILE%\Documents\Biblius"
if "%SRC%"=="" goto :usage
if not exist "%SRC%\1Cv8.1CD" goto :nosrc
if not "%~2"=="" goto :totest
net session >nul 2>&1 || goto :noadmin
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm"') do set "TS=%%i"
echo Рабочая база %DB% будет заменена копией из %SRC%.
echo Текущая база сохранится в backup\перед-восстановлением_%TS%.
echo Закройте Конфигуратор и клиент 1С.
pause
mkdir "%~dp0backup\перед-восстановлением_%TS%" >nul 2>&1
iisreset /stop >nul
copy /y "%DB%\1Cv8.1CD" "%~dp0backup\перед-восстановлением_%TS%\1Cv8.1CD" >nul || goto :fail
copy /y "%SRC%\1Cv8.1CD" "%DB%\1Cv8.1CD" >nul || goto :fail
iisreset /start >nul
echo Готово. Перезапустите start-biblius.cmd и проверьте сайт.
pause
exit /b 0
:totest
mkdir "%~2" >nul 2>&1
copy /y "%SRC%\1Cv8.1CD" "%~2\1Cv8.1CD" >nul || goto :fail2
echo Копия развёрнута в %~2.
echo Добавьте её в список баз 1С «Добавить - Добавление существующей базы» и откройте:
echo данные должны совпасть с рабочей базой на дату копии.
pause
exit /b 0
:fail
iisreset /start >nul
:fail2
echo Не удалось скопировать файл базы. Закройте все сеансы 1С и повторите.
pause
exit /b 1
:noadmin
echo Запустите файл от имени администратора: нужно на время остановить IIS.
pause
exit /b 1
:nosrc
echo В папке "%SRC%" нет файла 1Cv8.1CD.
pause
exit /b 1
:usage
echo Укажите папку резервной копии, например: restore-biblius.cmd backup\2026-11-15_19-30
pause
exit /b 1
