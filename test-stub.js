// Simple test script for the stub implementation
console.log("Testing search stub implementation");

try {
  // Try to load the stub directly
  const stubPath = './stub/stub.js';
  const stub = require(stubPath);
  console.log("Successfully loaded stub from", stubPath);
  
  // Test basic functions
  console.log("\nTesting init function:");
  const initResult = stub.init("test.db", ["C:\\", "D:\\"], true);
  console.log("Init result:", initResult);
  
  console.log("\nTesting search function:");
  const searchResult = stub.search("test query", 10, true);
  console.log("Search result:", JSON.stringify(searchResult, null, 2));
  
  console.log("\nTesting indexing progress:");
  const progress = stub.getIndexingProgress();
  console.log("Progress:", progress);
  
  console.log("\nAll tests passed!");
} catch (err) {
  console.error("Error testing stub:", err);
  
  // Try fallback to the addon.js file
  try {
    console.log("\nTrying to load from build/Release/searchAddon.js");
    const addonPath = './build/Release/searchAddon.js';
    const addon = require(addonPath);
    console.log("Successfully loaded addon from", addonPath);
    
    // Test basic functions
    console.log("\nTesting init function:");
    const initResult = addon.init("test.db", ["C:\\", "D:\\"], true);
    console.log("Init result:", initResult);
    
    console.log("\nTesting search function:");
    const searchResult = addon.search("test query", 10, true);
    console.log("Search result:", JSON.stringify(searchResult, null, 2));
  } catch (fallbackErr) {
    console.error("Error with fallback addon:", fallbackErr);
  }
} 