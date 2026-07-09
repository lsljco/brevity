@echo off
cd /d "C:\Users\ljenk\Downloads\lslj-family-hub\lslj-family-hub"
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock del /f .git\HEAD.lock
git add -A
git status
set /p msg="Commit message: "
if "%msg%"=="" set msg=Update
git commit -m "%msg%"
git push
pause
