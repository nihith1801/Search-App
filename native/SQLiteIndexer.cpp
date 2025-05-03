#include "SQLiteIndexer.h"
#include "FileCrawler.h"
#include <iostream>
#include <sstream>
#include <filesystem>
#include <regex>
#include <chrono>
#include <algorithm>

namespace fs = std::filesystem;

SQLiteIndexer::SQLiteIndexer(const std::string& dbPath)
    : initialized(false), dbPath(dbPath), indexingProgress(0.0f) {
    // Simple in-memory implementation until SQLite SDK is available
}

SQLiteIndexer::~SQLiteIndexer() {
    cleanup();
}

bool SQLiteIndexer::initialize() {
    // Dummy initialization
    std::cout << "SQLiteIndexer initialized in dummy mode (SQLite SDK not available)" << std::endl;
    initialized = true;
    return true;
}

bool SQLiteIndexer::isInitialized() const {
    return initialized;
}

bool SQLiteIndexer::createTables() {
    // Dummy implementation
    return true;
}

float SQLiteIndexer::getIndexingProgress() const {
    return indexingProgress.load();
}

bool SQLiteIndexer::addFile(const std::string& path, const std::string& filename) {
    if (!initialized) {
        return false;
    }
    
    // In memory implementation - just add to our results cache
    SearchResult result;
    result.path = path;
    result.filename = filename;
    
    // Extract proper extension from filename using improved approach
    result.extension = extractFileExtension(filename);
    
    // Get file's last modified time
    try {
        auto fileTime = fs::last_write_time(path);
        auto systemTime = std::chrono::time_point_cast<std::chrono::system_clock::duration>(
            fileTime - fs::file_time_type::clock::now() + std::chrono::system_clock::now());
        result.lastModified = std::chrono::duration_cast<std::chrono::seconds>(
            systemTime.time_since_epoch()).count();
    } catch (const fs::filesystem_error& e) {
        std::cerr << "Error getting file time: " << e.what() << std::endl;
    }
    
    // Add to our in-memory index
    cachedResults.push_back(result);
    return true;
}

// Helper function to extract file extension, handles compound extensions
std::string SQLiteIndexer::extractFileExtension(const std::string& filename) {
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
                (secondExt == "config" && fileExt == "js") ||
                (secondExt == "spec" && (fileExt == "js" || fileExt == "ts" || fileExt == "jsx" || fileExt == "tsx")) ||
                (secondExt == "test" && (fileExt == "js" || fileExt == "ts" || fileExt == "jsx" || fileExt == "tsx")) ||
                (secondExt == "d" && fileExt == "ts") ||  // TypeScript declaration files
                (secondExt == "code" && fileExt == "workspace")) {
                return secondExt + "." + fileExt;
            }
        }
        
        // Default to the last part of the filename
        return fileExt;
    }
}

void SQLiteIndexer::updateIndex(const std::vector<std::string>& paths, 
                                const ProgressCallback& progressCallback) {
    if (!initialized) {
        return;
    }
    
    // Clear previous results
    cachedResults.clear();
    
    // Reset progress
    indexingProgress.store(0.0f);
    
    // Count total paths for progress tracking
    size_t totalPaths = paths.size();
    size_t completedPaths = 0;
    
    FileCrawler crawler;
    for (const auto& path : paths) {
        // Update progress
        float currentProgress = totalPaths > 0 ? static_cast<float>(completedPaths) / totalPaths : 0.0f;
        indexingProgress.store(currentProgress);
        
        // Check if we should continue
        if (progressCallback && !progressCallback(currentProgress)) {
            std::cout << "Indexing canceled at " << (currentProgress * 100.0f) << "%" << std::endl;
            return;
        }
        
        // Process this path
        crawler.crawlDirectory(path, [this](const std::string& filePath) {
            std::string filename = fs::path(filePath).filename().string();
            this->addFile(filePath, filename);
        });
        
        // Update completed count
        completedPaths++;
    }
    
    // Finalize progress
    indexingProgress.store(1.0f);
    if (progressCallback) {
        progressCallback(1.0f);
    }
    
    std::cout << "Added " << cachedResults.size() << " files to in-memory index" << std::endl;
}

SearchResult SQLiteIndexer::parseSearchResult(const SearchResult& result) {
    return result;
}

std::vector<SearchResult> SQLiteIndexer::search(const std::string& query, int limit) {
    std::vector<SearchResult> results;
    
    if (!initialized || cachedResults.empty()) {
        return results;
    }
    
    // Very simple search implementation
    std::string lowercaseQuery = query;
    std::transform(lowercaseQuery.begin(), lowercaseQuery.end(), lowercaseQuery.begin(), ::tolower);
    
    // Extract extension search (ext:pdf)
    if (query.compare(0, 10, "extension:") == 0) {
        std::string extension = query.substr(10);
        return searchByExtension(extension, limit);
    }
    
    // Extract path search (path:Documents)
    std::regex pathRegex("path:([^\\s]+)(?:\\s+AND\\s+(.+))?");
    std::smatch pathMatch;
    if (std::regex_match(query, pathMatch, pathRegex)) {
        std::string pathPrefix = pathMatch[1].str();
        
        // Check if there are additional search terms
        if (pathMatch.size() > 2 && pathMatch[2].matched) {
            std::string searchTerms = pathMatch[2].str();
            return searchByPathAndTerms(pathPrefix, searchTerms, limit);
        } else {
            return searchByPath(pathPrefix, limit);
        }
    }
    
    // Simple substring search
    for (const auto& result : cachedResults) {
        std::string lowercaseFilename = result.filename;
        std::transform(lowercaseFilename.begin(), lowercaseFilename.end(), lowercaseFilename.begin(), ::tolower);
        
        std::string lowercasePath = result.path;
        std::transform(lowercasePath.begin(), lowercasePath.end(), lowercasePath.begin(), ::tolower);
        
        if (lowercaseFilename.find(lowercaseQuery) != std::string::npos || 
            lowercasePath.find(lowercaseQuery) != std::string::npos) {
            results.push_back(result);
            if (results.size() >= static_cast<size_t>(limit)) {
                break;
            }
        }
    }
    
    return results;
}

std::vector<SearchResult> SQLiteIndexer::searchFuzzy(const std::string& query, int limit) {
    std::vector<SearchResult> results;
    
    if (!initialized || cachedResults.empty()) {
        return results;
    }
    
    // Fuzzy search implementation
    // This is a simple version that just looks for partial matches
    
    // Extract any special search tokens first
    std::string cleanQuery = query;
    std::string extension;
    std::string pathFilter;
    
    // Check for extension filter
    std::regex extRegex("extension:([^\\s]+)");
    std::smatch extMatch;
    if (std::regex_search(query, extMatch, extRegex)) {
        extension = extMatch[1].str();
        // Remove the extension part from query
        cleanQuery = std::regex_replace(cleanQuery, std::regex("extension:[^\\s]+"), "");
    }
    
    // Check for path filter
    std::regex pathRegex("path:([^\\s]+)");
    std::smatch pathMatch;
    if (std::regex_search(query, pathMatch, pathRegex)) {
        pathFilter = pathMatch[1].str();
        // Remove the path part from query
        cleanQuery = std::regex_replace(cleanQuery, std::regex("path:[^\\s]+"), "");
    }
    
    // Convert to lowercase for case-insensitive matching
    std::string lowercaseQuery = cleanQuery;
    std::transform(lowercaseQuery.begin(), lowercaseQuery.end(), lowercaseQuery.begin(), ::tolower);
    
    // Split query into terms
    std::vector<std::string> terms;
    std::stringstream ss(lowercaseQuery);
    std::string term;
    while (ss >> term) {
        if (term != "and") { // Skip 'AND' operators
            terms.push_back(term);
        }
    }
    
    // Process all files
    for (const auto& result : cachedResults) {
        // Apply extension filter if specified
        if (!extension.empty()) {
            std::string resultExt = result.extension;
            std::transform(resultExt.begin(), resultExt.end(), resultExt.begin(), ::tolower);
            if (resultExt != extension) {
                continue;
            }
        }
        
        // Apply path filter if specified
        if (!pathFilter.empty()) {
            std::string lowercasePath = result.path;
            std::transform(lowercasePath.begin(), lowercasePath.end(), lowercasePath.begin(), ::tolower);
            if (lowercasePath.find(pathFilter) == std::string::npos) {
                continue;
            }
        }
        
        // Skip if no terms (might be just filters)
        if (terms.empty()) {
            results.push_back(result);
            continue;
        }
        
        // Prepare the target text
        std::string lowercaseFilename = result.filename;
        std::transform(lowercaseFilename.begin(), lowercaseFilename.end(), lowercaseFilename.begin(), ::tolower);
        
        std::string lowercasePath = result.path;
        std::transform(lowercasePath.begin(), lowercasePath.end(), lowercasePath.begin(), ::tolower);
        
        // Check if all terms match
        bool allTermsMatch = true;
        for (const auto& term : terms) {
            // For fuzzy matching, we consider a term a match if consecutive characters appear
            // in the right order with optional characters in between
            bool termMatches = false;
            
            // Try to match in filename
            if (this->fuzzyMatch(lowercaseFilename, term)) {
                termMatches = true;
            }
            
            // Try to match in path if not found in filename
            if (!termMatches && this->fuzzyMatch(lowercasePath, term)) {
                termMatches = true;
            }
            
            // If any term doesn't match, skip this result
            if (!termMatches) {
                allTermsMatch = false;
                break;
            }
        }
        
        if (allTermsMatch) {
            results.push_back(result);
            if (results.size() >= static_cast<size_t>(limit)) {
                break;
            }
        }
    }
    
    return results;
}

// Helper method for fuzzy matching
bool SQLiteIndexer::fuzzyMatch(const std::string& text, const std::string& pattern) {
    if (pattern.empty()) return true;
    
    // Fast path for substring search
    if (text.find(pattern) != std::string::npos) {
        return true;
    }
    
    // More flexible fuzzy searching
    size_t textPos = 0;
    size_t patternPos = 0;
    
    while (textPos < text.length() && patternPos < pattern.length()) {
        if (text[textPos] == pattern[patternPos]) {
            patternPos++;
        }
        textPos++;
    }
    
    return patternPos == pattern.length();
}

std::vector<SearchResult> SQLiteIndexer::searchByExtension(const std::string& extension, int limit) {
    std::vector<SearchResult> results;
    
    std::string lowercaseExt = extension;
    std::transform(lowercaseExt.begin(), lowercaseExt.end(), lowercaseExt.begin(), ::tolower);
    
    for (const auto& result : cachedResults) {
        std::string resultExt = result.extension;
        std::transform(resultExt.begin(), resultExt.end(), resultExt.begin(), ::tolower);
        
        if (resultExt == lowercaseExt) {
            results.push_back(result);
            if (results.size() >= static_cast<size_t>(limit)) {
                break;
            }
        }
    }
    
    return results;
}

std::vector<SearchResult> SQLiteIndexer::searchByPath(const std::string& pathPrefix, int limit) {
    std::vector<SearchResult> results;
    
    std::string lowercasePrefix = pathPrefix;
    std::transform(lowercasePrefix.begin(), lowercasePrefix.end(), lowercasePrefix.begin(), ::tolower);
    
    for (const auto& result : cachedResults) {
        std::string lowercasePath = result.path;
        std::transform(lowercasePath.begin(), lowercasePath.end(), lowercasePath.begin(), ::tolower);
        
        if (lowercasePath.find(lowercasePrefix) != std::string::npos) {
            results.push_back(result);
            if (results.size() >= static_cast<size_t>(limit)) {
                break;
            }
        }
    }
    
    return results;
}

std::vector<SearchResult> SQLiteIndexer::searchByPathAndTerms(
    const std::string& pathPrefix, const std::string& terms, int limit) {
    std::vector<SearchResult> results;
    
    std::string lowercasePrefix = pathPrefix;
    std::transform(lowercasePrefix.begin(), lowercasePrefix.end(), lowercasePrefix.begin(), ::tolower);
    
    std::string lowercaseTerms = terms;
    std::transform(lowercaseTerms.begin(), lowercaseTerms.end(), lowercaseTerms.begin(), ::tolower);
    
    for (const auto& result : cachedResults) {
        std::string lowercasePath = result.path;
        std::transform(lowercasePath.begin(), lowercasePath.end(), lowercasePath.begin(), ::tolower);
        
        std::string lowercaseFilename = result.filename;
        std::transform(lowercaseFilename.begin(), lowercaseFilename.end(), lowercaseFilename.begin(), ::tolower);
        
        if (lowercasePath.find(lowercasePrefix) != std::string::npos && 
            (lowercaseFilename.find(lowercaseTerms) != std::string::npos || 
             lowercasePath.find(lowercaseTerms) != std::string::npos)) {
            results.push_back(result);
            if (results.size() >= static_cast<size_t>(limit)) {
                break;
            }
        }
    }
    
    return results;
}

void SQLiteIndexer::cleanup() {
    // Cleanup resources if needed
    cachedResults.clear();
} 