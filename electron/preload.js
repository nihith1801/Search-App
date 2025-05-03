const { contextBridge, ipcRenderer } = require('electron');

// Set up error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception in preload script:', error);
  // Don't terminate the process, just log the error
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection in preload script:', reason);
  // Don't terminate the process, just log the error
});

// Helper function to ensure API calls don't crash the app
const safeIpcCall = async (channel, ...args) => {
  try {
    return await ipcRenderer.invoke(channel, ...args);
  } catch (error) {
    console.error(`Error in API call to ${channel}:`, error);
    // Return a safe default value
    return { error: error.message };
  }
};

// IMMEDIATELY expose the API without delays
try {
  console.log('Setting up API bridge...');
  
  // Expose the API functions
  contextBridge.exposeInMainWorld('api', {
    search: (query) => safeIpcCall('search', query),
    open: (filePath) => safeIpcCall('open', filePath),
    hideWindow: () => safeIpcCall('hide-window'),
    getConfig: () => safeIpcCall('get-config'),
    updateConfig: (config) => safeIpcCall('update-config', config),
    getRecentFiles: () => safeIpcCall('get-recent-files'),
    selectDirectory: () => safeIpcCall('select-directory'),
    getIndexingProgress: () => safeIpcCall('get-indexing-progress'),
    getIndexStats: () => safeIpcCall('get-index-stats'),
    clearIndex: () => safeIpcCall('clear-index'),
    resizeWindow: (resultCount) => safeIpcCall('resize-window', resultCount)
  });
  
  // Set up events using a different name that won't conflict with the original implementation
  contextBridge.exposeInMainWorld('events', {
    onSearchBoxFocus: (callback) => {
      ipcRenderer.on('search-box-focus', () => callback());
    },
    onIndexingProgress: (callback) => {
      ipcRenderer.on('indexing-progress', (_, data) => callback(data));
    }
  });
  
  // Also expose the same functions with the original API format 
  // for backwards compatibility with existing code
  contextBridge.exposeInMainWorld('electron', {
    // Search functions
    search: (query) => safeIpcCall('search', query),
    open: (path) => safeIpcCall('open', path),
    
    // Configuration functions
    getConfig: () => safeIpcCall('get-config'),
    updateConfig: (newConfig) => safeIpcCall('update-config', newConfig),
    
    // Recent files
    getRecentFiles: () => safeIpcCall('get-recent-files'),
    
    // File system
    selectDirectory: () => safeIpcCall('select-directory'),
    
    // Window management
    hideWindow: () => safeIpcCall('hide-window'),
    
    // Indexing functions
    getIndexingProgress: () => safeIpcCall('get-indexing-progress'),
    getIndexStats: () => safeIpcCall('get-index-stats'),
    clearIndex: () => safeIpcCall('clear-index'),
    resizeWindow: (resultCount) => safeIpcCall('resize-window', resultCount),
    
    // Event listeners
    onFocusSearchBox: (callback) => {
      ipcRenderer.on('search-box-focus', () => callback());
      return () => {
        ipcRenderer.removeAllListeners('search-box-focus');
      };
    },
    
    onIndexingProgress: (callback) => {
      ipcRenderer.on('indexing-progress', (_, data) => callback(data));
      return () => {
        ipcRenderer.removeAllListeners('indexing-progress');
      };
    }
  });
  
  console.log('API exposed successfully');
} catch (error) {
  console.error('Error in preload script:', error);
} 