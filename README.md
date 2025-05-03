# File Search App

A high-performance file search application built with Electron and JavaScript, optimized for Windows systems.

## Getting Started
![image](https://github.com/user-attachments/assets/d935e7b3-d366-4a0b-9ca3-b82d01dffa63)


### Windows 10/11 Users (Recommended Method)

1. **Run with the Start-FileSearch.cmd file:**
   - Double-click the `Start-FileSearch.cmd` file in the root directory

2. **Run with PowerShell:**
   - Right-click on `Start-FileSearch.ps1` and select "Run with PowerShell"
   - If you encounter script execution errors, run PowerShell as Administrator and type:
     ```
     Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope CurrentUser
     ```

3. **Traditional Batch Method:**
   - Double-click the `run_now.bat` file in the root directory

### About EXE Files

This application doesn't use a traditional .exe file. Instead, it runs using Electron, which is a JavaScript runtime that powers the application. The main ways to start the application are through the batch and PowerShell scripts listed above.

## Building the Application

If you need to rebuild the UI after making changes:

1. Run the `build-ui.bat` script in the root directory
2. Once complete, launch the application using one of the methods above

## Features

- Fast file search across all drives
- Fuzzy searching to find files even with partial names
- Cached indexes for quick startup
- Extension-based filtering (e.g., `ext:pdf` to find PDF files)
- Path-based searching (e.g., `path:documents` to find files in document folders)
- Recently opened files tracking
- Transparent, minimal UI with just the search box

## Search Syntax

- **Basic search:** Just type the filename or part of it
- **Extension search:** Type `ext:extension` (e.g., `ext:pdf`)
- **Path search:** Type `path:foldername` (e.g., `path:documents`)
- **Fuzzy search:** Enabled by default, matches partial terms

## Keyboard Shortcuts

- **Ctrl+Space:** Show/hide the application (global hotkey)
- **Enter:** Open the selected file
- **Escape:** Hide the application
- **Up/Down arrows:** Navigate search results

## Troubleshooting

If you encounter any issues:

1. Check if the application is running with the correct permissions
2. Try running the application with the `run_now.bat` file as an alternative
3. Make sure Node.js and Electron are properly installed
4. Look for error messages in the `logs` directory

## Technical Details

This application uses:

- Electron for the UI framework
- Pure JavaScript indexing without SQLite dependencies
- High-performance in-memory indexes with disk caching
- Async file crawling for responsive UI

## Performance Optimization

The application uses an in-memory indexer with these optimizations:

- Caching of file indexes between sessions
- Multiple specialized indexes for different search types
- Asynchronous directory crawling with UI responsiveness
- Result relevance sorting based on match quality

## License

MIT 
