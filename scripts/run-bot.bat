@echo off
cd /d "%~dp0"
node refresh-inpi-token.js >> logs.txt 2>&1
