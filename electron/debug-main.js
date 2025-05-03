// Debug wrapper for main.js
const fs = require('fs');
const path = require('path');

// Create log file
const logFile = path.join(__dirname, '..', 'electron-debug-log.txt');
fs.writeFileSync(logFile, `=== DEBUG LOG ${new Date().toISOString()} ===\n\n`);

function log(message) {
  const logMessage = `[${new Date().toISOString()}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(logFile, logMessage);
}

process.on('uncaughtException', (error) => {
  log(`UNCAUGHT EXCEPTION: ${error.message}`);
  log(error.stack);
  
  // Keep the process alive for debugging
  setInterval(() => {
    log("Keeping process alive...");
  }, 1000);
});

process.on('unhandledRejection', (reason) => {
  log(`UNHANDLED REJECTION: ${reason}`);
  if (reason instanceof Error) {
    log(reason.stack);
  }
});

log("Debug wrapper starting main.js");

try {
  require('./main.js');
  log("Main.js loaded successfully");
} catch (error) {
  log(`ERROR LOADING MAIN.JS: ${error.message}`);
  log(error.stack);
  
  // Keep process alive
  log("Keeping process alive for debugging...");
  setInterval(() => {
    log("Still alive...");
  }, 5000);
} 