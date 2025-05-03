const fs = require('fs');
const path = require('path');
const os = require('os');

// Timestamp format helper
function getTimestamp() {
  return new Date().toISOString();
}

// Get system information for diagnostics
function getSystemInfo() {
  return {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    electronVersion: process.versions.electron,
    totalMemory: `${Math.round(os.totalmem() / (1024 * 1024 * 1024))}GB`,
    freeMemory: `${Math.round(os.freemem() / (1024 * 1024 * 1024))}GB`,
    cpus: os.cpus().length,
    uptime: os.uptime()
  };
}

// Create a diagnostic dump of the current process state
function createDiagnosticDump() {
  try {
    const sysInfo = getSystemInfo();
    return `
System Information:
  Platform: ${sysInfo.platform}
  Architecture: ${sysInfo.arch}
  Node Version: ${sysInfo.nodeVersion}
  Electron Version: ${sysInfo.electronVersion}
  Total Memory: ${sysInfo.totalMemory}
  Free Memory: ${sysInfo.freeMemory}
  CPU Cores: ${sysInfo.cpus}
  System Uptime: ${sysInfo.uptime}s

Process Information:
  PID: ${process.pid}
  Memory Usage: ${JSON.stringify(process.memoryUsage())}
  Uptime: ${process.uptime()}s
`;
  } catch (err) {
    return `Failed to create diagnostic dump: ${err.message}`;
  }
}

// Log an error to the crash log file
function logCrash(errorType, error, additionalInfo = {}) {
  try {
    const crashLogPath = path.join(__dirname, 'crash-logs.txt');
    
    // Format the error message
    const logEntry = `
================ CRASH REPORT ================
Timestamp: ${getTimestamp()}
Type: ${errorType}
Error: ${error.message}
Stack: ${error.stack}

${createDiagnosticDump()}

Additional Info:
${JSON.stringify(additionalInfo, null, 2)}
==============================================
`;

    // Append to the log file
    fs.appendFileSync(crashLogPath, logEntry);
    console.error(`Crash log written to ${crashLogPath}`);
    
    return true;
  } catch (err) {
    console.error('Failed to write crash log:', err);
    return false;
  }
}

// Set up global error handlers
function setupGlobalErrorHandlers() {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('CRASH: Uncaught exception:', error);
    logCrash('UNCAUGHT_EXCEPTION', error);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    console.error('CRASH: Unhandled rejection:', error);
    logCrash('UNHANDLED_REJECTION', error);
  });
}

module.exports = {
  logCrash,
  setupGlobalErrorHandlers
}; 