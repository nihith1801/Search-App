#pragma once
#include <string>
#include <vector>
#include "SQLiteIndexer.h"  // For SearchResult struct

class Ranker {
public:
    Ranker();
    ~Ranker();
    
    // Rank and sort a list of search results based on query relevance
    std::vector<SearchResult> rankResults(const std::string& query, 
                                          const std::vector<SearchResult>& results);
    
private:
    // Calculate a score for how well a result matches the query
    double calculateScore(const std::string& query, const SearchResult& result);
    
    // Matching functions with different weights
    double scoreExactMatch(const std::string& query, const SearchResult& result);
    double scorePartialMatch(const std::string& query, const SearchResult& result);
    double scoreTokenMatch(const std::string& query, const SearchResult& result);
    double scorePathProximity(const SearchResult& result);
    double scoreRecency(const SearchResult& result);
    
    // Weights for different ranking factors
    struct {
        double exactMatch;
        double filenameMatch;
        double pathMatch;
        double recentlyUsed;
        double proximity;
        double recency;
        double extensionMatch;
    } weights;
}; 