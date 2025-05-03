#pragma once
#include <string>
#include <vector>
#include <functional>
#include <unordered_map>

class FileCrawler {
public:
    FileCrawler();
    ~FileCrawler();

    void crawlDirectory(const std::string& path, 
                        std::function<void(const std::string&)> fileCallback);
    
    // Get the category of a file based on its extension
    std::string getFileCategory(const std::string& filePath);
    
    // Get a descriptive name for a file type
    std::string getFileTypeName(const std::string& filePath);
    
private:
    // Initialize the file type categories
    void initializeFileTypes();
    
    bool shouldSkipFile(const std::string& filename);
    bool shouldSkipDirectory(const std::string& dirname);
    std::vector<std::string> skipExtensions;
    std::vector<std::string> skipDirectories;
    
    // Map of file categories to their extensions
    std::unordered_map<std::string, std::vector<std::string>> fileTypeCategories;
}; 