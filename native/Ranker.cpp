#include "Ranker.h"
#include <algorithm>
#include <cctype>
#include <filesystem>
#include <locale>
#include <unordered_map>
#include <chrono>
#include <ctime>

namespace fs = std::filesystem;

Ranker::Ranker() {
    // Initialize weights for ranking factors
    weights.exactMatch = 10.0;      // Exact string matches
    weights.filenameMatch = 8.0;    // Matches in filename
    weights.pathMatch = 3.0;        // Matches in path
    weights.recentlyUsed = 5.0;     // Recently used files
    weights.proximity = 2.0;        // Proximity to working directory
    weights.recency = 4.0;          // Recently modified files
    weights.extensionMatch = 7.0;   // Extension matches
}

Ranker::~Ranker() {}

std::vector<SearchResult> Ranker::rankResults(const std::string& query, 
                                            const std::vector<SearchResult>& results) {
    // Make a copy of results that we can sort
    std::vector<SearchResult> sortedResults = results;
    
    // Calculate scores for all results
    std::unordered_map<std::string, double> scores;
    for (const auto& result : results) {
        scores[result.path] = calculateScore(query, result);
    }
    
    // Sort by score (descending)
    std::sort(sortedResults.begin(), sortedResults.end(), 
              [&scores](const SearchResult& a, const SearchResult& b) {
                  return scores[a.path] > scores[b.path];
              });
    
    return sortedResults;
}

double Ranker::calculateScore(const std::string& query, const SearchResult& result) {
    // Calculate different types of matches
    double exactMatchScore = scoreExactMatch(query, result) * weights.exactMatch;
    double partialMatchScore = scorePartialMatch(query, result) * weights.filenameMatch;
    double tokenMatchScore = scoreTokenMatch(query, result) * weights.pathMatch;
    double proximityScore = scorePathProximity(result) * weights.proximity;
    double recencyScore = scoreRecency(result) * weights.recency;
    
    // Extension matching
    double extensionMatchScore = 0.0;
    std::string lowercaseQuery = query;
    std::transform(lowercaseQuery.begin(), lowercaseQuery.end(), 
                  lowercaseQuery.begin(), ::tolower);
    
    std::string lowercaseExt = result.extension;
    std::transform(lowercaseExt.begin(), lowercaseExt.end(), 
                  lowercaseExt.begin(), ::tolower);
    
    if (!lowercaseExt.empty() && lowercaseQuery.find(lowercaseExt) != std::string::npos) {
        extensionMatchScore = 1.0 * weights.extensionMatch;
    }
    
    // Combine scores
    return exactMatchScore + partialMatchScore + tokenMatchScore + 
           proximityScore + recencyScore + extensionMatchScore;
}

double Ranker::scoreExactMatch(const std::string& query, const SearchResult& result) {
    // Case-insensitive exact match in filename
    std::string lowercaseFilename = result.filename;
    std::string lowercaseQuery = query;
    
    std::transform(lowercaseFilename.begin(), lowercaseFilename.end(), 
                   lowercaseFilename.begin(), ::tolower);
    std::transform(lowercaseQuery.begin(), lowercaseQuery.end(), 
                   lowercaseQuery.begin(), ::tolower);
    
    // Score: 1.0 for exact filename match, 0.8 for stem match
    if (lowercaseFilename == lowercaseQuery) {
        return 1.0;
    }
    
    std::string stem = fs::path(result.filename).stem().string();
    std::transform(stem.begin(), stem.end(), stem.begin(), ::tolower);
    
    if (stem == lowercaseQuery) {
        return 0.8;
    }
    
    // Check if query is contained in filename
    if (lowercaseFilename.find(lowercaseQuery) != std::string::npos) {
        return 0.6;
    }
    
    return 0.0;
}

double Ranker::scorePartialMatch(const std::string& query, const SearchResult& result) {
    std::string lowercaseFilename = result.filename;
    std::string lowercaseQuery = query;
    
    std::transform(lowercaseFilename.begin(), lowercaseFilename.end(), 
                   lowercaseFilename.begin(), ::tolower);
    std::transform(lowercaseQuery.begin(), lowercaseQuery.end(), 
                   lowercaseQuery.begin(), ::tolower);
    
    // If query is a substring of filename, score based on position
    size_t pos = lowercaseFilename.find(lowercaseQuery);
    if (pos != std::string::npos) {
        // Higher score if match is at the beginning
        return 1.0 - (static_cast<double>(pos) / lowercaseFilename.length());
    }
    
    // Partial fuzzy matching (simple implementation)
    int matchCount = 0;
    size_t j = 0;
    
    for (size_t i = 0; i < lowercaseQuery.length() && j < lowercaseFilename.length(); i++) {
        while (j < lowercaseFilename.length()) {
            if (lowercaseQuery[i] == lowercaseFilename[j]) {
                matchCount++;
                j++;
                break;
            }
            j++;
        }
    }
    
    // Score based on how many characters matched in order
    return static_cast<double>(matchCount) / lowercaseQuery.length();
}

double Ranker::scoreTokenMatch(const std::string& query, const SearchResult& result) {
    // Split query into tokens
    std::vector<std::string> queryTokens;
    std::string token;
    for (char c : query) {
        if (std::isalnum(c)) {
            token += std::tolower(c);
        } else {
            if (!token.empty()) {
                queryTokens.push_back(token);
                token.clear();
            }
        }
    }
    if (!token.empty()) {
        queryTokens.push_back(token);
    }
    
    // Get path components
    std::string filename = result.filename;
    std::string path = result.path;
    std::string dir;
    
    // Extract directory part
    try {
        dir = fs::path(path).parent_path().string();
    } catch (...) {
        // Fall back to simple string operations if fs::path fails
        size_t lastSlash = path.find_last_of("/\\");
        if (lastSlash != std::string::npos) {
            dir = path.substr(0, lastSlash);
        }
    }
    
    // Convert to lowercase
    std::transform(filename.begin(), filename.end(), filename.begin(), ::tolower);
    std::transform(dir.begin(), dir.end(), dir.begin(), ::tolower);
    
    // Count matches
    double matchScore = 0.0;
    for (const auto& token : queryTokens) {
        if (filename.find(token) != std::string::npos) {
            matchScore += 1.0;  // Full score for filename matches
        } else if (dir.find(token) != std::string::npos) {
            matchScore += 0.5;  // Half score for directory matches
        }
    }
    
    // Normalize by number of tokens
    return queryTokens.empty() ? 0.0 : matchScore / queryTokens.size();
}

double Ranker::scorePathProximity(const SearchResult& result) {
    // Simple implementation - could be extended to use current working directory
    // or project directory for better proximity scoring
    
    // For now, score shorter paths higher (closer to root)
    int depth = 0;
    for (char c : result.path) {
        if (c == '/' || c == '\\') {
            depth++;
        }
    }
    
    // Max reasonable depth is around 10
    return std::max(0.0, 1.0 - (depth / 10.0));
}

double Ranker::scoreRecency(const SearchResult& result) {
    if (result.lastModified == 0) {
        return 0.0;  // No modification time available
    }
    
    // Get current time
    auto now = std::chrono::system_clock::now();
    auto nowEpoch = std::chrono::duration_cast<std::chrono::seconds>(
        now.time_since_epoch()).count();
    
    // Calculate time difference in days
    auto diffSeconds = nowEpoch - result.lastModified;
    auto diffDays = diffSeconds / (60 * 60 * 24);
    
    // Score based on recency - higher score for more recently modified files
    // Score ranges from 1.0 (modified today) to 0.0 (modified more than 60 days ago)
    if (diffDays < 0) {
        return 0.5;  // Future dates (clock skew) get a medium score
    } else if (diffDays == 0) {
        return 1.0;  // Modified today
    } else if (diffDays < 7) {
        return 0.8;  // Modified this week
    } else if (diffDays < 30) {
        return 0.6;  // Modified this month
    } else if (diffDays < 60) {
        return 0.3;  // Modified in last two months
    } else {
        return 0.0;  // Older
    }
} 