#pragma once
#include <string>
#include <vector>
#include <memory>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <atomic>
#include "SQLiteIndexer.h"  // For SearchResult struct

class EverythingIndexer;
class SQLiteIndexer;
class QueryParser;
class Ranker;

class SearchManager {
public:
    SearchManager(const std::string& dbPath);
    ~SearchManager();
    
    // Initialize search components with async indexing
    bool initialize(const std::vector<std::string>& directories);
    
    // Initialize search components with synchronous indexing
    bool initializeSync(const std::vector<std::string>& directories);
    
    // Update the search index with specified directories (async)
    void updateIndex(const std::vector<std::string>& directories);
    
    // Wait for indexing to complete with optional timeout in seconds
    // Returns true if indexing is complete, false if timed out
    bool waitForIndexing(int timeoutSeconds = 0);
    
    // Get current indexing progress (0.0 to 1.0)
    float getIndexingProgress() const;
    
    // Perform a search query and return ranked results
    std::vector<SearchResult> search(const std::string& query, int limit);
    
    // Perform a fuzzy search query with more flexible matching
    std::vector<SearchResult> searchFuzzy(const std::string& query, int limit);
    
    // Get the time in seconds taken for the last search query
    double getLastSearchTime() const;
    
private:
    // Search components
    std::unique_ptr<EverythingIndexer> everythingIndexer;
    std::unique_ptr<SQLiteIndexer> sqliteIndexer;
    std::unique_ptr<QueryParser> queryParser;
    std::unique_ptr<Ranker> ranker;
    
    // Database path for SQLite
    std::string dbPath;
    
    // Thread management
    std::thread indexingThread;
    std::mutex indexingMutex;
    std::condition_variable indexingCV;
    std::atomic<bool> indexingComplete{false};
    
    // Performance tracking
    double lastSearchTime = 0.0;
    
    // Helper method to extract file extension from filename
    std::string extractExtension(const std::string& filename);
    
    // Internal method for updating the index
    void updateIndexInternal(const std::vector<std::string>& directories);
    
    // Merge results from different search engines
    std::vector<SearchResult> mergeResults(
        const std::vector<SearchResult>& everything, 
        const std::vector<SearchResult>& sqlite,
        int limit
    );
}; 