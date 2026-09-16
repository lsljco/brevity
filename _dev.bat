@echo off
cd /d "C:\Users\ljenk\Downloads\lslj-family-hub\lslj-family-hub"

echo Checking for Netlify CLI...
where netlify >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo Netlify CLI not found. Installing...
  npm install -g netlify-cli
)

echo.
echo Starting local dev server...
echo App will open at: http://localhost:8888
echo Plaid functions available at: http://localhost:8888/.netlify/functions
echo.
echo Press Ctrl+C to stop.
echo.
netlify dev
pause
