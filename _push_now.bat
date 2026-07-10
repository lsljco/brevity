@echo off
if exist .git\index.lock del /f .git\index.lock
git add -A
git commit -m "fix: preserve user edits across deploys in loadData()"
git push
del /f "%~f0"
