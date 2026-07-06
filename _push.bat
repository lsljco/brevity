@echo off
cd /d "C:\Users\ljenk\Downloads\lslj-family-hub\lslj-family-hub"
if exist .git\index.lock del /f .git\index.lock
git rm -r --cached .
git add -A
git commit -m "Restore all project files + 7-pillar nav + monthly budget view"
git push
pause
