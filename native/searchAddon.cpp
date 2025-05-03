#include <napi.h>
#include "SearchManager.h"
#include "SQLiteIndexer.h"
#include <memory>
#include <string>
#include <vector>
#include <chrono>
#include <ctime>

// Global instance of SearchManager
std::unique_ptr<SearchManager> searchManager;

// Helper to format timestamp for JavaScript
std::string formatTimestamp(std::int64_t timestamp) {
    if (timestamp == 0) return "";
    
    try {
        // Convert to time_t
        std::time_t time = static_cast<std::time_t>(timestamp);
        // Convert to local time
        std::tm* localTime = std::localtime(&time);
        if (!localTime) return "";
        
        // Format date
        char buffer[100];
        std::strftime(buffer, sizeof(buffer), "%Y-%m-%d %H:%M:%S", localTime);
        return std::string(buffer);
    } catch (...) {
        return "";
    }
}

// Initialize the search manager
Napi::Value InitSearch(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // Check arguments
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsArray()) {
        Napi::TypeError::New(env, "Expected a database path (string) and directories (array)").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    // Get database path
    std::string dbPath = info[0].As<Napi::String>().Utf8Value();
    
    // Get directories to index
    Napi::Array dirsArray = info[1].As<Napi::Array>();
    std::vector<std::string> directories;
    
    for (uint32_t i = 0; i < dirsArray.Length(); i++) {
        Napi::Value val = dirsArray[i];
        if (val.IsString()) {
            directories.push_back(val.As<Napi::String>().Utf8Value());
        }
    }
    
    // Check if we should initialize synchronously
    bool syncInit = false;
    if (info.Length() >= 3 && info[2].IsBoolean()) {
        syncInit = info[2].As<Napi::Boolean>().Value();
    }
    
    // Create the search manager
    searchManager = std::make_unique<SearchManager>(dbPath);
    
    // Initialize and start indexing
    bool success;
    
    if (syncInit) {
        success = searchManager->initializeSync(directories);
    } else {
        success = searchManager->initialize(directories);
    }
    
    return Napi::Boolean::New(env, success);
}

// Perform a search
Napi::Value PerformSearch(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // Check if search manager is initialized
    if (!searchManager) {
        Napi::Error::New(env, "Search manager not initialized. Call init() first.").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    // Check arguments
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected a query string").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    // Get query and limit
    std::string query = info[0].As<Napi::String>().Utf8Value();
    int limit = 20; // Default limit
    
    if (info.Length() >= 2 && info[1].IsNumber()) {
        limit = info[1].As<Napi::Number>().Int32Value();
    }
    
    // Check for fuzzy search
    bool fuzzySearch = false;
    if (info.Length() >= 3 && info[2].IsBoolean()) {
        fuzzySearch = info[2].As<Napi::Boolean>().Value();
    }
    
    // Perform the search
    std::vector<SearchResult> results;
    
    if (fuzzySearch) {
        results = searchManager->searchFuzzy(query, limit);
    } else {
        results = searchManager->search(query, limit);
    }
    
    // Convert results to JavaScript array of objects
    Napi::Array jsResults = Napi::Array::New(env, results.size());
    
    for (size_t i = 0; i < results.size(); i++) {
        Napi::Object resultObj = Napi::Object::New(env);
        resultObj.Set("path", Napi::String::New(env, results[i].path));
        resultObj.Set("filename", Napi::String::New(env, results[i].filename));
        resultObj.Set("extension", Napi::String::New(env, results[i].extension));
        
        // Format the timestamp for JS
        std::string formattedDate = formatTimestamp(results[i].lastModified);
        resultObj.Set("lastModified", Napi::String::New(env, formattedDate));
        
        // Set the raw timestamp too
        resultObj.Set("timestamp", Napi::Number::New(env, static_cast<double>(results[i].lastModified)));
        
        jsResults[i] = resultObj;
    }
    
    // Add performance info
    Napi::Object resultInfo = Napi::Object::New(env);
    resultInfo.Set("results", jsResults);
    resultInfo.Set("searchTime", Napi::Number::New(env, searchManager->getLastSearchTime()));
    resultInfo.Set("count", Napi::Number::New(env, results.size()));
    
    return resultInfo;
}

// Update the index with new directories
Napi::Value UpdateSearchIndex(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // Check if search manager is initialized
    if (!searchManager) {
        Napi::Error::New(env, "Search manager not initialized. Call init() first.").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    // Check arguments
    if (info.Length() < 1 || !info[0].IsArray()) {
        Napi::TypeError::New(env, "Expected an array of directories").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    // Get directories to index
    Napi::Array dirsArray = info[0].As<Napi::Array>();
    std::vector<std::string> directories;
    
    for (uint32_t i = 0; i < dirsArray.Length(); i++) {
        Napi::Value val = dirsArray[i];
        if (val.IsString()) {
            directories.push_back(val.As<Napi::String>().Utf8Value());
        }
    }
    
    // Update the index
    searchManager->updateIndex(directories);
    
    return env.Null();
}

// Get indexing progress
Napi::Value GetIndexingProgress(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // Check if search manager is initialized
    if (!searchManager) {
        return Napi::Number::New(env, 0.0);
    }
    
    float progress = searchManager->getIndexingProgress();
    return Napi::Number::New(env, progress);
}

// Wait for indexing to complete with optional timeout
Napi::Value WaitForIndexing(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // Check if search manager is initialized
    if (!searchManager) {
        return Napi::Boolean::New(env, false);
    }
    
    // Get timeout (default 0 = wait indefinitely)
    int timeout = 0;
    if (info.Length() >= 1 && info[0].IsNumber()) {
        timeout = info[0].As<Napi::Number>().Int32Value();
    }
    
    bool completed = searchManager->waitForIndexing(timeout);
    return Napi::Boolean::New(env, completed);
}

// Initialize the addon
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("init", Napi::Function::New(env, InitSearch));
    exports.Set("search", Napi::Function::New(env, PerformSearch));
    exports.Set("updateIndex", Napi::Function::New(env, UpdateSearchIndex));
    exports.Set("getIndexingProgress", Napi::Function::New(env, GetIndexingProgress));
    exports.Set("waitForIndexing", Napi::Function::New(env, WaitForIndexing));
    
    return exports;
}

NODE_API_MODULE(searchAddon, Init) 