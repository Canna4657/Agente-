@echo off
title Job Agent - API Server
echo.
echo  ================================
echo   JOB AGENT - API Server
echo  ================================
echo.
echo  Iniciando servidor en http://localhost:5000
echo  Para detenerlo: cerrar esta ventana
echo.

cd /d "%~dp0"
python api.py

echo.
echo  [El servidor se detuvo]
pause
