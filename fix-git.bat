@echo off
cd /d "%~dp0"
set "GIT_EDITOR=cmd /c exit 0"

echo Abortando rebase travado...
git rebase --abort >nul 2>&1

echo Buscando atualizacoes do GitHub...
git fetch origin

echo Tentando sincronizar novamente...
git rebase origin/main
if errorlevel 1 goto resolveconflict

goto pushnow

:resolveconflict
echo.
echo Conflito detectado (esperado). Resolvendo automaticamente, mantendo a exclusao do medidas-propagandas.txt...
git rm -f "NectarMine/medidas-propagandas.txt" >nul 2>&1
git rebase --continue
if errorlevel 1 goto rebasefail

:pushnow
echo.
echo Enviando para o GitHub...
git push origin main
if errorlevel 1 goto pusherror

echo.
echo === Correcao concluida! Pode voltar a usar o deploy.bat normalmente a partir de agora. ===
pause
exit /b 0

:rebasefail
echo.
echo === Ainda ha conflitos pendentes que nao foram resolvidos automaticamente. ===
echo Rode "git status" nesta pasta pelo cmd e me mande o resultado.
pause
exit /b 1

:pusherror
echo.
echo === ERRO ao enviar para o GitHub. Rode "git status" e me avise. ===
pause
exit /b 1
