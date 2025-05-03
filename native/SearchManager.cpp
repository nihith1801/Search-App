#include "SearchManager.h"
#include "EverythingIndexer.h"
#include "SQLiteIndexer.h"
#include "QueryParser.h"
#include "Ranker.h"
#include <filesystem>
#include <iostream>
#include <thread>
#include <unordered_set>
#include <algorithm>
#include <chrono>
#include <mutex>
#include <condition_variable>
#include <atomic>

namespace fs = std::filesystem;

// Static flag for indexing control
static bool s_shouldStopIndexing = false;

SearchManager::SearchManager(const std::string& dbPath) 
    : dbPath(dbPath) {
    
    everythingIndexer = std::make_unique<EverythingIndexer>();
    sqliteIndexer = std::make_unique<SQLiteIndexer>(dbPath);
    queryParser = std::make_unique<QueryParser>();
    ranker = std::make_unique<Ranker>();
    
    // Initialize static control flag
    s_shouldStopIndexing = false;
}

SearchManager::~SearchManager() {
    // Signal any running indexing thread to stop
    s_shouldStopIndexing = true;
    
    // Wait for indexing to complete if a thread is running
    if (indexingThread.joinable()) {
        indexingThread.join();
    }
}

// Static callback function for progress updates
static bool indexProgressCallback(float progress) {
    // Return false to stop indexing
    return !s_shouldStopIndexing;
}

bool SearchManager::initialize(const std::vector<std::string>& directories) {
    bool everythingOk = everythingIndexer->initialize();
    
    bool sqliteOk = sqliteIndexer->initialize();
    if (sqliteOk) {
        // Start a thread to update the SQLite index in the background
        indexingThread = std::thread([this, directories]() {
            this->updateIndexInternal(directories);
        });
    } else {
        std::cerr << "Failed to initialize SQLite indexer" << std::endl;
    }
    
    // System can work with just one of the engines available
    return everythingOk || sqliteOk;
}

bool SearchManager::initializeSync(const std::vector<std::string>& directories) {
    bool everythingOk = everythingIndexer->initialize();
    
    bool sqliteOk = sqliteIndexer->initialize();
    if (sqliteOk) {
        // Update index synchronously
        updateIndexInternal(directories);
    } else {
        std::cerr << "Failed to initialize SQLite indexer" << std::endl;
    }
    
    // System can work with just one of the engines available
    return everythingOk || sqliteOk;
}

void SearchManager::updateIndex(const std::vector<std::string>& directories) {
    // If an indexing thread is already running, stop it
    s_shouldStopIndexing = true;
    if (indexingThread.joinable()) {
        indexingThread.join();
    }
    
    // Reset the flag and start a new indexing thread
    s_shouldStopIndexing = false;
    indexingComplete.store(false, std::memory_order_relaxed);
    
    // Create a copy of directories to avoid potential reference issues
    auto dirsCopy = directories;
    
    indexingThread = std::thread([this, dirsCopy]() {
        this->updateIndexInternal(dirsCopy);
    });
    
    // Detach thread to allow it to run in the background
    indexingThread.detach();
}

void SearchManager::updateIndexInternal(const std::vector<std::string>& directories) {
    indexingComplete.store(false, std::memory_order_relaxed);
    
    if (sqliteIndexer->isInitialized()) {
        try {
            // Pass the static callback to the indexer
            sqliteIndexer->updateIndex(directories, indexProgressCallback);
            
        } catch (const std::exception& e) {
            std::cerr << "Error during indexing: " << e.what() << std::endl;
        }
    }
    
    // Mark indexing as complete
    indexingComplete.store(true, std::memory_order_relaxed);
    
    // Notify any waiting threads
    std::unique_lock<std::mutex> lock(indexingMutex);
    indexingCV.notify_all();
}

bool SearchManager::waitForIndexing(int timeoutSeconds) {
    if (indexingComplete.load(std::memory_order_relaxed)) {
        return true;
    }
    
    std::unique_lock<std::mutex> lock(indexingMutex);
    if (timeoutSeconds <= 0) {
        // Wait indefinitely
        indexingCV.wait(lock, [this] { return indexingComplete.load(std::memory_order_relaxed); });
        return true;
    } else {
        // Wait with timeout
        return indexingCV.wait_for(lock, std::chrono::seconds(timeoutSeconds), 
                                  [this] { return indexingComplete.load(std::memory_order_relaxed); });
    }
}

float SearchManager::getIndexingProgress() const {
    if (indexingComplete.load(std::memory_order_relaxed)) {
        return 1.0f;
    }
    
    if (sqliteIndexer->isInitialized()) {
        return sqliteIndexer->getIndexingProgress();
    }
    
    return 0.0f;
}

// Helper function to extract correct extension from filename
std::string SearchManager::extractExtension(const std::string& filename) {
    // Check if the filename is empty
    if (filename.empty()) {
        return "";
    }
    
    // Find the position of the first and last dot
    size_t firstDot = filename.find_first_of('.');
    size_t lastDot = filename.find_last_of('.');
    
    // If no dots, no extension
    if (firstDot == std::string::npos) {
        return "";
    }
    
    if (lastDot == firstDot) {
        // Single extension like "file.txt"
        return filename.substr(lastDot + 1);
    } else {
        // Check for compound extensions like "archive.tar.gz" or "script.min.js"
        std::string fileExt = filename.substr(lastDot + 1);
        std::string prevPart = filename.substr(0, lastDot);
        size_t prevDot = prevPart.find_last_of('.');
        
        if (prevDot != std::string::npos) {
            std::string secondExt = prevPart.substr(prevDot + 1);
            
            // Common compound extensions
            if ((secondExt == "tar" && (fileExt == "gz" || fileExt == "bz2" || fileExt == "xz")) ||
                (secondExt == "min" && (fileExt == "js" || fileExt == "css")) ||
                (secondExt == "module" && fileExt == "js") ||
                (secondExt == "component" && fileExt == "html") ||
                (secondExt == "code" && fileExt == "workspace")) {
                return secondExt + "." + fileExt;
            }
        }
        
        // Default to the last part of the filename
        return fileExt;
    }
}

std::vector<SearchResult> SearchManager::search(const std::string& query, int limit) {
    if (query.empty()) {
        return std::vector<SearchResult>();
    }
    
    auto startTime = std::chrono::high_resolution_clock::now();
    
    // Process the query
    std::string processedQuery = queryParser->parseQuery(query);
    
    // Search using available engines
    std::vector<std::string> everythingResults;
    std::vector<SearchResult> sqliteResults;
    
    if (everythingIndexer->isAvailable()) {
        everythingResults = everythingIndexer->search(query, limit * 2);
    }
    
    if (sqliteIndexer->isInitialized()) {
        sqliteResults = sqliteIndexer->search(processedQuery, limit * 2);
    }
    
    // Merge Everything results into SearchResult objects
    std::vector<SearchResult> everythingSearchResults;
    for (const auto& path : everythingResults) {
        SearchResult result;
        result.path = path;
        result.filename = fs::path(path).filename().string();
        
        // Extract proper extension using our helper function
        result.extension = extractExtension(result.filename);
        
        // Try to get last modified time
        try {
            auto fileTime = fs::last_write_time(path);
            auto systemTime = std::chrono::time_point_cast<std::chrono::system_clock::duration>(
                fileTime - fs::file_time_type::clock::now() + std::chrono::system_clock::now());
            result.lastModified = std::chrono::duration_cast<std::chrono::seconds>(
                systemTime.time_since_epoch()).count();
        } catch (const fs::filesystem_error&) {
            // Ignore errors
        }
        
        everythingSearchResults.push_back(result);
    }
    
    // Merge results from both engines
    std::vector<SearchResult> mergedResults = mergeResults(
        everythingSearchResults, sqliteResults, limit * 2);
    
    // Rank the merged results
    std::vector<SearchResult> rankedResults = ranker->rankResults(query, mergedResults);
    
    // Add search timing information
    auto endTime = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime).count();
    lastSearchTime = static_cast<double>(duration) / 1000.0;
    
    // Limit the number of results
    if (rankedResults.size() > static_cast<size_t>(limit)) {
        rankedResults.resize(limit);
    }
    
    return rankedResults;
}

double SearchManager::getLastSearchTime() const {
    return lastSearchTime;
}

std::vector<SearchResult> SearchManager::searchFuzzy(const std::string& query, int limit) {
    if (query.empty()) {
        return std::vector<SearchResult>();
    }
    
    // For fuzzy search, we rely more on the SQLite engine which supports full-text search
    std::vector<SearchResult> sqliteResults;
    
    if (sqliteIndexer->isInitialized()) {
        // Apply fuzzy matching - add * wildcards between terms
        std::string fuzzyQuery = queryParser->createFuzzyQuery(query);
        sqliteResults = sqliteIndexer->searchFuzzy(fuzzyQuery, limit * 2);
    }
    
    // Use standard ranking
    std::vector<SearchResult> rankedResults = ranker->rankResults(query, sqliteResults);
    
    // Limit the number of results
    if (rankedResults.size() > static_cast<size_t>(limit)) {
        rankedResults.resize(limit);
    }
    
    return rankedResults;
}

std::vector<SearchResult> SearchManager::mergeResults(
    const std::vector<SearchResult>& everything, 
    const std::vector<SearchResult>& sqlite,
    int limit) {
    
    std::unordered_set<std::string> seenPaths;
    std::vector<SearchResult> merged;
    
    // Add Everything results first (they're often high quality)
    for (const auto& result : everything) {
        if (seenPaths.find(result.path) == seenPaths.end()) {
            merged.push_back(result);
            seenPaths.insert(result.path);
            
            if (merged.size() >= static_cast<size_t>(limit)) {
                return merged;
            }
        }
    }
    
    // Then add SQLite results
    for (const auto& result : sqlite) {
        if (seenPaths.find(result.path) == seenPaths.end()) {
            merged.push_back(result);
            seenPaths.insert(result.path);
            
            if (merged.size() >= static_cast<size_t>(limit)) {
                return merged;
            }
        }
    }
    
    return merged;
} 