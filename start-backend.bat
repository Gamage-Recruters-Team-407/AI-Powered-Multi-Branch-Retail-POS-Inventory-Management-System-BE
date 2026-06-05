@echo off
cd /d "%~dp0"
node src\server.js > backend.bat.log 2>&1
