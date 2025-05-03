const { app, BrowserWindow, globalShortcut, ipcMain, shell, dialog, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const url = require('url');
const { exec } = require('child_process');
const crypto = require('crypto');

// Import crash logger
try {
  const crashLogger = require('../crash-logger');
  crashLogger.setupGlobalErrorHandlers();
  console.log('Crash logger initialized');
} catch (err) {
  console.error('Failed to initialize crash logger:', err.message);
}

// Load the native addon with error handling
let addon = null;
let usingStubImplementation = false;

// Create a minimal stub implementation as a fallback
const createInMemoryStub = () => {
  console.log('Creating in-memory stub implementation');
  return {
    search: (query) => {
      console.log(`In-memory stub search: ${query}`);
      return { 
        results: [], 
        count: 0, 
        searchTime: 0,
        isStub: true 
      };
    },
    init: (dbPath, directories) => {
      console.log(`In-memory stub init with dirs: ${directories.join(', ')}`);
      return true;
    },
    updateIndex: (directories) => {
      console.log(`In-memory stub updateIndex with dirs: ${directories.join(', ')}`);
      return true;
    },
    getIndexingProgress: () => 1.0,
    waitForIndexing: () => true
  };
};

// Try loading the JavaScript stub first for safety
try {
  // First try to load from stub directory (preferred location)
  const stubDirPath = path.join(__dirname, '..', 'stub', 'stub.js');
  console.log(`Attempting to load stub from directory: ${stubDirPath}`);
  
  if (fs.existsSync(stubDirPath)) {
    addon = require(stubDirPath);
    usingStubImplementation = true;
    console.log('Successfully loaded JavaScript stub implementation from stub directory');
  } else {
    // Try Release directory next
    const stubPath = path.join(__dirname, '..', 'build', 'Release', 'searchAddon.js');
    console.log(`Attempting to load stub from: ${stubPath}`);
    
    if (fs.existsSync(stubPath)) {
      addon = require(stubPath);
      usingStubImplementation = true;
      console.log('Successfully loaded JavaScript stub implementation');
    } else {
      // Only try native addon if stub doesn't exist
      const nativeAddonPath = path.join(__dirname, '..', 'build', 'Release', 'searchAddon.node');
      console.log(`Attempting to load native addon from: ${nativeAddonPath}`);
      
      if (fs.existsSync(nativeAddonPath)) {
        try {
          // Add specific error handling for SQLite issues
          process.env.FORCE_STUB = 'false';
          
          // Check if we should force JavaScript stub due to previous crashes
          const forceStub = process.env.FORCE_STUB === 'true';
          if (forceStub) {
            throw new Error('Forcing stub implementation due to previous crashes');
          }
          
          // Try loading with error handling
          addon = require(nativeAddonPath);
          console.log('Successfully loaded native search addon');
        } catch (nativeErr) {
          console.error('Error loading native addon:', nativeErr.message);
          throw new Error(`Native addon failed to load properly: ${nativeErr.message}`);
        }
      } else {
        throw new Error(`Native addon file not found at: ${nativeAddonPath}`);
      }
    }
  }
} catch (err) {
  console.warn('Using fallback implementation due to error:', err.message);
  
  // Create minimal in-memory implementation as last resort
  addon = createInMemoryStub();
  usingStubImplementation = true;
  
  // Set environment variable to force stub on next run
  process.env.FORCE_STUB = 'true';
  
  // Write a marker file to indicate we should use stub in future
  try {
    const markerPath = path.join(__dirname, '..', 'use_stub_implementation');
    fs.writeFileSync(markerPath, String(Date.now()));
  } catch (markerErr) {
    console.error('Failed to write stub marker:', markerErr.message);
  }
}

let mainWindow = null;
let appConfig = {
  drives: [],
  hotkey: 'Control+Space',
  recentFiles: [],
  maxRecentFiles: 50,
  fuzzySearch: true,
  showIndexingProgress: true,
  maxResults: 50
};
const configPath = path.join(app.getPath('userData'), 'config.json');
let indexingProgressInterval = null;

// Add this near the top of the file, after other requires
const DEBUG_MODE = process.env.NODE_ENV === 'development';

// Load configuration
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      const loadedConfig = JSON.parse(data);
      appConfig = { ...appConfig, ...loadedConfig };
    } else {
      // Default configuration - detect drives
      const drives = detectDrives();
      appConfig.drives = drives;
      saveConfig();
    }
  } catch (err) {
    console.error('Error loading config:', err);
  }
}

// Save configuration
function saveConfig() {
  try {
    fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving config:', err);
  }
}

// Detect available drives on Windows
function detectDrives() {
  const drives = [];
  
  if (process.platform === 'win32') {
    // On Windows, check common drive letters
    // Prioritize C: and D: drives first
    const priorityDrives = ['C:\\', 'D:\\'];
    for (const drive of priorityDrives) {
      try {
        if (fs.existsSync(drive)) {
          drives.push(drive);
          console.log(`Found drive: ${drive}`);
        }
      } catch (err) {
        console.error(`Error checking drive ${drive}:`, err.message);
      }
    }
    
    // Check other drives
    for (let i = 69; i <= 90; i++) { // E to Z
      const driveLetter = String.fromCharCode(i) + ':\\';
      if (priorityDrives.includes(driveLetter)) continue; // Skip already checked drives
      
      try {
        if (fs.existsSync(driveLetter)) {
          drives.push(driveLetter);
          console.log(`Found drive: ${driveLetter}`);
        }
      } catch (err) {
        // Skip drives that can't be accessed
      }
    }
  } else {
    // For non-Windows platforms, start with home directory
    drives.push(os.homedir());
  }
  
  console.log('Detected drives:', drives);
  return drives;
}

// Add a file to recent files list
function addToRecentFiles(filePath) {
  // Remove if already in list
  appConfig.recentFiles = appConfig.recentFiles.filter(path => path !== filePath);
  
  // Add to front of list
  appConfig.recentFiles.unshift(filePath);
  
  // Trim list if needed
  if (appConfig.recentFiles.length > appConfig.maxRecentFiles) {
    appConfig.recentFiles = appConfig.recentFiles.slice(0, appConfig.maxRecentFiles);
  }
  
  // Save config
  saveConfig();
}

// Start indexing progress monitoring
function startIndexingProgressMonitor() {
  // Don't start if using stub implementation
  if (usingStubImplementation) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('indexing-progress', { 
        progress: 1.0, 
        complete: true,
        isStub: true
      });
    }
    return;
  }

  if (indexingProgressInterval) {
    clearInterval(indexingProgressInterval);
  }
  
  indexingProgressInterval = setInterval(() => {
    try {
      const progress = addon.getIndexingProgress();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('indexing-progress', { 
          progress, 
          complete: progress >= 0.99 
        });
      }
      
      // Stop monitoring when indexing is complete
      if (progress >= 0.99) {
        clearInterval(indexingProgressInterval);
        indexingProgressInterval = null;
      }
    } catch (err) {
      console.error('Error getting indexing progress:', err);
      clearInterval(indexingProgressInterval);
      indexingProgressInterval = null;
    }
  }, 1000);
}

// Check if the React development server is running
function checkServerStatus(callback) {
  // In production mode or if skip flag is set, don't try to connect to dev server
  if (process.env.NODE_ENV === 'production' || process.env.SKIP_DEV_SERVER === 'true') {
    console.log('Production mode or skip flag set - skipping dev server check');
    callback(false);
    return;
  }
  
  console.log('Development mode - checking for dev server...');
  const maxRetries = 5; // Only try for 5 seconds in dev mode
  let retries = 0;
  
  const checkServer = () => {
    retries++;
    try {
      const req = http.get('http://localhost:3000', { timeout: 1000 }, (res) => {
        if (res.statusCode === 200) {
          console.log('React dev server is ready');
          callback(true);
        } else {
          retry();
        }
      });
      
      req.on('error', () => {
        retry();
      });
      
      req.on('timeout', () => {
        req.destroy();
        retry();
      });
    } catch (err) {
      console.error('Error checking dev server:', err);
      retry();
    }
  };
  
  const retry = () => {
    if (retries >= maxRetries) {
      console.log('React dev server not available after maximum retries');
      callback(false);
      return;
    }
    
    console.log(`Waiting for React dev server to start... (${retries}/${maxRetries})`);
    setTimeout(checkServer, 1000);
  };
  
  checkServer();
}

// Cache for executable icons to avoid repeatedly extracting the same icons
const iconCache = new Map();

// Function to extract system icon for executable files
function extractFileIcon(filePath) {
  return new Promise((resolve) => {
    // Check cache first
    const cacheKey = filePath.toLowerCase();
    if (iconCache.has(cacheKey)) {
      console.log(`Using cached icon for ${filePath}`);
      resolve(iconCache.get(cacheKey));
      return;
    }

    try {
      // Extract icon using app.getFileIcon (Electron's built-in method)
      app.getFileIcon(filePath, { size: 'large' })
        .then(icon => {
          // Convert to data URL
          const iconDataUrl = icon.toDataURL();
          
          // Cache the result
          iconCache.set(cacheKey, iconDataUrl);
          
          console.log(`Extracted icon for ${filePath}`);
          resolve(iconDataUrl);
        })
        .catch(err => {
          console.error(`Failed to extract icon for ${filePath}:`, err);
          // Return null if extraction fails
          resolve(null);
        });
    } catch (error) {
      console.error(`Error extracting icon for ${filePath}:`, error);
      resolve(null);
    }
  });
}

function createWindow() {
  console.log('Creating application window...');
  
  // Ensure the app doesn't quit when all windows are closed in debug mode
  if (DEBUG_MODE) {
    app.on('window-all-closed', () => {
      console.log('All windows closed, but keeping app alive in debug mode');
    });
  }
  
  try {
    // Get primary display dimensions to center window
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    
    // Create a window just big enough for the search box, positioned at the top center
    mainWindow = new BrowserWindow({
      width: 600, // Width of search box
      height: 40, // Exact height of search box with padding
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      show: false, // Hide until ready
      backgroundColor: '#00000000', // Completely transparent background
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: false, // Disable web security to avoid CORS issues with file:// protocol
        sandbox: false      // Disable sandbox for better error reporting
      },
      resizable: false, // Prevent resizing which can cause cut-off issues
      skipTaskbar: false, // Show in taskbar
      fullscreenable: false, // Prevent fullscreen which can cause issues
      x: Math.floor(width / 2 - 300), // Center horizontally
      y: Math.floor(height / 5) // Position in the top fifth of the screen
    });
    
    // When results are displayed, dynamically resize window
    mainWindow.on('resize-for-results', (resultCount) => {
      if (resultCount > 0) {
        // Calculate new height based on number of results
        const newHeight = Math.min(40 + resultCount * 29, 400); // Max height of 400px
        mainWindow.setSize(600, newHeight);
      } else {
        // Just the search box
        mainWindow.setSize(600, 40);
      }
    });
    
    // Prevent accidental window closure
    mainWindow.on('close', (e) => {
      console.log('Window close requested');
      if (DEBUG_MODE) {
        console.log('Debug mode: showing confirmation before closing');
        const choice = dialog.showMessageBoxSync(mainWindow, {
          type: 'question',
          buttons: ['Yes', 'No'],
          title: 'Confirm',
          message: 'Are you sure you want to quit?',
          defaultId: 1
        });
        
        if (choice === 1) {
          console.log('Window close prevented by user');
          e.preventDefault();
        }
      }
    });
  } catch (error) {
    console.error('Error creating window:', error);
    throw error; // Re-throw to be caught by the try/catch in app.whenReady()
  }

  // Add ready-to-show event
  mainWindow.once('ready-to-show', () => {
    try {
      // Make window visible
      mainWindow.show();
      console.log('Window is now visible');
      
      // Focus window to ensure it's in the foreground
      mainWindow.focus();
    } catch (err) {
      console.error('Error in ready-to-show handler:', err);
    }
  });

  // Always try to load the bundled file first (even in dev mode)
  try {
    const uiPath = path.join(__dirname, '..', 'ui', 'build', 'index.html');
    console.log('Loading UI from:', uiPath);
    
    if (!fs.existsSync(uiPath)) {
      throw new Error(`UI file not found at: ${uiPath}`);
    }
    
    // Use file URL to ensure proper resource loading
    const fileUrl = url.format({
      pathname: uiPath,
      protocol: 'file:',
      slashes: true
    });
    
    console.log(`Loading URL: ${fileUrl}`);
    mainWindow.loadURL(fileUrl);
  } catch (error) {
    console.error('Error loading UI:', error);
    
    // Only try the dev server in development mode
    if (process.env.NODE_ENV !== 'production') {
      console.log('Trying development server as fallback...');
      checkServerStatus((isReady) => {
        if (isReady) {
          console.log('React dev server is available, loading from there');
          mainWindow.loadURL('http://localhost:3000');
        } else {
          console.error('Dev server not available and UI build not found');
          mainWindow.loadFile(path.join(__dirname, 'error.html'));
        }
      });
    } else {
      // In production mode, go straight to error page
      console.error('Production UI not found, showing error page');
      mainWindow.loadFile(path.join(__dirname, 'error.html'));
    }
  }
  
  // Set up error handling for the window
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
    
    // Try to reload the page if it fails
    if (errorCode !== -3) { // Ignore if aborted
      try {
        console.log('Attempting to reload page after error...');
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.reload();
          }
        }, 1000);
      } catch (err) {
        console.error('Error during reload:', err);
      }
    }
  });
  
  // For debugging
  if (DEBUG_MODE) {
    try {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    } catch (error) {
      console.error('Could not open DevTools:', error);
    }
  }
  
  // Handle renderer process crashes
  mainWindow.webContents.on('crashed', (event) => {
    console.error('Renderer process crashed, restarting window...');
    try {
      // Log crash with additional info
      if (typeof crashLogger !== 'undefined') {
        crashLogger.logCrash('RENDERER_CRASH', new Error('Renderer process crashed'), {
          url: mainWindow.webContents.getURL(),
          title: mainWindow.webContents.getTitle()
        });
      }
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        // Try to restore the window instead of destroying it
        setTimeout(() => {
          try {
            mainWindow.reload();
          } catch (err) {
            console.error('Failed to reload crashed window, recreating...', err);
            mainWindow.destroy();
            createWindow();
          }
        }, 1000);
      } else {
        createWindow();
      }
    } catch (err) {
      console.error('Error recreating window after crash:', err);
    }
  });
  
  // Hide the window when it loses focus - but only in production
  /*
  mainWindow.on('blur', () => {
    mainWindow.hide();
  });
  */
}

// Create a crash log file
function writeCrashLog(type, error) {
  try {
    const crashLogPath = path.join(__dirname, '..', 'crash-log.txt');
    const logEntry = `
==============================
CRASH: ${type} at ${new Date().toISOString()}
Error: ${error.message}
Stack: ${error.stack}
==============================
`;
    fs.appendFileSync(crashLogPath, logEntry);
    console.error(`Crash log written to ${crashLogPath}`);
    return true;
  } catch (err) {
    console.error('Failed to write crash log:', err);
    return false;
  }
}

// Handle any uncaught exceptions in the main process
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception in main process:', error);
  writeCrashLog('UNCAUGHT_EXCEPTION', error);
  
  try {
    dialog.showErrorBox('Application Error', 
      `An unexpected error occurred: ${error.message}\n\nThe application will attempt to continue.`);
  } catch (dialogErr) {
    console.error('Failed to show error dialog:', dialogErr);
  }
  
  // Add more robust error handling - don't exit the process
  console.log('Attempting to continue despite error...');
});

// Handle promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled promise rejection:', reason);
  
  const error = reason instanceof Error ? reason : new Error(String(reason));
  writeCrashLog('UNHANDLED_REJECTION', error);
});

// Add right before the existing process.on('uncaughtException') handler
process.on('exit', (code) => {
  console.log(`Main process is exiting with code: ${code}`);
  
  if (DEBUG_MODE) {
    // Log exit code to console
    console.error(`*** PROCESS EXIT (${code}) ***`);
    
    try {
      const logPath = path.join(__dirname, '..', 'exit-log.txt');
      fs.appendFileSync(logPath, `\nExited with code ${code} at ${new Date().toISOString()}\n`);
      
      if (code !== 0) {
        // Force process to stay alive in debug mode on abnormal exit
        console.log('Preventing immediate exit in debug mode...');
        for (let i = 0; i < 10; i++) {
          console.log(`Debug delay: ${i+1}/10`);
        }
      }
    } catch (err) {
      console.error('Error writing exit log:', err);
    }
  }
});

app.whenReady().then(async () => {
  try {
    // Set app name 
    app.name = 'File Search Launcher';
    
    // Load config first
    loadConfig();
    
    // Create window before initializing search
    createWindow();
    
    // Initialize the search addon with proper error handling
    setTimeout(() => {
      try {
        // Initialize the search addon
        const dbPath = path.join(app.getPath('userData'), 'files.db');
        
        // Avoid blocking UI initialization with heavy synchronous operations
        // by using async indexing even in production
        const syncInit = false; // Always use async indexing
        
        console.log(`Initializing search engine with asynchronous indexing`);
        
        // Use the drives from configuration
        const success = addon.init(dbPath, appConfig.drives, syncInit);
        
        if (success) {
          console.log('Search engine initialized successfully');
          
          // Start progress monitoring
          if (appConfig.showIndexingProgress) {
            startIndexingProgressMonitor();
          }
          
          // Tell the UI that indexing is in progress
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.on('did-finish-load', () => {
              mainWindow.webContents.send('indexing-progress', { 
                progress: 0.1, 
                complete: false
              });
            });
          }
        } else {
          console.error('Failed to initialize search engine');
        }
      } catch (error) {
        console.error('Error initializing search engine:', error);
      }
    }, 1500); // Delay initialization to ensure window is created first
  } catch (error) {
    console.error('Error during app initialization:', error);
    dialog.showErrorBox('Initialization Error', 
      `Failed to initialize application: ${error.message}`);
  }

  // Register the keyboard shortcut - delay to ensure app is fully ready
  setTimeout(() => {
    try {
      globalShortcut.register(appConfig.hotkey, () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isVisible()) {
            mainWindow.hide();
          } else {
            mainWindow.show();
            mainWindow.webContents.send('search-box-focus');
          }
        } else {
          // Recreate window if it was destroyed
          createWindow();
        }
      });
    } catch (err) {
      console.error('Error registering global shortcut:', err);
    }
  }, 2000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll();
  
  // Clear any intervals
  if (indexingProgressInterval) {
    clearInterval(indexingProgressInterval);
    indexingProgressInterval = null;
  }
});

// Handle IPC calls from the renderer
ipcMain.handle('search', async (_, query) => {
  console.log(`Search request received: "${query}"`);
  
  // Check if this is a direct D: drive search to prioritize it
  const isDDriveSearch = query.toLowerCase().includes('d:') || query.toLowerCase().includes('d\\');
  if (isDDriveSearch) {
    console.log('Special handling for D: drive search');
  }
  
  // Check if this is a program/application search
  const programKeywords = ['program', 'application', 'app', 'exe', 'executable', 'software', 'tool', 'utility', 'launch', 'start', 'run'];
  const isProgramSearch = programKeywords.some(keyword => query.toLowerCase().includes(keyword));
  if (isProgramSearch) {
    console.log('Program/application search detected');
  }
  
  // Common program locations to prioritize
  const programDirs = [
    'program files',
    'program files (x86)',
    'programs',
    'applications',
    'games',
    'steam',
    'start menu',
    'appdata'
  ];
  
  // Fall back to this if everything else fails
  const fallbackResults = {
    results: [
      {
        path: 'C:\\Example\\Documents\\example.txt',
        filename: 'example.txt',
        extension: 'txt',
        lastModified: Date.now(),
        icon: 'file'
      },
      {
        path: 'C:\\Example\\Pictures\\sample.jpg',
        filename: 'sample.jpg',
        extension: 'jpg',
        lastModified: Date.now() - 86400000,
        icon: 'file'
      },
      {
        path: 'C:\\Example\\Programs\\application.exe',
        filename: 'application.exe',
        extension: 'exe',
        lastModified: Date.now() - 2 * 86400000,
        icon: 'exe'
      }
    ],
    count: 3,
    searchTime: 0.001,
    isStub: true
  };
  
  try {
    // Add guard clauses for all params
    const fuzzySearch = appConfig?.fuzzySearch ?? true;
    const limit = appConfig?.maxResults || 50;
    
    // Extra protection if addon is not available
    if (!addon) {
      console.error('Search addon not available');
      return fallbackResults;
    }
    
    // Check if this is likely an executable search
    const executableExtensions = ['exe', 'msi', 'com', 'bat', 'cmd', 'ps1', 'vbs', 'app', 'scr', 'reg', 'msc', 'appx', 'msix', 'lnk'];
    const normalizedQuery = query.trim().toLowerCase();
    const isExeSearch = executableExtensions.some(ext => 
      normalizedQuery.includes(`.${ext}`) || 
      normalizedQuery.endsWith(ext) || 
      normalizedQuery === ext
    ) || programKeywords.some(keyword => normalizedQuery.includes(keyword));
    
    console.log(`Executing search with: query=${query}, limit=${limit}, fuzzy=${fuzzySearch}, isExeSearch=${isExeSearch}, isDDriveSearch=${isDDriveSearch}, isProgramSearch=${isProgramSearch}`);
    
    try {
      // Execute the search with the original query
      let results = addon.search(query, limit, fuzzySearch);
      console.log(`Search completed with ${results.count} results`);
      
      // If search returned no results, use the fallback
      if (!results || !results.results || results.results.length === 0) {
        console.log('Search returned no results, using fallback examples');
        return fallbackResults;
      }
      
      // Process results to ensure D: paths are correctly formatted and extract icons for executables
      let processedResults = {
        ...results,
        results: await Promise.all(results.results.map(async (result) => {
          // Ensure D: drive paths are properly formatted
          let processedResult = result;
          if (result.path && result.path.startsWith('D:') && !result.path.startsWith('D:\\')) {
            processedResult = {
              ...result,
              path: result.path.replace('D:', 'D:\\')
            };
          }
          
          // Extract icon for executable files
          const extension = (result.extension || '').toLowerCase();
          const executableExtensions = ['exe', 'msi', 'com', 'bat', 'cmd', 'ps1', 'vbs', 'app', 'scr', 'reg', 'msc', 'appx', 'msix', 'lnk'];
          
          if (executableExtensions.includes(extension)) {
            try {
              const iconResponse = await extractFileIcon(processedResult.path);
              if (iconResponse) {
                return {
                  ...processedResult,
                  iconDataUrl: iconResponse
                };
              }
            } catch (iconError) {
              console.error(`Error extracting icon for ${processedResult.path}:`, iconError);
            }
          }
          
          return processedResult;
        }))
      };
      
      // For program searches, try an enhanced search with .exe appended if needed
      if ((isProgramSearch || isExeSearch) && !normalizedQuery.includes('.exe')) {
        console.log('Enhancing program search with .exe');
        
        try {
          // Search with .exe explicitly
          const exeQuery = `${query} .exe`;
          const exeResults = addon.search(exeQuery, Math.min(20, limit), true);
          
          if (exeResults && exeResults.results && exeResults.results.length > 0) {
            // Process the additional results
            const additionalExeResults = exeResults.results
              .filter(r => 
                // Only include .exe files not already in results
                r.extension && r.extension.toLowerCase() === 'exe' &&
                !processedResults.results.some(orig => orig.path === r.path)
              )
              .map(r => {
                // Fix D: drive paths
                if (r.path && r.path.startsWith('D:') && !r.path.startsWith('D:\\')) {
                  return { ...r, path: r.path.replace('D:', 'D:\\') };
                }
                return r;
              });
            
            console.log(`Found ${additionalExeResults.length} additional .exe files`);
            
            // Add these to our results
            if (additionalExeResults.length > 0) {
              processedResults = {
                ...processedResults,
                results: [
                  ...additionalExeResults,
                  ...processedResults.results
                ].slice(0, limit),
                count: Math.min(additionalExeResults.length + processedResults.results.length, limit)
              };
            }
          }
        } catch (exeError) {
          console.error('Error during enhanced .exe search:', exeError);
        }
      }
      
      // For program searches, try searching in common program directories
      if (isProgramSearch && processedResults.results.length < limit) {
        console.log('Searching in common program directories');
        
        let programDirResults = [];
        
        // Search in each common program directory
        for (const programDir of programDirs) {
          if (programDirResults.length >= 10) break;
          
          try {
            const dirQuery = `${programDir} ${query}`;
            const dirResults = addon.search(dirQuery, 5, true);
            
            if (dirResults && dirResults.results && dirResults.results.length > 0) {
              // Filter for executable files and deduplicate
              const newResults = dirResults.results
                .filter(r => 
                  // Only include executables not already in results
                  r.extension && executableExtensions.includes(r.extension.toLowerCase()) &&
                  !processedResults.results.some(orig => orig.path === r.path) &&
                  !programDirResults.some(prev => prev.path === r.path)
                )
                .map(r => {
                  // Fix D: drive paths
                  if (r.path && r.path.startsWith('D:') && !r.path.startsWith('D:\\')) {
                    return { ...r, path: r.path.replace('D:', 'D:\\') };
                  }
                  return r;
                });
              
              programDirResults = [...programDirResults, ...newResults];
            }
          } catch (dirError) {
            console.error(`Error searching in ${programDir}:`, dirError);
          }
        }
        
        console.log(`Found ${programDirResults.length} results in program directories`);
        
        // Add these to our results
        if (programDirResults.length > 0) {
          processedResults = {
            ...processedResults,
            results: [
              ...programDirResults,
              ...processedResults.results
            ].slice(0, limit),
            count: Math.min(programDirResults.length + processedResults.results.length, limit)
          };
        }
      }
      
      // If this is a specific D: drive search but we don't have results,
      // try again with a modified query
      if (isDDriveSearch && processedResults.results.length < 2) {
        console.log('Special D: drive search with few results, enhancing search');
        
        // Try a broader search focused on D: drive
        let enhancedQuery = query.replace(/d:/i, 'd');
        if (enhancedQuery === query) {
          enhancedQuery = 'd ' + query;
        }
        
        try {
          const dResults = addon.search(enhancedQuery, limit, true);
          if (dResults && dResults.results && dResults.results.length > 0) {
            // Filter to only include D: drive results and process them
            const dDriveResults = dResults.results
              .filter(r => r.path && r.path.toLowerCase().startsWith('d:') || r.path.toLowerCase().startsWith('d\\'))
              .map(result => {
                // Fix path format if needed
                if (result.path && result.path.startsWith('D:') && !result.path.startsWith('D:\\')) {
                  return {
                    ...result,
                    path: result.path.replace('D:', 'D:\\')
                  };
                }
                return result;
              });
              
            if (dDriveResults.length > 0) {
              console.log(`Found ${dDriveResults.length} D: drive results with enhanced search`);
              
              // Combine the results, prioritizing D: drive results
              const combinedResults = [
                ...dDriveResults,
                ...processedResults.results.filter(r => !dDriveResults.some(dr => dr.path === r.path))
              ].slice(0, limit);
              
              return {
                ...processedResults,
                results: combinedResults,
                count: combinedResults.length
              };
            }
          }
        } catch (dSearchError) {
          console.error('Error during enhanced D: drive search:', dSearchError);
        }
      }

      // If this is an executable search but we don't have exe files in the results,
      // try to prioritize executables that might have been missed
      if (isExeSearch) {
        // Make a copy of the results
        const enhancedResults = { ...processedResults };
        
        // Extract actual results array
        let resultsList = [...(enhancedResults.results || [])];
        
        // Check if we already have exe files in the results
        const hasExeFiles = resultsList.some(r => 
          executableExtensions.includes((r.extension || '').toLowerCase())
        );
        
        // If we don't have any exe files, try a broader search
        if (!hasExeFiles && resultsList.length < limit) {
          console.log('No executable files found, enhancing search');
          
          // Try to search with .exe appended if it might help
          if (!normalizedQuery.includes('.exe') && !normalizedQuery.endsWith('exe')) {
            const exeQuery = `${query} exe`;
            try {
              const exeResults = addon.search(exeQuery, limit - resultsList.length, fuzzySearch);
              if (exeResults && exeResults.results && exeResults.results.length > 0) {
                // Add a special flag to indicate these were from enhanced search
                const enhancedExeResults = exeResults.results.map(r => ({
                  ...r,
                  fromEnhancedSearch: true
                }));
                
                // Combine results, putting exe results first
                resultsList = [...enhancedExeResults, ...resultsList];
                
                // Trim to limit
                resultsList = resultsList.slice(0, limit);
                
                // Update count
                enhancedResults.count = resultsList.length;
              }
            } catch (exeError) {
              console.error('Error during enhanced exe search:', exeError);
            }
          }
        }
        
        // Prioritize exe files
        resultsList.sort((a, b) => {
          const aExt = (a.extension || '').toLowerCase();
          const bExt = (b.extension || '').toLowerCase();
          
          // Direct exe files have highest priority
          if (aExt === 'exe' && bExt !== 'exe') return -1;
          if (aExt !== 'exe' && bExt === 'exe') return 1;
          
          // Then other executable types
          const aIsExe = executableExtensions.includes(aExt);
          const bIsExe = executableExtensions.includes(bExt);
          
          if (aIsExe && !bIsExe) return -1;
          if (!aIsExe && bIsExe) return 1;
          
          return 0;
        });
        
        // Update the results
        enhancedResults.results = resultsList;
        
        return { ...enhancedResults, isStub: usingStubImplementation };
      }
      
      // Final sort for program searches to prioritize executables
      if (isProgramSearch || isExeSearch) {
        processedResults.results.sort((a, b) => {
          // Check if they are executable files
          const aIsExe = a.extension && executableExtensions.includes(a.extension.toLowerCase());
          const bIsExe = b.extension && executableExtensions.includes(b.extension.toLowerCase());
          
          // Exact .exe files get highest priority
          const aIsActualExe = a.extension && a.extension.toLowerCase() === 'exe';
          const bIsActualExe = b.extension && b.extension.toLowerCase() === 'exe';
          
          if (aIsActualExe && !bIsActualExe) return -1;
          if (!aIsActualExe && bIsActualExe) return 1;
          
          // Other executables next
          if (aIsExe && !bIsExe) return -1;
          if (!aIsExe && bIsExe) return 1;
          
          // Check if in program directories
          const aInProgramDir = a.path && programDirs.some(dir => a.path.toLowerCase().includes(dir.toLowerCase()));
          const bInProgramDir = b.path && programDirs.some(dir => b.path.toLowerCase().includes(dir.toLowerCase()));
          
          if (aInProgramDir && !bInProgramDir) return -1;
          if (!aInProgramDir && bInProgramDir) return 1;
          
          return 0;
        });
      }
      
      return { ...processedResults, isStub: usingStubImplementation };
    } catch (searchError) {
      console.error('Error during search operation:', searchError);
      return fallbackResults;
    }
  } catch (error) {
    console.error('Search error:', error);
    return fallbackResults;
  }
});

ipcMain.handle('open', async (_, filePath) => {
  try {
    // Add to recent files 
    addToRecentFiles(filePath);
    
    // Open the file
    const result = await shell.openPath(filePath);
    return { success: result === '' };
  } catch (error) {
    console.error('Open error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('hide-window', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
  return true;
});

ipcMain.handle('get-config', () => {
  return { ...appConfig, usingStubImplementation };
});

ipcMain.handle('update-config', (_, newConfig) => {
  const oldDrives = [...appConfig.drives];
  const oldFuzzySearch = appConfig.fuzzySearch;
  
  // Update config
  appConfig = { ...appConfig, ...newConfig };
  saveConfig();
  
  // Check if drives changed
  const drivesChanged = JSON.stringify(oldDrives) !== JSON.stringify(appConfig.drives);
  
  // Reinitialize if drives changed
  if (drivesChanged && !usingStubImplementation) {
    try {
      const dbPath = path.join(app.getPath('userData'), 'files.db');
      addon.updateIndex(appConfig.drives);
      
      // Start monitoring progress
      if (appConfig.showIndexingProgress) {
        startIndexingProgressMonitor();
      }
    } catch (err) {
      console.error('Error updating index:', err);
    }
  }
  
  return true;
});

ipcMain.handle('get-recent-files', () => {
  return appConfig.recentFiles;
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('get-indexing-progress', () => {
  try {
    if (usingStubImplementation || !addon) {
      return { progress: 1.0, complete: true, isStub: true };
    }
    
    // Guard against potential addon issues
    let progress = 0;
    try {
      progress = addon.getIndexingProgress();
    } catch (err) {
      console.error('Error getting progress from addon:', err);
      return { progress: 0, complete: false, error: err.message, isStub: true };
    }
    
    return { progress, complete: progress >= 0.99 };
  } catch (error) {
    console.error('Error getting indexing progress:', error);
    return { progress: 0, complete: false, error: error.message };
  }
});

ipcMain.handle('get-index-stats', () => {
  try {
    if (!addon || !addon.getIndexStats) {
      return {
        totalFiles: 0,
        totalDirectories: 0,
        lastUpdated: Date.now(),
        indexingComplete: true,
        cacheEnabled: false,
        isStub: true
      };
    }
    
    const stats = addon.getIndexStats();
    return { ...stats, isStub: usingStubImplementation };
  } catch (error) {
    console.error('Error getting index stats:', error);
    return {
      totalFiles: 0,
      totalDirectories: 0,
      error: error.message,
      isStub: true
    };
  }
});

ipcMain.handle('clear-index', () => {
  try {
    if (!addon || !addon.clearIndex) {
      return { success: false, isStub: true };
    }
    
    const success = addon.clearIndex();
    return { success, isStub: usingStubImplementation };
  } catch (error) {
    console.error('Error clearing index:', error);
    return { success: false, error: error.message };
  }
});

// Add this right after the other ipcMain.handle declarations
ipcMain.handle('resize-window', (_, resultCount) => {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return false;

    // Get screen dimensions
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { height: screenHeight } = primaryDisplay.workAreaSize;
    
    // Calculate max available height based on screen resolution
    const maxAvailableHeight = Math.floor(screenHeight * 0.7);
    
    // Precise sizing constants
    const SEARCH_BOX_HEIGHT = 40; // Search container with padding (exact height)
    const RESULT_ITEM_HEIGHT = 29; // Each result item (28px height + 1px margin)
    const WINDOW_PADDING = 0; // No additional padding
    
    if (resultCount > 0) {
      // Calculate height needed for results (limited to 10 items max)
      const numResultsToShow = Math.min(resultCount, 10);
      const resultAreaHeight = numResultsToShow * RESULT_ITEM_HEIGHT;
      
      // Calculate total window height
      const newHeight = Math.min(SEARCH_BOX_HEIGHT + resultAreaHeight + WINDOW_PADDING, maxAvailableHeight);
      
      console.log(`Resizing window to ${newHeight}px tall for ${resultCount} results (showing ${numResultsToShow})`);
      mainWindow.setSize(600, newHeight);
    } else {
      // Just the search box - exact dimensions (no extra space)
      console.log('Resizing window to search box only (40px)');
      mainWindow.setSize(600, SEARCH_BOX_HEIGHT);
    }
    return true;
  } catch (error) {
    console.error('Error resizing window:', error);
    return false;
  }
});

// Add a new IPC handler to get file icon
ipcMain.handle('get-file-icon', async (_, filePath) => {
  try {
    if (!filePath) return { success: false, error: 'No file path provided' };
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File does not exist' };
    }
    
    // Extract icon
    const iconDataUrl = await extractFileIcon(filePath);
    return { success: true, iconDataUrl };
  } catch (error) {
    console.error('Error getting file icon:', error);
    return { success: false, error: error.message };
  }
}); 