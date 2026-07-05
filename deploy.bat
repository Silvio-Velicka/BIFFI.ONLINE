@echo off
cd /d "%~dp0"

if exist ".git\index.lock" del /f /q ".git\index.lock"
if exist ".git\rebase-merge" rd /s /q ".git\rebase-merge"
if exist ".git\rebase-apply" rd /s /q ".git\rebase-apply"

git add .
git commit -m "Deploy update"

echo Sincronizando com o GitHub...
git fetch origin
git merge origin/main --no-edit
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
