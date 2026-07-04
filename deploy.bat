@echo off
cd /d "%~dp0"

if exist ".git\index.lock" (
  echo Removendo trava antiga do git...
  del /f /q ".git\index.lock"
)

git add .
git commit -m "Deploy update"

echo Sincronizando com o GitHub...
git pull origin main --rebase

if errorlevel 1 (
  echo.
  echo === ERRO: nao foi possivel sincronizar automaticamente. ===
  echo Rode "git status" manualmente para ver o conflito.
  pause
  exit /b 1
)

git push origin main

echo.
echo === Deploy concluido! ===
echo Pressione qualquer tecla para continuar...
pause >nul
