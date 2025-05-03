// Debug utility to check if the API is properly connected
const checkApiConnection = () => {
  console.log('Checking API connection...');
  
  // Check if window.api exists
  if (!window.api) {
    console.error('ERROR: window.api is not defined. The Electron preload script is not working.');
    return false;
  }
  
  // Check if search function exists
  if (typeof window.api.search !== 'function') {
    console.error('ERROR: window.api.search is not a function. The preload script may be incomplete.');
    return false;
  }
  
  // Check if other important functions exist
  const requiredFunctions = [
    'open', 
    'getConfig', 
    'updateConfig', 
    'getRecentFiles', 
    'hideWindow', 
    'onFocusSearchBox'
  ];
  
  const missingFunctions = requiredFunctions.filter(fn => typeof window.api[fn] !== 'function');
  if (missingFunctions.length > 0) {
    console.error(`WARNING: Some API functions are missing: ${missingFunctions.join(', ')}`);
  }
  
  console.log('API connection check complete. The API appears to be connected.');
  return true;
};

export default { checkApiConnection }; 