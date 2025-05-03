#include "EverythingIndexer.h"
#include <Windows.h>
#include <string>
#include <codecvt>
#include <locale>

// Declarations for Everything SDK function importing
typedef BOOL (__stdcall *EVERYTHING_IPC_QUERY)(BOOL);
typedef DWORD (__stdcall *EVERYTHING_GET_NUM_RESULTS)();
typedef LPCTSTR (__stdcall *EVERYTHING_GET_RESULT_PATHW)(DWORD);
typedef void (__stdcall *EVERYTHING_SET_SEARCHW)(LPCWSTR);
typedef void (__stdcall *EVERYTHING_SET_REQUEST_FLAGS)(DWORD);

// Global variables for Everything SDK functions
HMODULE everythingDll = NULL;
EVERYTHING_IPC_QUERY Everything_Query = NULL;
EVERYTHING_GET_NUM_RESULTS Everything_GetNumResults = NULL;
EVERYTHING_GET_RESULT_PATHW Everything_GetResultPathW = NULL;
EVERYTHING_SET_SEARCHW Everything_SetSearchW = NULL;
EVERYTHING_SET_REQUEST_FLAGS Everything_SetRequestFlags = NULL;

EverythingIndexer::EverythingIndexer() : everythingAvailable(false) {}

EverythingIndexer::~EverythingIndexer() {
    if (everythingDll) {
        FreeLibrary(everythingDll);
        everythingDll = NULL;
    }
}

bool EverythingIndexer::initialize() {
    // Try to load the Everything SDK DLL
    // First try the version specified by environment variable
    const char* sdkPathEnv = std::getenv("EVERYTHING_SDK_PATH");
    if (sdkPathEnv) {
        std::string dllPath = std::string(sdkPathEnv) + "\\bin\\Everything64.dll";
        everythingDll = LoadLibraryA(dllPath.c_str());
    }
    
    // If that didn't work, try the default location
    if (!everythingDll) {
        everythingDll = LoadLibrary(TEXT("Everything64.dll"));
    }
    
    if (!everythingDll) {
        return false;
    }

    // Get function pointers - using Unicode versions
    Everything_Query = (EVERYTHING_IPC_QUERY)GetProcAddress(everythingDll, "Everything_Query");
    Everything_GetNumResults = (EVERYTHING_GET_NUM_RESULTS)GetProcAddress(everythingDll, "Everything_GetNumResults");
    Everything_GetResultPathW = (EVERYTHING_GET_RESULT_PATHW)GetProcAddress(everythingDll, "Everything_GetResultPathW");
    Everything_SetSearchW = (EVERYTHING_SET_SEARCHW)GetProcAddress(everythingDll, "Everything_SetSearchW");
    Everything_SetRequestFlags = (EVERYTHING_SET_REQUEST_FLAGS)GetProcAddress(everythingDll, "Everything_SetRequestFlags");

    // Check if all functions were found
    everythingAvailable = (Everything_Query && Everything_GetNumResults && 
                           Everything_GetResultPathW && Everything_SetSearchW &&
                           Everything_SetRequestFlags);
    
    return everythingAvailable;
}

bool EverythingIndexer::isAvailable() const {
    return everythingAvailable;
}

std::vector<std::string> EverythingIndexer::search(const std::string& query, int limit) {
    std::vector<std::string> results;
    
    if (!everythingAvailable) {
        return results;
    }

    try {
        // Convert UTF-8 query to UTF-16 using proper conversion
        std::wstring_convert<std::codecvt_utf8_utf16<wchar_t>> converter;
        std::wstring wideQuery = converter.from_bytes(query);
        
        // Set search query (Unicode version)
        Everything_SetSearchW(wideQuery.c_str());

        // Set request flags (file paths and more metadata)
        // EVERYTHING_REQUEST_FILE_NAME | EVERYTHING_REQUEST_PATH | EVERYTHING_REQUEST_DATE_MODIFIED
        Everything_SetRequestFlags(3);

        // Execute query
        if (Everything_Query(TRUE)) {
            // Get results
            DWORD numResults = Everything_GetNumResults();
            for (DWORD i = 0; i < numResults && i < static_cast<DWORD>(limit); i++) {
                LPCWSTR wPath = Everything_GetResultPathW(i);
                if (wPath && *wPath) {
                    // Convert from wide char to UTF-8
                    try {
                        std::string utf8Path = converter.to_bytes(wPath);
                        results.push_back(utf8Path);
                    } catch (const std::exception& e) {
                        // Handle conversion error for this path
                        continue;
                    }
                }
            }
        }
    } catch (const std::exception& e) {
        // Log error or handle exception
    }

    return results;
} 