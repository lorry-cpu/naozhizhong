@echo off
chcp 65001 >nul
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js。请先安装 Node.js 并重新运行。
  pause
  exit /b 1
)
node launcher\serve.cjs
if errorlevel 1 pause
