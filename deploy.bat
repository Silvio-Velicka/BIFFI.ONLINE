@echo off
cd /d "%~dp0"

if exist ".git\index.lock" del /f /q ".git\index.lock"

git add .
git commit -m "Deploy update"

echo Sincronizando com o GitHub...
git pull origin main --rebase
if errorlevel 1 goto pullerror

git push origin main

echo.
echo === Deploy concluido! ===
echo Pressione qualquer tecla para continuar...
pause >nul
exit /b 0

:pullerror
echo.
echo === ERRO: nao foi possivel sincronizar automaticamente. ===
echo Rode "git status" manualmente para ver o conflito.
pause
exit /b 1
