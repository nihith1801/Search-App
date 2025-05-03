# File Search Launcher - PowerShell Edition
# This script automatically enables script execution and runs the application

# Self-elevate the script if required
if (-Not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] 'Administrator')) {
    Write-Host "Starting File Search App..." -ForegroundColor Green
}

# Set environment variables
$env:ELECTRON_ENABLE_LOGGING = "true"
$env:NODE_OPTIONS = "--max-old-space-size=4096"
$env:ELECTRON_NO_ATTACH_CONSOLE = "false"
$env:ELECTRON_ENABLE_STACK_DUMPING = "1"
$env:FORCE_STUB = "true"

# Change to electron directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$electronPath = Join-Path $scriptPath "electron"
Push-Location $electronPath

try {
    # Display startup message
    Write-Host "Launching File Search application..." -ForegroundColor Cyan
    Write-Host "Press Ctrl+Space to use the search hotkey once launched" -ForegroundColor Yellow

    # Run Electron with appropriate flags
    npx electron --trace-warnings --no-sandbox --js-flags="--max-old-space-size=4096" .
    
    # Check if execution was successful
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error running Electron. Exit code: $LASTEXITCODE" -ForegroundColor Red
        Write-Host "Press any key to exit..."
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    }
}
catch {
    # Handle exceptions
    Write-Host "An error occurred: $_" -ForegroundColor Red
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
finally {
    # Always return to original directory
    Pop-Location
} 