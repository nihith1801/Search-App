#include "QueryParser.h"
#include <algorithm>
#include <cctype>
#include <sstream>
#include <unordered_set>
#include <filesystem>
#include <regex>
#include <iostream>

namespace fs = std::filesystem;

QueryParser::QueryParser() = default;

QueryParser::~QueryParser() = default;

std::string QueryParser::parseQuery(const std::string& userQuery) {
    // Check for empty query
    if (userQuery.empty()) {
        return "";
    }
    
    // Check for file extension filter (*.ext)
    std::regex extPattern(R"(\*\.([a-zA-Z0-9]+))");
    std::smatch extMatch;
    
    std::string extension;
    if (std::regex_search(userQuery, extMatch, extPattern)) {
        extension = extMatch[1].str();
    }
    
    // Check for path/folder filter (in:folder, path:folder)
    std::regex pathPattern(R"((in|path):([^\s]+))");
    std::smatch pathMatch;
    
    std::string pathPrefix;
    if (std::regex_search(userQuery, pathMatch, pathPattern)) {
        pathPrefix = pathMatch[2].str();
    }
    
    // Clean up the query - remove special operators we've extracted
    std::string cleanQuery = userQuery;
    
    if (!extension.empty()) {
        cleanQuery = std::regex_replace(cleanQuery, std::regex(R"(\*\.[a-zA-Z0-9]+)"), "");
    }
    
    if (!pathPrefix.empty()) {
        cleanQuery = std::regex_replace(cleanQuery, std::regex(R"((in|path):[^\s]+)"), "");
    }
    
    // Normalize and tokenize the remaining text
    cleanQuery = normalizeText(cleanQuery);
    
    // Build the final query
    std::stringstream finalQuery;
    
    // Add cleaned terms
    if (!cleanQuery.empty()) {
        finalQuery << cleanQuery;
    }
    
    // Add file extension filter if provided
    if (!extension.empty()) {
        if (!cleanQuery.empty()) finalQuery << " AND ";
        finalQuery << "extension:" << extension;
    }
    
    // Add path filter if provided
    if (!pathPrefix.empty()) {
        if (!cleanQuery.empty() || !extension.empty()) finalQuery << " AND ";
        finalQuery << "path:" << pathPrefix;
    }
    
    return finalQuery.str();
}

std::string QueryParser::createFuzzyQuery(const std::string& userQuery) {
    // First parse the query to extract any special operators
    std::string parsedQuery = parseQuery(userQuery);
    
    // If it's empty or just contains operators, return as is
    if (parsedQuery.empty() || 
        parsedQuery.find("extension:") != std::string::npos || 
        parsedQuery.find("path:") != std::string::npos) {
        return parsedQuery;
    }
    
    // Split into terms
    std::vector<std::string> terms = tokenize(parsedQuery);
    
    // Skip fuzzy processing if it's just one term
    if (terms.size() <= 1) {
        return parsedQuery;
    }
    
    // Process each term for fuzzy search
    std::stringstream fuzzyQuery;
    bool isFirst = true;
    
    for (const auto& term : terms) {
        // Skip very short terms
        if (term.length() < 2) continue;
        
        // Add appropriate separator
        if (!isFirst) fuzzyQuery << " AND ";
        isFirst = false;
        
        // Make the term fuzzy by adding wildcards
        if (term.length() > 3) {
            // For longer terms, add wildcards between characters 
            // to catch misspellings and partial matches
            fuzzyQuery << term.substr(0, 1); // First character exact
            
            for (size_t i = 1; i < term.length() - 1; i++) {
                fuzzyQuery << "*" << term[i];
            }
            
            fuzzyQuery << "*" << term.back(); // Last character with wildcard before
            fuzzyQuery << "*"; // Trailing wildcard
        } else {
            // For shorter terms, just use prefix matching
            fuzzyQuery << term << "*";
        }
    }
    
    return fuzzyQuery.str();
}

std::vector<std::string> QueryParser::extractKeywords(const std::string& filePath) {
    // Normalize and tokenize the file path
    std::string normalizedPath = normalizeText(filePath);
    return tokenize(normalizedPath);
}

std::string QueryParser::normalizeTokens(const std::string& text) {
    std::vector<std::string> tokens = tokenize(text);
    
    // Join tokens with AND operator for better search precision
    std::string result;
    for (size_t i = 0; i < tokens.size(); ++i) {
        result += tokens[i];
        if (i < tokens.size() - 1) {
            result += " AND ";
        }
    }
    
    return result;
}

std::string QueryParser::normalizeText(const std::string& text) {
    std::string result;
    
    // Convert to lowercase
    result.resize(text.size());
    std::transform(text.begin(), text.end(), result.begin(),
                   [](unsigned char c) { return std::tolower(c); });
    
    // Replace non-alphanumeric chars with spaces
    for (char& c : result) {
        if (!std::isalnum(static_cast<unsigned char>(c)) && c != '*' && c != '.') {
            c = ' ';
        }
    }
    
    // Replace multiple spaces with a single space
    std::string cleanResult;
    bool lastWasSpace = true;  // Start true to trim leading spaces
    
    for (char c : result) {
        if (c == ' ') {
            if (!lastWasSpace) {
                cleanResult += c;
                lastWasSpace = true;
            }
        } else {
            cleanResult += c;
            lastWasSpace = false;
        }
    }
    
    // Remove trailing space if any
    if (!cleanResult.empty() && cleanResult.back() == ' ') {
        cleanResult.pop_back();
    }
    
    return cleanResult;
}

std::vector<std::string> QueryParser::tokenize(const std::string& text) {
    std::vector<std::string> tokens;
    std::stringstream ss(text);
    std::string token;
    
    while (ss >> token) {
        // Skip very short tokens and common stop words
        if (token.length() > 1 && !isStopWord(token)) {
            tokens.push_back(token);
        }
    }
    
    return tokens;
}

bool QueryParser::isStopWord(const std::string& word) {
    static const std::unordered_set<std::string> stopWords = {
        "a", "an", "the", "and", "or", "but", "is", "are", "was", "were",
        "be", "been", "being", "in", "on", "at", "to", "for", "with", "by",
        "about", "against", "between", "into", "through", "during", "before",
        "after", "above", "below", "from", "up", "down", "of", "off", "over",
        "under", "again", "further", "then", "once", "here", "there", "when",
        "where", "why", "how", "all", "any", "both", "each", "few", "more",
        "most", "other", "some", "such", "no", "nor", "not", "only", "own",
        "same", "so", "than", "too", "very", "can", "will", "just", "should",
        "now"
    };
    
    return stopWords.find(word) != stopWords.end();
} 