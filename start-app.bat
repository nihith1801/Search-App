@echo off
echo Starting File Search Application...
echo.

:: Run PowerShell script with proper parameters and wait for completion
PowerShell -NoProfile -ExecutionPolicy Bypass -Command "& {Start-Process PowerShell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0start-app.ps1\"' -Verb RunAs -Wait}"

echo.
echo Application has exited. Press any key to close this window.
pause 