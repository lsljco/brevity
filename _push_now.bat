@echo off
if exist .git\index.lock del /f .git\index.lock
git add -A
git commit -m "Calendar: actuals overlay + balance override edit"
git push
del /f "%~f0"
