@echo off
cd /d "%~dp0"
set "GIT_EDITOR=cmd /c exit 0"

echo Limpando estado de rebase travado (se houver)...
if exist ".git\rebase-merge" rd /s /q ".git\rebase-merge"
if exist ".git\rebase-apply" rd /s /q ".git\rebase-apply"
if exist ".git\index.lock" del /f /q ".git\index.lock"
git rebase --abort >nul 2>&1

echo Salvando suas alteracoes locais...
git add -A
git commit -m "Deploy update" >nul 2>&1

echo Buscando atualizacoes do GitHub...
git fetch origin

echo Sincronizando (merge)...
git merge origin/main --no-edit
if errorlevel 1 goto mergeerror

echo.
echo Enviando para o GitHub...
git push origin main
if errorlevel 1 goto pusherror

echo.
echo === Correcao concluida! Pode voltar a usar o deploy.bat normalmente a partir de agora. ===
pause
exit /b 0

:mergeerror
echo.
echo === Conflito de merge (nao resolvido automaticamente). Rode "git status" nesta pasta pelo cmd e me mande o resultado. ===
pause
exit /b 1

:pusherror
echo.
echo === ERRO ao enviar para o GitHub. Rode "git status" e me avise. ===
pause
exit /b 1
