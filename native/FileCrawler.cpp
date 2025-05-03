#include "FileCrawler.h"
#include <filesystem>
#include <algorithm>
#include <iostream>
#include <unordered_set>
#include <cctype>

namespace fs = std::filesystem;

FileCrawler::FileCrawler() {
    // File extensions to skip (only temporary/system files)
    skipExtensions = {".tmp", ".bak", ".obj", ".pdb", ".ilk", ".ipch", ".lock", ".swp"};
    
    // Directories to skip
    skipDirectories = {
        ".git", ".svn", "node_modules", "build", "bin", "obj", 
        "Debug", "Release", ".vs", ".vscode", "$RECYCLE.BIN", "System Volume Information"
    };

    // Initialize common file extensions by category
    initializeFileTypes();
}

FileCrawler::~FileCrawler() {}

void FileCrawler::initializeFileTypes() {
    // Document files
    fileTypeCategories["document"] = {
        ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", 
        ".odt", ".ods", ".odp", ".txt", ".rtf", ".csv", ".xml", ".json"
    };
    
    // Image files
    fileTypeCategories["image"] = {
        ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".svg", 
        ".webp", ".ico", ".psd", ".ai", ".raw", ".cr2", ".nef"
    };
    
    // Audio files
    fileTypeCategories["audio"] = {
        ".mp3", ".wav", ".ogg", ".flac", ".aac", ".wma", ".m4a", 
        ".opus", ".aiff", ".mid", ".midi"
    };
    
    // Video files
    fileTypeCategories["video"] = {
        ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", 
        ".m4v", ".mpg", ".mpeg", ".3gp", ".ts", ".mts"
    };
    
    // Archive files
    fileTypeCategories["archive"] = {
        ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".iso"
    };
    
    // Source code files
    fileTypeCategories["code"] = {
        ".c", ".cpp", ".h", ".hpp", ".java", ".js", ".jsx", ".ts", ".tsx", 
        ".py", ".rb", ".php", ".cs", ".go", ".swift", ".kt", ".rs", ".asm",
        ".html", ".css", ".scss", ".less", ".sql", ".sh", ".ps1", ".bat"
    };
    
    // Executable files
    fileTypeCategories["executable"] = {
        ".exe", ".dll", ".so", ".dylib", ".app", ".msi", ".apk", ".deb", ".rpm"
    };
}

void FileCrawler::crawlDirectory(const std::string& path, 
                                std::function<void(const std::string&)> fileCallback) {
    try {
        for (const auto& entry : fs::recursive_directory_iterator(
                path, 
                fs::directory_options::skip_permission_denied
            )) {
            try {
                if (fs::is_directory(entry.status())) {
                    if (shouldSkipDirectory(entry.path().filename().string())) {
                        continue;
                    }
                } else if (fs::is_regular_file(entry.status())) {
                    std::string filePath = entry.path().string();
                    if (!shouldSkipFile(filePath)) {
                        fileCallback(filePath);
                    }
                }
            } catch (const fs::filesystem_error& e) {
                std::cerr << "Error accessing path: " << entry.path() << ": " 
                          << e.what() << std::endl;
                continue;
            }
        }
    } catch (const fs::filesystem_error& e) {
        std::cerr << "Error traversing directory: " << path << ": " 
                  << e.what() << std::endl;
    }
}

bool FileCrawler::shouldSkipFile(const std::string& filename) {
    std::string extension = fs::path(filename).extension().string();
    std::transform(extension.begin(), extension.end(), extension.begin(), ::tolower);
    
    // Skip temporary and system files
    return std::find(skipExtensions.begin(), skipExtensions.end(), extension) 
           != skipExtensions.end();
}

bool FileCrawler::shouldSkipDirectory(const std::string& dirname) {
    std::string lowercaseDirname = dirname;
    std::transform(lowercaseDirname.begin(), lowercaseDirname.end(), 
                   lowercaseDirname.begin(), ::tolower);
    
    return std::find(skipDirectories.begin(), skipDirectories.end(), lowercaseDirname) 
           != skipDirectories.end();
}

std::string FileCrawler::getFileCategory(const std::string& filePath) {
    std::string extension = fs::path(filePath).extension().string();
    std::transform(extension.begin(), extension.end(), extension.begin(), ::tolower);
    
    for (const auto& category : fileTypeCategories) {
        if (std::find(category.second.begin(), category.second.end(), extension) 
            != category.second.end()) {
            return category.first;
        }
    }
    
    // Default category if not found
    return "other";
}

std::string FileCrawler::getFileTypeName(const std::string& filePath) {
    std::string extension = fs::path(filePath).extension().string();
    
    if (extension.empty()) {
        return "File";
    }
    
    // Remove leading dot and convert to lowercase for comparison
    std::string extLower = extension;
    if (extLower[0] == '.') {
        extLower = extLower.substr(1);
    }
    std::transform(extLower.begin(), extLower.end(), extLower.begin(), ::tolower);
    
    // Keep original extension case for display, just remove the dot
    std::string displayExt = extension[0] == '.' ? extension.substr(1) : extension;
    
    // Get category and use more specific type names
    std::string category = getFileCategory(filePath);
    
    // Use more specific names for common file types
    if (category == "document") {
        if (extLower == "pdf") return "PDF Document";
        if (extLower == "doc" || extLower == "docx") return "Word Document";
        if (extLower == "txt") return "Text File";
        if (extLower == "md" || extLower == "markdown") return "Markdown Document";
        if (extLower == "rtf") return "Rich Text Document";
        if (extLower == "odt") return "OpenDocument Text";
        if (extLower == "json") return "JSON Data";
        if (extLower == "xml") return "XML Data";
        if (extLower == "csv") return "CSV Data";
        return displayExt + " Document";
    }
    
    if (category == "image") {
        if (extLower == "jpg" || extLower == "jpeg") return "JPEG Image";
        if (extLower == "png") return "PNG Image";
        if (extLower == "gif") return "GIF Image";
        if (extLower == "svg") return "SVG Vector";
        if (extLower == "webp") return "WebP Image";
        if (extLower == "ico") return "Icon File";
        return displayExt + " Image";
    }
    
    if (category == "audio") {
        if (extLower == "mp3") return "MP3 Audio";
        if (extLower == "wav") return "WAV Audio";
        if (extLower == "flac") return "FLAC Audio";
        if (extLower == "ogg") return "OGG Audio";
        if (extLower == "m4a") return "M4A Audio";
        return displayExt + " Audio";
    }
    
    if (category == "video") {
        if (extLower == "mp4") return "MP4 Video";
        if (extLower == "mkv") return "MKV Video";
        if (extLower == "avi") return "AVI Video";
        if (extLower == "mov") return "QuickTime Video";
        if (extLower == "webm") return "WebM Video";
        return displayExt + " Video";
    }
    
    if (category == "archive") {
        if (extLower == "zip") return "ZIP Archive";
        if (extLower == "rar") return "RAR Archive";
        if (extLower == "7z") return "7-Zip Archive";
        if (extLower == "tar") return "TAR Archive";
        if (extLower == "gz" || extLower == "gzip") return "GZip Archive";
        return displayExt + " Archive";
    }
    
    if (category == "code") {
        if (extLower == "py") return "Python Script";
        if (extLower == "js") return "JavaScript Code";
        if (extLower == "jsx") return "React Component";
        if (extLower == "ts") return "TypeScript Code";
        if (extLower == "tsx") return "React TypeScript";
        if (extLower == "html") return "HTML Document";
        if (extLower == "css") return "CSS Stylesheet";
        if (extLower == "c") return "C Source";
        if (extLower == "cpp" || extLower == "cc") return "C++ Source";
        if (extLower == "h" || extLower == "hpp") return "C/C++ Header";
        if (extLower == "java") return "Java Source";
        if (extLower == "php") return "PHP Script";
        if (extLower == "rb") return "Ruby Script";
        if (extLower == "go") return "Go Source";
        if (extLower == "rs") return "Rust Source";
        if (extLower == "sh" || extLower == "bash") return "Shell Script";
        if (extLower == "sql") return "SQL Script";
        return displayExt + " Source File";
    }
    
    if (category == "executable") {
        if (extLower == "exe") return "Windows Executable";
        if (extLower == "dll") return "Dynamic Library";
        if (extLower == "app") return "macOS Application";
        if (extLower == "apk") return "Android Package";
        if (extLower == "msi") return "Windows Installer";
        return displayExt + " Application";
    }
    
    // For other or unknown types, just show the extension
    return displayExt + " File";
} 