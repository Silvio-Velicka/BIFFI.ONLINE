@echo off
cd /d "%~dp0"
git add .
git commit -m "Deploy update"
git push origin main
echo.
echo === Deploy concluído! ===
echo Pressione qualquer tecla para continuar...
pause >nul
