{
  "targets":[
    {
      "target_name":"searchAddon",
      "sources":[
        "searchAddon.cpp",
        "FileCrawler.cpp",
        "EverythingIndexer.cpp",
        "SQLiteIndexer.cpp",
        "QueryParser.cpp",
        "Ranker.cpp",
        "SearchManager.cpp"
      ],
      "include_dirs":[
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies":[ "<!(node -p \"require('node-addon-api').gyp\")" ],
      "defines": [ 
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "_SILENCE_CXX17_CODECVT_HEADER_DEPRECATION_WARNING",
        "_HAS_STD_BYTE=0"
      ],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1,
          "AdditionalOptions": ["/std:c++17"]
        }
      },
      "conditions": [
        ["OS=='win'", {
          "defines": [
            "UNICODE",
            "_UNICODE",
            "_SILENCE_ALL_CXX17_DEPRECATION_WARNINGS"
          ]
        }]
      ],
      "cflags_cc": ["-std=c++17", "-Wall", "-Wextra"]
    }
  ]
} 