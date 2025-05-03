#pragma once
#include <string>
#include <vector>

class QueryParser {
public:
    QueryParser();
    ~QueryParser();
    
    // Parse a user query into a query suitable for search engines
    // Supports advanced syntax like:
    // - File type filter: *.pdf
    // - Path filter: in:Documents or path:Documents
    std::string parseQuery(const std::string& userQuery);
    
    // Create a fuzzy search query by adding wildcards between words
    std::string createFuzzyQuery(const std::string& userQuery);
    
    // Extract keywords from a file path
    std::vector<std::string> extractKeywords(const std::string& filePath);
    
private:
    // Process tokens with AND operators
    std::string normalizeTokens(const std::string& text);
    
    // Clean up and normalize query text
    std::string normalizeText(const std::string& text);
    
    // Split text into words
    std::vector<std::string> tokenize(const std::string& text);
    
    // Remove common words that don't add value to search
    bool isStopWord(const std::string& word);
}; 