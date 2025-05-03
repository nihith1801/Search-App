#pragma once
#include <string>
#include <vector>
#include <memory>
#include <cstdint>
#include <functional>
#include <atomic>

// Search result structure
struct SearchResult {
    std::string path;
    std::string filename;
    std::string extension;
    std::int64_t lastModified = 0;
};

// Progress callback type - returns bool to indicate whether to continue (true) or cancel (false)
using ProgressCallback = std::function<bool(float)>;

class SQLiteIndexer {
public:
    SQLiteIndexer(const std::string& dbPath);
    ~SQLiteIndexer();

    bool initialize();
    bool isInitialized() const;
    
    // Add file to index
    bool addFile(const std::string& path, const std::string& filename);
    
    // Update index for a set of paths with optional progress callback
    void updateIndex(const std::vector<std::string>& paths, 
                     const ProgressCallback& progressCallback = nullptr);
    
    // Get current indexing progress (0.0 to 1.0)
    float getIndexingProgress() const;
    
    // Search for files using FTS5 with support for advanced operators
    std::vector<SearchResult> search(const std::string& query, int limit);
    
    // Fuzzy search with wildcards and more flexible matching
    std::vector<SearchResult> searchFuzzy(const std::string& query, int limit);
    
    // Specialized search functions
    std::vector<SearchResult> searchByExtension(const std::string& extension, int limit);
    std::vector<SearchResult> searchByPath(const std::string& pathPrefix, int limit);
    std::vector<SearchResult> searchByPathAndTerms(
        const std::string& pathPrefix, const std::string& terms, int limit);
    
private:
    bool initialized;
    std::string dbPath;
    std::atomic<float> indexingProgress;
    
    // In-memory storage for simplified implementation
    std::vector<SearchResult> cachedResults;
    
    // Helper to parse a search result
    SearchResult parseSearchResult(const SearchResult& result);
    
    // Helper to extract file extension from filename
    std::string extractFileExtension(const std::string& filename);
    
    // Helper method for fuzzy matching
    bool fuzzyMatch(const std::string& text, const std::string& pattern);
    
    // Create tables if they don't exist
    bool createTables();
    
    // Close database and clean up
    void cleanup();
}; 