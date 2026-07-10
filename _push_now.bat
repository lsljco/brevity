@echo off
if exist .git\index.lock del /f .git\index.lock
git add -A
git commit -m "fix: safer loadData — use stored transactions directly, guard empty state"
git push
del /f "%~f0"
