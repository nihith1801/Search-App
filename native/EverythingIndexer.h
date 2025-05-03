#pragma once
#include <string>
#include <vector>
#include <functional>

class EverythingIndexer {
public:
    EverythingIndexer();
    ~EverythingIndexer();

    bool initialize();
    bool isAvailable() const;
    
    // Use Everything SDK to search for files
    std::vector<std::string> search(const std::string& query, int limit);
    
private:
    bool everythingAvailable;
}; 