import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import SettingsPanel from './SettingsPanel';
import HelpPanel from './HelpPanel';
import SearchResults from './SearchResults';
import debugUtils from './debug';
import CustomInput from './CustomInput';
import Loader from './Loader';

function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [recentFiles, setRecentFiles] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [config, setConfig] = useState(null);
  const [apiConnected, setApiConnected] = useState(false);
  
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const resultsListRef = useRef(null);

  // Focus input when component mounts
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
    
    // Check API connection
    const isConnected = debugUtils.checkApiConnection();
    setApiConnected(isConnected);
    console.log('API connection status:', isConnected ? 'Connected' : 'Not Connected');

    // Set up focus event listener - check if API is available
    let unsubscribe = () => {};
    if (window.api && typeof window.api.onFocusSearchBox === 'function') {
      unsubscribe = window.api.onFocusSearchBox(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      });
    }
    
    // Get config on mount
    loadConfig();
    
    // Get recent files
    loadRecentFiles();
    
    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);
  
  // Load app configuration
  const loadConfig = async () => {
    try {
      if (window.api && typeof window.api.getConfig === 'function') {
        const config = await window.api.getConfig();
        setConfig(config);
      } else {
        console.warn('API not available: getConfig');
        // Fallback configuration
        setConfig({
          drives: [],
          hotkey: 'Control+Space',
          recentFiles: [],
          maxRecentFiles: 50
        });
      }
    } catch (error) {
      console.error('Error loading config:', error);
      // Fallback configuration on error
      setConfig({
        drives: [],
        hotkey: 'Control+Space',
        recentFiles: [],
        maxRecentFiles: 50
      });
    }
  };
  
  // Load recent files
  const loadRecentFiles = async () => {
    try {
      if (window.api && typeof window.api.getRecentFiles === 'function') {
        const files = await window.api.getRecentFiles();
        setRecentFiles(files);
      } else {
        console.warn('API not available: getRecentFiles');
        setRecentFiles([]);
      }
    } catch (error) {
      console.error('Error loading recent files:', error);
      setRecentFiles([]);
    }
  };
  
  // Handle search query changes
  useEffect(() => {
    if (query === '') {
      setResults([]);
      
      // Show recent files when query is empty
      if (recentFiles.length > 0) {
        const recentResults = recentFiles.map(path => {
          const fileNameParts = path.split(/[/\\]/).pop();
          return {
            path,
            filename: fileNameParts,
            // Don't simply split by dots as it breaks complex extensions
            extension: fileNameParts.lastIndexOf('.') !== -1 ? 
              fileNameParts.substring(fileNameParts.lastIndexOf('.') + 1) : '',
            lastModified: '',
            isRecent: true
          };
        });
        setResults(recentResults.slice(0, 10));
      }
      return;
    }

    setIsSearching(true);
    
    // Debounce search requests
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        if (window.api && typeof window.api.search === 'function') {
          const searchResponse = await window.api.search(query);
          
          // Make sure we have the results array
          const searchResults = searchResponse.results || [];
          console.log('Raw search results:', searchResponse);
          
          // Process search results to ensure extensions are properly formatted
          const processedResults = Array.isArray(searchResults) 
            ? searchResults.map(result => {
                // Make sure extension is correctly extracted from filename
                let extension = '';
                if (result.filename) {
                  const lastDotIndex = result.filename.lastIndexOf('.');
                  if (lastDotIndex !== -1) {
                    extension = result.filename.substring(lastDotIndex + 1);
                  }
                }
                
                return {
                  ...result,
                  // If the result has no extension property or it's empty, use our extracted one
                  extension: result.extension || extension
                };
              })
            : [];
          
          setResults(processedResults);
        } else {
          console.warn('API not available: search. Please make sure the Electron app is running.');
          // Just show message - don't use mock results
          setResults([]);
        }
        setSelectedIndex(0);
        setIsSearching(false);
      } catch (error) {
        console.error('Search error:', error);
        setIsSearching(false);
        setResults([]);
      }
    }, 100);

    return () => clearTimeout(debounceRef.current);
  }, [query, recentFiles]);

  // Scroll selected item into view
  useEffect(() => {
    if (resultsListRef.current && results.length > 0) {
      const selectedElement = resultsListRef.current.querySelector('.selected');
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, results]);

  // Handle clearing the search query and resetting the window
  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setSelectedIndex(0);
    
    // Immediate resize to just the search box
    if (window.api && typeof window.api.resizeWindow === 'function') {
      window.api.resizeWindow(0);
    } else if (window.electron && typeof window.electron.resizeWindow === 'function') {
      window.electron.resizeWindow(0);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    // Special case for when settings or help is open
    if (showSettings || showHelp) {
      if (e.key === 'Escape') {
        setShowSettings(false);
        setShowHelp(false);
        return;
      }
      return;
    }
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
        break;
      case 'Enter':
        if (results[selectedIndex]) {
          openSelectedFile(results[selectedIndex]);
        }
        break;
      case 'Escape':
        clearSearch();
        if (query === '' && window.api && typeof window.api.hideWindow === 'function') {
          window.api.hideWindow();
        }
        break;
      case 'Tab':
        // Cycle through results
        if (results.length > 0) {
          e.preventDefault();
          setSelectedIndex(prev => 
            (prev + 1) % results.length
          );
        }
        break;
      default:
        // Special commands
        if (e.ctrlKey) {
          switch (e.key) {
            case ',': // Ctrl+Comma for settings
              e.preventDefault();
              setShowSettings(prev => !prev);
              break;
            case '/': // Ctrl+/ for help
            case '?': // Ctrl+? for help (same key on many keyboards)
              e.preventDefault();
              setShowHelp(prev => !prev);
              break;
            case 'r': // Ctrl+R to refresh recent files
              e.preventDefault();
              loadRecentFiles();
              break;
            default:
              break;
          }
        }
        break;
    }
  };

  // Open the selected file
  const openSelectedFile = useCallback(async (result) => {
    if (!result) return;
    
    try {
      // Log the file path for debugging
      console.log('Attempting to open file:', result.path);
      
      if (window.api && typeof window.api.open === 'function') {
        // Ensure the path is properly formatted, especially for D: drive
        let filePath = result.path;
        // Fix common path formatting issues
        if (filePath.startsWith('D:') && !filePath.startsWith('D:\\')) {
          filePath = filePath.replace('D:', 'D:\\');
          console.log('Fixed path format for D drive:', filePath);
        }
        
        const response = await window.api.open(filePath);
        if (response?.success) {
          // Clear search box
          setQuery('');
          
          // Refresh recent files list
          loadRecentFiles();
        } else {
          console.error('Failed to open file:', filePath, response);
        }
      } else {
        console.warn('API not available: open');
        // Mock successful response for testing
        setQuery('');
      }
    } catch (error) {
      console.error('Error opening file:', error);
    }
  }, []);
  
  // Save updated configuration
  const saveConfig = async (newConfig) => {
    try {
      if (window.api && typeof window.api.updateConfig === 'function') {
        await window.api.updateConfig(newConfig);
        setConfig(newConfig);
      } else {
        console.warn('API not available: updateConfig');
        // Just update the local state for testing
        setConfig(newConfig);
      }
      setShowSettings(false);
    } catch (error) {
      console.error('Error saving config:', error);
    }
  };

  // Add a function to close the app
  const closeApp = () => {
    if (window.electron) {
      window.electron.hideWindow();
    } else if (window.api) {
      window.api.hideWindow();
    }
  };

  // Function to get the appropriate icon based on file type
  const getFileIcon = (result) => {
    if (!result) return '📄';
    
    const extension = (result.extension || '').toLowerCase();
    const filePath = (result.path || '').toLowerCase();
    
    // Check for executable files first - expanded list
    if (['exe', 'msi', 'com', 'bat', 'cmd', 'ps1', 'vbs', 'app', 'scr', 'reg', 'msc', 'appx', 'msix', 'lnk'].includes(extension)) {
      // Special styling based on executable type and location
      
      // Check if it's in common program directories
      const inProgramFiles = filePath.includes('program files') || filePath.includes('\\progra~1\\') || filePath.includes('\\progra~2\\');
      const inSystem = filePath.includes('\\windows\\') || filePath.includes('\\system32\\') || filePath.includes('\\syswow64\\');
      const inGames = filePath.includes('\\games\\') || filePath.includes('\\steam\\') || filePath.includes('\\steamapps\\');
      
      // Exact .exe files get special icon
      if (extension === 'exe') {
        if (inProgramFiles) {
          return <span className="result-icon executable exe-file program-files">🚀</span>;
        } else if (inSystem) {
          return <span className="result-icon executable exe-file system-file">🚀</span>;
        } else if (inGames) {
          return <span className="result-icon executable exe-file game-file">🚀</span>;
        }
        return <span className="result-icon executable exe-file">🚀</span>;
      }
      
      // Other executables
      if (inProgramFiles) {
        return <span className="result-icon executable program-files">🚀</span>;
      } else if (inSystem) {
        return <span className="result-icon executable system-file">🚀</span>;
      } else if (inGames) {
        return <span className="result-icon executable game-file">🚀</span>;
      }
      return <span className="result-icon executable">🚀</span>;
    }
    
    // Check for other file types
    switch(extension) {
      case 'pdf':
        return <span className="result-icon">📕</span>;
      case 'doc':
      case 'docx':
      case 'rtf':
      case 'txt':
      case 'md':
        return <span className="result-icon">📝</span>;
      case 'xls':
      case 'xlsx':
      case 'csv':
        return <span className="result-icon">📊</span>;
      case 'ppt':
      case 'pptx':
        return <span className="result-icon">📑</span>;
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'bmp':
      case 'webp':
      case 'svg':
        return <span className="result-icon">🖼️</span>;
      case 'mp3':
      case 'wav':
      case 'ogg':
      case 'flac':
      case 'aac':
        return <span className="result-icon">🎵</span>;
      case 'mp4':
      case 'mkv':
      case 'avi':
      case 'mov':
      case 'wmv':
        return <span className="result-icon">🎬</span>;
      case 'zip':
      case 'rar':
      case '7z':
      case 'tar':
      case 'gz':
        return <span className="result-icon">📦</span>;
      default:
        return <span className="result-icon">📄</span>;
    }
  };

  // Effect to resize window based on results
  useEffect(() => {
    // Resize window based on results count
    const resizeForResults = async () => {
      if (window.api && typeof window.api.resizeWindow === 'function') {
        await window.api.resizeWindow(results.length);
      } else if (window.electron && typeof window.electron.resizeWindow === 'function') {
        await window.electron.resizeWindow(results.length);
      }
    };
    
    // Call resize
    resizeForResults();
  }, [results.length]);

  // Also resize when query is cleared - handle this explicitly
  useEffect(() => {
    if (query === '') {
      // Clear results completely when query is empty
      setResults([]);
      
      // Resize to just the search box
      if (window.api && typeof window.api.resizeWindow === 'function') {
        window.api.resizeWindow(0);
      } else if (window.electron && typeof window.electron.resizeWindow === 'function') {
        window.electron.resizeWindow(0);
      }
    }
  }, [query]);

  return (
    <div className="App">
      <div className="search-container">
        {/* Drag handle for moving the window */}
        <div className="drag-handle"></div>
        
        {/* Close button */}
        <button className="close-button" onClick={closeApp}>×</button>
        
        <CustomInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search for files..."
          autoFocus={true}
          inputRef={inputRef}
        />

        {isSearching && (
          <div className="loader-container">
            <Loader />
          </div>
        )}
        
        <button className="settings-button" onClick={() => setShowSettings(true)}>⚙️</button>
        <button className="help-button" onClick={() => setShowHelp(true)}>?</button>
      </div>

      {results.length > 0 && (
        <div className="results-container">
          {results.map((result, index) => {
            // Check if this is an executable file for special styling
            const isExecutable = ['exe', 'msi', 'com', 'bat', 'cmd', 'ps1', 'vbs', 'app', 'scr', 'reg', 'msc', 'appx', 'msix', 'lnk'].includes(
              (result.extension || '').toLowerCase()
            );
            
            return (
              <div
                key={index}
                className={`result-item ${isExecutable ? 'executable-item' : ''} ${index === selectedIndex ? 'selected' : ''}`}
                onClick={() => openSelectedFile(result)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {getFileIcon(result)}
                <div className="result-details">
                  <div className="result-filename">{result.filename}</div>
                  <div className="result-path">{result.path}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showSettings && (
        <SettingsPanel
          config={config}
          onSave={saveConfig}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showHelp && (
        <HelpPanel onClose={() => setShowHelp(false)} />
      )}
    </div>
  );
}

export default App; 