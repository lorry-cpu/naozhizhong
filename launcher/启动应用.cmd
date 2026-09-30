@echo off & chcp 65001>nul & cd /d "%~dp0.." & where node>nul 2>nul || (echo Node.js is required. Install Node.js and try again. & pause & exit /b 1) & node launcher\serve.cjs & if errorlevel 1 pause
