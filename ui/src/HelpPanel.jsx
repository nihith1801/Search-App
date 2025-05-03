import React from 'react';
import './HelpPanel.css';

const HelpPanel = ({ onClose }) => {
  return (
    <div className="help-panel">
      <h2>Help & Keyboard Shortcuts</h2>
      
      <div className="help-section">
        <h3>Search Features</h3>
        <ul className="shortcuts-list">
          <li>
            <span className="shortcut-key">Type text</span>
            <span className="shortcut-desc">Search for files by name</span>
          </li>
          <li>
            <span className="shortcut-key">*.extension</span>
            <span className="shortcut-desc">Find files by extension (e.g., *.pdf)</span>
          </li>
          <li>
            <span className="shortcut-key">in:folder</span>
            <span className="shortcut-desc">Search in specific folder (e.g., in:Documents)</span>
          </li>
          <li>
            <span className="shortcut-key">path:folder</span>
            <span className="shortcut-desc">Alternative path search syntax</span>
          </li>
        </ul>
      </div>
      
      <div className="help-section">
        <h3>Navigation</h3>
        <ul className="shortcuts-list">
          <li>
            <span className="shortcut-key">↑ / ↓</span>
            <span className="shortcut-desc">Navigate search results</span>
          </li>
          <li>
            <span className="shortcut-key">Enter</span>
            <span className="shortcut-desc">Open selected file</span>
          </li>
          <li>
            <span className="shortcut-key">Tab</span>
            <span className="shortcut-desc">Cycle through results</span>
          </li>
          <li>
            <span className="shortcut-key">Esc</span>
            <span className="shortcut-desc">Clear search or close app</span>
          </li>
        </ul>
      </div>
      
      <div className="help-section">
        <h3>Application Shortcuts</h3>
        <ul className="shortcuts-list">
          <li>
            <span className="shortcut-key">Ctrl+,</span>
            <span className="shortcut-desc">Open settings</span>
          </li>
          <li>
            <span className="shortcut-key">Ctrl+/</span>
            <span className="shortcut-desc">Open this help panel</span>
          </li>
          <li>
            <span className="shortcut-key">Ctrl+R</span>
            <span className="shortcut-desc">Refresh recent files list</span>
          </li>
        </ul>
      </div>
      
      <button className="close-help" onClick={onClose}>Close</button>
    </div>
  );
};

export default HelpPanel; 