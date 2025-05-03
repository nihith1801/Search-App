import React, { useState } from 'react';
import './SettingsPanel.css';

const SettingsPanel = ({ config, onSave, onCancel }) => {
  const [drives, setDrives] = useState(config.drives || []);
  const [hotkey, setHotkey] = useState(config.hotkey || 'Control+Space');
  const [error, setError] = useState('');
  
  const handleAddDrive = async () => {
    try {
      if (window.api && typeof window.api.selectDirectory === 'function') {
        const newDrive = await window.api.selectDirectory();
        if (newDrive && !drives.includes(newDrive)) {
          setDrives([...drives, newDrive]);
        }
      } else {
        console.warn('API not available: selectDirectory');
        setError('Directory selection not available in this environment');
        // Mock directory selection for testing
        setDrives([...drives, '/mock/directory']);
      }
    } catch (error) {
      console.error('Error selecting directory:', error);
      setError('Failed to select directory');
    }
  };
  
  const handleRemoveDrive = (drive) => {
    setDrives(drives.filter(d => d !== drive));
  };
  
  const handleSave = () => {
    const newConfig = {
      ...config,
      drives,
      hotkey
    };
    onSave(newConfig);
  };
  
  return (
    <div className="settings-panel">
      <h2>Settings</h2>
      
      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError('')}>Dismiss</button>
        </div>
      )}
      
      <div className="setting-section">
        <h3>Indexed Drives & Folders</h3>
        <p>Select drives and folders to be indexed for search</p>
        
        <div className="drives-list">
          {drives.map((drive, index) => (
            <div className="drive-item" key={index}>
              <span className="drive-path">{drive}</span>
              <button 
                className="remove-drive" 
                onClick={() => handleRemoveDrive(drive)}
                title="Remove this location"
              >
                ✕
              </button>
            </div>
          ))}
          
          <button className="add-drive" onClick={handleAddDrive}>
            Add Folder
          </button>
        </div>
      </div>
      
      <div className="setting-section">
        <h3>Hotkey</h3>
        <p>Global keyboard shortcut to open the launcher</p>
        
        <select 
          value={hotkey} 
          onChange={(e) => setHotkey(e.target.value)}
          className="hotkey-select"
        >
          <option value="Control+Space">Ctrl+Space</option>
          <option value="Alt+Space">Alt+Space</option>
          <option value="Control+Alt+Space">Ctrl+Alt+Space</option>
          <option value="Control+Shift+Space">Ctrl+Shift+Space</option>
        </select>
        <p className="note">Note: Changes to hotkey will take effect after restarting the app</p>
      </div>
      
      <div className="settings-actions">
        <button className="save-btn" onClick={handleSave}>Save Changes</button>
        <button className="cancel-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
};

export default SettingsPanel; 