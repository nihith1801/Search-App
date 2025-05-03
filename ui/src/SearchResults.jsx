import React from 'react';
import './SearchResults.css';

const SearchResults = ({ 
  results = [], // Default to empty array if results is undefined
  selectedIndex, 
  onResultSelect, 
  onResultClick
}) => {
  // Get the file icon based on extension and file properties
  const getFileIcon = (file) => {
    const extension = file.extension?.toLowerCase();
    const isExecutable = file.isExecutable || file.icon === 'exe' || 
                         extension === 'exe' || extension === 'msi' || 
                         extension === 'bat' || extension === 'cmd';
    
    // If we have a custom icon URL, use it
    if (file.iconUrl) {
      return <img src={file.iconUrl} alt={file.filename} className="custom-icon" />;
    }
    
    // If the stub implementation already provided an icon type
    if (file.icon) {
      if (file.icon === 'exe') return '⚡';
      if (file.icon === 'shortcut') return '🔗';
      if (file.icon === 'folder') return '📁';
      if (file.icon === 'document') return '📄';
      if (file.icon === 'image') return '🖼️';
      if (file.icon === 'audio') return '🎵';
      if (file.icon === 'video') return '🎬';
      if (file.icon === 'archive') return '📦';
      if (file.icon === 'code') return '📜';
      if (file.icon === 'web') return '🌐';
    }
    
    // Special case for well-known applications
    if (isExecutable) {
      const fileName = file.filename.toLowerCase();
      
      // Common browsers
      if (fileName.includes('chrome')) return '🌐';
      if (fileName.includes('firefox')) return '🦊';
      if (fileName.includes('edge')) return '🌐';
      if (fileName.includes('opera')) return '🔴';
      if (fileName.includes('safari')) return '🧭';
      
      // Common applications
      if (fileName.includes('word') || fileName.includes('winword')) return '📘';
      if (fileName.includes('excel') || fileName.includes('xlsm')) return '📗';
      if (fileName.includes('powerpoint') || fileName.includes('pptx')) return '📙';
      if (fileName.includes('outlook')) return '📧';
      if (fileName.includes('access')) return '🗃️';
      if (fileName.includes('photoshop')) return '🎨';
      if (fileName.includes('illustrator')) return '✏️';
      if (fileName.includes('paint')) return '🖌️';
      if (fileName.includes('code') || fileName.includes('vscode')) return '💻';
      if (fileName.includes('studio')) return '🛠️';
      if (fileName.includes('notepad')) return '📝';
      if (fileName.includes('calculator') || fileName.includes('calc')) return '🧮';
      if (fileName.includes('explorer')) return '📂';
      if (fileName.includes('vlc')) return '▶️';
      if (fileName.includes('media') || fileName.includes('player')) return '🎬';
      if (fileName.includes('spotify')) return '🎵';
      if (fileName.includes('steam')) return '🎮';
      if (fileName.includes('game')) return '🎯';
      
      // Default for executables
      return '⚡';
    }
    
    // File type icons based on extension with more variety
    if (!extension) return '📄';
    
    switch (extension) {
      // Documents
      case 'pdf': return '📑';
      case 'doc':
      case 'docx': return '📝';
      case 'txt': return '📃';
      case 'md':
      case 'markdown': return '📋';
      case 'rtf': return '📄';
      
      // Spreadsheets
      case 'xls':
      case 'xlsx':
      case 'csv': return '📊';
      
      // Presentations
      case 'ppt':
      case 'pptx': return '🎭';
      
      // Images
      case 'jpg':
      case 'jpeg': return '🖼️';
      case 'png': return '🌄';
      case 'gif': return '🎞️';
      case 'svg': return '⚙️';
      case 'bmp':
      case 'tiff': return '📷';
      case 'ico': return '🏷️';
      
      // Audio
      case 'mp3': return '🎵';
      case 'wav': return '🔊';
      case 'flac':
      case 'ogg':
      case 'm4a': return '🎧';
      
      // Video
      case 'mp4': return '🎬';
      case 'avi': return '🎥';
      case 'mov':
      case 'mkv':
      case 'webm': return '📺';
      
      // Archives
      case 'zip': return '🗜️';
      case 'rar': return '📦';
      case '7z':
      case 'tar':
      case 'gz': 
      case 'bz2':
      case 'xz': return '📚';
      
      // Code files - expanded with more language icons
      case 'py': return '🐍';
      case 'ipynb': return '📓';
      case 'js': return '📜';
      case 'jsx':
      case 'tsx': return '⚛️';
      case 'ts': return '🔷';
      case 'html': return '🌐';
      case 'css': return '🎨';
      case 'sass':
      case 'scss': return '💄';
      case 'c': return '©️';
      case 'cpp':
      case 'cc':
      case 'cxx': return '➕';
      case 'h':
      case 'hpp': return '🔨';
      case 'java': return '☕';
      case 'php': return '🐘';
      case 'rb': return '💎';
      case 'pl': return '🐪';
      case 'go': return '🐹';
      case 'rs': return '🦀';
      case 'swift': return '🦅';
      case 'kt':
      case 'kts': return '🧩';
      case 'sh':
      case 'bash':
      case 'zsh': return '💻';
      case 'ps1': return '🔌';
      case 'bat':
      case 'cmd': return '⌨️';
      case 'json': return '📋';
      case 'xml': return '📰';
      case 'yaml':
      case 'yml': return '⚓';
      case 'sql': return '🗃️';
      case 'db':
      case 'sqlite': return '💾';
      case 'vue': return '📗';
      case 'gradle': return '🐘';
      case 'dart': return '🎯';
      
      // Executables (should be caught above, but just in case)
      case 'exe': return '⚡';
      case 'dll': return '🔌';
      case 'app': return '📱';
      case 'apk': return '📲';
      case 'msi': return '💿';
      
      // Default for other types
      default: return '📄';
    }
  };

  // Format filename for display
  const formatFilename = (result) => {
    // If displayName is available, use it
    if (result.displayName) {
      return result.displayName;
    }
    
    const { filename, extension } = result;
    
    // If no extension or it's already part of the filename display
    if (!extension || !filename.endsWith('.' + extension)) {
      return filename;
    }
    
    // Otherwise return just the name part
    return filename.substring(0, filename.length - extension.length - 1);
  };

  console.log('Rendering search results:', results);

  // Make sure results is an array before rendering
  const safeResults = Array.isArray(results) ? results : [];

  // If no results, show a message
  if (safeResults.length === 0) {
    return (
      <div className="no-results">
        <p>No results found</p>
      </div>
    );
  }

  return (
    <ul className="results-list">
      {safeResults.map((result, index) => (
        <li
          key={index}
          className={`${index === selectedIndex ? 'selected' : ''} ${result.isRecent ? 'recent-item' : ''} ${result.isExecutable ? 'executable-item' : ''}`}
          onClick={() => onResultClick(result)}
          onMouseEnter={() => onResultSelect(index)}
        >
          <div className="result-item">
            <div className="result-icon">
              {getFileIcon(result)}
            </div>
            <div className="result-content">
              <div className="result-filename">
                {formatFilename(result)}
                {result.extension && !result.isExecutable && result.icon !== 'exe' && (
                  <span className="result-extension">.{result.extension}</span>
                )}
              </div>
              <div className="result-path">{result.path}</div>
              {result.lastModified && (
                <div className="result-date">
                  {new Date(result.lastModified).toLocaleDateString()}
                </div>
              )}
              {result.isRecent && (
                <div className="result-badge">Recent</div>
              )}
              {(result.isExecutable || result.icon === 'exe' || result.extension === 'exe') && (
                <div className="result-badge app-badge">Application</div>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
};

export default SearchResults; 