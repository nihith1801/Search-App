@echo off
echo Building and starting the File Search Application...
cd ui
echo Building UI...
call npm run build
cd ..
echo Building complete. Starting application...
call Start-FileSearch.cmd

echo Application started. Press Ctrl+Space to activate the search. 