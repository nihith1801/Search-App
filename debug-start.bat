@echo off
echo Debug Starting File Search Application with logging...
echo Logs will be saved to debug-log.txt
echo.

:: Create log file and timestamp
echo ===== DEBUG LOG %date% %time% ===== > debug-log.txt
echo. >> debug-log.txt

:: Set environment variable for more verbose logging
set NODE_ENV=development
set DEBUG=electron:*,app:*
set ELECTRON_ENABLE_LOGGING=true

:: Ensure build exists
if not exist "build\Release\searchAddon.node" (
    if not exist "build\Release\searchAddon.js" (
        echo [DEBUG] Build artifacts not found, running build script... >> debug-log.txt
        
        if exist build.js (
            echo Running build script... >> debug-log.txt
            node build.js >> debug-log.txt 2>&1
            if errorlevel 1 (
                echo [DEBUG] Build failed with exit code %errorlevel% >> debug-log.txt
                echo Build failed with exit code %errorlevel%
                goto :end
            )
        ) else (
            echo [DEBUG] Error: build.js not found >> debug-log.txt
            echo Error: build.js not found
            goto :end
        )
    )
)

:: Copy the main.js file to temporary electron-debug.js file to enable more logging
echo [DEBUG] Creating debug versions of files... >> debug-log.txt
if exist "electron\main.js" (
    echo // Debug version > electron\main-debug.js
    echo console.log('Debug mode enabled'); >> electron\main-debug.js
    echo const DEBUG_MODE = true; >> electron\main-debug.js
    type electron\main.js >> electron\main-debug.js
)

:: Start the Electron app with output redirection
echo [DEBUG] Starting Electron app... >> debug-log.txt
echo Starting Electron app in debug mode...

:: Use electron directly with debugging
cd electron
echo Command: npx electron main-debug.js --trace-warnings >> ..\debug-log.txt
npx electron main-debug.js --trace-warnings >> ..\debug-log.txt 2>&1

:: Return to original directory
cd ..

echo [DEBUG] Application has exited. >> debug-log.txt

:end
echo.
echo Application has closed. Debug log saved to debug-log.txt
echo Displaying last 15 lines of log:
echo -------------------------------------------
powershell -Command "if (Test-Path debug-log.txt) { Get-Content -Path debug-log.txt -Tail 15  }"
echo -------------------------------------------
echo.
echo Press any key to close this window.
pause 