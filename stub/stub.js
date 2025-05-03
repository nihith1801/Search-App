/**
 * High-Performance File Indexer and Search
 * No SQLite dependency, pure JavaScript implementation
 * Optimized for Windows file systems
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const crypto = require('crypto');

// In-memory index of files
let fileIndex = [];
let indexStats = {
  totalFiles: 0,
  totalDirectories: 0,
  lastUpdated: 0,
  indexingComplete: false,
  progress: 0
};

// Store configured drives for indexing
let drivesToIndex = [];

// Cache file location
const INDEX_CACHE_DIR = path.join(process.env.APPDATA || process.env.HOME || os.tmpdir(), 'FileSearchApp');
const INDEX_CACHE_FILE = path.join(INDEX_CACHE_DIR, 'file_index_cache.json');

// Ensure cache directory exists
try {
  if (!fs.existsSync(INDEX_CACHE_DIR)) {
    fs.mkdirSync(INDEX_CACHE_DIR, { recursive: true });
    console.log(`Created cache directory: ${INDEX_CACHE_DIR}`);
  }
} catch (err) {
  console.error('Failed to create cache directory:', err.message);
}

// Extension categories for faster searching
const fileCategories = {
  document: ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.rtf', '.odt', '.md', '.csv'],
  image: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp', '.svg', '.ico', '.heic', '.raw'],
  video: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg'],
  audio: ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.wma', '.m4a', '.opus'],
  executable: ['.exe', '.bat', '.cmd', '.com', '.msi', '.app', '.vbs', '.ps1', '.scr', '.reg', '.msc', '.appx', '.msix'],
  archive: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.iso'],
  code: ['.js', '.py', '.java', '.c', '.cpp', '.cs', '.php', '.html', '.css', '.ts', '.go', '.rb']
};

// Search result class
class SearchResult {
  constructor(path, filename, extension, lastModified, fileType = 'file') {
    this.path = path;
    this.filename = filename;
    this.extension = extension.toLowerCase().replace(/^\./, '');
    this.lastModified = lastModified;
    this.timestamp = lastModified; // For API compatibility
    this.icon = this.getIconType(this.extension);
  }

  // Get appropriate icon for file type
  getIconType(extension) {
    if (!extension) return 'file';
    
    // Check known categories
    for (const [category, extensions] of Object.entries(fileCategories)) {
      if (extensions.includes(`.${extension.toLowerCase()}`)) {
        return category;
      }
    }
    
    // Fallback to generic file
    return 'file';
  }
}

/**
 * Optimized File Crawler that balances speed and memory usage
 */
class FastFileCrawler {
  constructor() {
    // Skip these directories to avoid wasting time and permissions issues
    this.skipDirectories = [
      'node_modules',
      '$Recycle.Bin',
      '$RECYCLE.BIN',
      'System Volume Information',
      'Windows.old',
      'ProgramData',
      'AppData',
      'Recovery',
      'tmp',
      'temp',
      'cache',
      '.git',
      '.svn',
      '.vscode',
      '.vs'
    ];
    
    // Skip these extensions to avoid indexing temporary files
    this.skipExtensions = [
      '.tmp', '.temp', '.bak', '.ds_store', '.log', '.cache',
      '.obj', '.pdb', '.ilk', '.ipch', '.tlog', '.db'
    ];
    
    // File counts for stats
    this.fileCount = 0;
    this.dirCount = 0;
    this.interrupted = false;
    
    // Chunking parameters for responsive UI
    this.chunkSize = 100; // Process this many items before yielding
    this.yieldTime = 5; // Milliseconds to wait between chunks
  }
  
  shouldSkipDirectory(dirPath) {
    const basename = path.basename(dirPath).toLowerCase();
    return this.skipDirectories.some(skip => basename === skip || basename.startsWith(skip + '.'));
  }
  
  shouldSkipFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return this.skipExtensions.includes(ext);
  }
  
  /**
   * Crawl directories with controlled recursion and speed
   */
  crawlDirectories(directories, fileCallback, progressCallback) {
    this.fileCount = 0;
    this.dirCount = 0;
    this.interrupted = false;
    
    return new Promise((resolve, reject) => {
      this.doCrawl(directories, fileCallback, progressCallback)
        .then(result => resolve(result))
        .catch(err => {
          console.error('Crawler error:', err);
          resolve({
            fileCount: this.fileCount,
            dirCount: this.dirCount,
            interrupted: true
          });
        });
    });
  }
  
  /**
   * Asynchronous crawling implementation with chunking
   */
  async doCrawl(directories, fileCallback, progressCallback) {
    let processed = 0;
    const totalDirs = directories.length;
    
    // Create a queue for breadth-first traversal (more efficient for Windows)
    const queue = [...directories];
    
    let chunkCounter = 0;
    
    // Process directories in chunks
    while (queue.length > 0 && !this.interrupted) {
      try {
        const currentDir = queue.shift();
        
        // Skip if this directory should be excluded
        if (this.shouldSkipDirectory(currentDir)) {
          continue;
        }
        
        this.dirCount++;
        
        // Read directory contents
        try {
          const entries = fs.readdirSync(currentDir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            
            try {
              if (entry.isDirectory()) {
                // Add directory to queue if it's not in skip list
                if (!this.shouldSkipDirectory(fullPath)) {
                  queue.push(fullPath);
                }
              } else if (entry.isFile() && !this.shouldSkipFile(fullPath)) {
                // Process the file
                this.fileCount++;
                fileCallback(fullPath);
                
                // Update progress periodically
                if (this.fileCount % 1000 === 0 && progressCallback) {
                  const progress = this.calculateProgress(totalDirs, processed, queue.length);
                  if (!progressCallback(progress)) {
                    this.interrupted = true;
                    break;
                  }
                }
              }
            } catch (err) {
              // Skip inaccessible files
            }
          }
        } catch (err) {
          // Skip inaccessible directories
        }
        
        // Update processed count
        processed++;
        
        // Update progress
        if (progressCallback && processed % 10 === 0) {
          const progress = this.calculateProgress(totalDirs, processed, queue.length);
          if (!progressCallback(progress)) {
            this.interrupted = true;
          }
        }
        
        // Chunk processing to keep UI responsive
        chunkCounter++;
        if (chunkCounter >= this.chunkSize) {
          chunkCounter = 0;
          await new Promise(resolve => setTimeout(resolve, this.yieldTime));
        }
      } catch (err) {
        console.error('Crawler error:', err.message);
      }
    }
    
    return {
      fileCount: this.fileCount,
      dirCount: this.dirCount,
      interrupted: this.interrupted
    };
  }
  
  calculateProgress(totalDirs, processed, remaining) {
    // More accurate progress calculation using both processed directories and queue size
    const baseProgress = processed / (processed + remaining);
    return Math.min(0.99, baseProgress);
  }
}

/**
 * Optimized in-memory indexer
 */
class HighPerformanceIndexer {
  constructor() {
    this.index = [];
    this.nameIndex = new Map(); // For quick filename lookups
    this.extIndex = new Map();  // For quick extension lookups
    this.pathIndex = new Map(); // For quick path lookups
    this.crawler = new FastFileCrawler();
    this.indexingProgress = 0;
    this.initialized = false;
    this.lastQuery = ''; // Store last query for caching
    this.queryCache = new Map(); // Cache for frequent queries
  }
  
  initialize() {
    this.initialized = true;
    
    // Try loading cached index on startup
    this.loadIndexCache();
    
    return true;
  }
  
  /**
   * Save the current index to disk for faster startup
   */
  saveIndexCache() {
    try {
      // Don't save empty indexes
      if (this.index.length === 0) {
        console.log('Index is empty, not saving cache');
        return false;
      }
      
      console.log(`Saving index cache with ${this.index.length} files`);
      
      // Prepare cache data
      const cacheData = {
        timestamp: Date.now(),
        drivesToIndex,
        stats: indexStats,
        index: this.index
      };
      
      // Write to file
      fs.writeFileSync(INDEX_CACHE_FILE, JSON.stringify(cacheData), 'utf8');
      
      console.log(`Index cache saved to ${INDEX_CACHE_FILE}`);
      return true;
    } catch (err) {
      console.error('Failed to save index cache:', err.message);
      return false;
    }
  }
  
  /**
   * Load previously saved index from disk
   */
  loadIndexCache() {
    try {
      if (!fs.existsSync(INDEX_CACHE_FILE)) {
        console.log('No index cache found');
        return false;
      }
      
      console.log(`Loading index cache from ${INDEX_CACHE_FILE}`);
      
      // Read cache file
      const cacheData = JSON.parse(fs.readFileSync(INDEX_CACHE_FILE, 'utf8'));
      
      // Check if cache is recent enough (less than 1 day old)
      const cacheAge = Date.now() - cacheData.timestamp;
      const MAX_CACHE_AGE = 24 * 60 * 60 * 1000; // 1 day
      
      if (cacheAge > MAX_CACHE_AGE) {
        console.log(`Cache is too old (${Math.round(cacheAge / 1000 / 60 / 60)} hours), rebuilding`);
        return false;
      }
      
      // Restore index and stats
      this.index = cacheData.index;
      indexStats = cacheData.stats;
      drivesToIndex = cacheData.drivesToIndex;
      
      // Rebuild specialized indexes
      this.rebuildSpecializedIndexes();
      
      // Update stats
      indexStats.lastUpdated = Date.now();
      
      console.log(`Loaded index cache with ${this.index.length} files`);
      return true;
    } catch (err) {
      console.error('Failed to load index cache:', err.message);
      return false;
    }
  }
  
  /**
   * Rebuild specialized indexes after loading from cache
   */
  rebuildSpecializedIndexes() {
    console.log('Rebuilding specialized indexes');
    
    // Reset specialized indexes
    this.nameIndex = new Map();
    this.extIndex = new Map();
    this.pathIndex = new Map();
    
    // Rebuild indexes
    for (let i = 0; i < this.index.length; i++) {
      const item = this.index[i];
      
      // Name index
      const lowerName = item.filename.toLowerCase();
      if (!this.nameIndex.has(lowerName)) {
        this.nameIndex.set(lowerName, []);
      }
      this.nameIndex.get(lowerName).push(i);
      
      // Extension index
      const lowerExt = `.${item.extension.toLowerCase()}`;
      if (lowerExt !== '.') {
        if (!this.extIndex.has(lowerExt)) {
          this.extIndex.set(lowerExt, []);
        }
        this.extIndex.get(lowerExt).push(i);
      }
      
      // Path segments index
      const dirPath = path.dirname(item.path).toLowerCase();
      const segments = dirPath.split(path.sep);
      
      for (const segment of segments) {
        if (segment && segment.length > 2) {
          if (!this.pathIndex.has(segment)) {
            this.pathIndex.set(segment, []);
          }
          this.pathIndex.get(segment).push(i);
        }
      }
    }
    
    console.log(`Rebuilt indexes: ${this.nameIndex.size} names, ${this.extIndex.size} extensions, ${this.pathIndex.size} path segments`);
  }
  
  isInitialized() {
    return this.initialized;
  }
  
  /**
   * Get file stats and add to index
   */
  addToIndex(filePath) {
    try {
      // Skip files with specific names that often cause issues
      const filename = path.basename(filePath);
      const extension = path.extname(filePath);
      
      // Skip certain problematic files
      if (filename === 'desktop.ini' || filename === 'thumbs.db' || filename === '$recycle.bin') {
        return false;
      }
      
      // Get file stats with thorough error handling
      let stats;
      try {
        stats = fs.statSync(filePath);
        
        // Skip zero-byte files as they're often placeholders or temp files
        if (stats.size === 0 && extension !== '.txt') {
          return false;
        }
      } catch (statErr) {
        // Skip files we can't get stats for
        return false;
      }
      
      // Create the search result
      const result = new SearchResult(
        filePath,
        filename,
        extension,
        stats.mtime.getTime()
      );
      
      // Add to main index
      this.index.push(result);
      
      // Add to specialized indexes for faster searching
      
      // Name index (lowercase for case-insensitive search)
      const lowerName = filename.toLowerCase();
      if (!this.nameIndex.has(lowerName)) {
        this.nameIndex.set(lowerName, []);
      }
      this.nameIndex.get(lowerName).push(this.index.length - 1);
      
      // Extension index
      const lowerExt = extension.toLowerCase();
      if (lowerExt) {
        if (!this.extIndex.has(lowerExt)) {
          this.extIndex.set(lowerExt, []);
        }
        this.extIndex.get(lowerExt).push(this.index.length - 1);
      }
      
      // Path segments index (for path searches)
      const dirPath = path.dirname(filePath).toLowerCase();
      const segments = dirPath.split(path.sep);
      
      for (const segment of segments) {
        if (segment && segment.length > 2) { // Skip very short segments
          if (!this.pathIndex.has(segment)) {
            this.pathIndex.set(segment, []);
          }
          this.pathIndex.get(segment).push(this.index.length - 1);
        }
      }
      
      return true;
    } catch (err) {
      // Skip problematic files but don't crash
      console.warn(`Skipping file due to error: ${filePath} - ${err.message}`);
      return false;
    }
  }
  
  /**
   * Update the index with new directories
   */
  updateIndex(directories, progressCallback) {
    console.log(`Updating index with directories: ${directories.join(', ')}`);
    
    // Reset index
    this.index = [];
    this.nameIndex = new Map();
    this.extIndex = new Map();
    this.pathIndex = new Map();
    this.indexingProgress = 0;
    indexStats.indexingComplete = false;
    indexStats.progress = 0;
    
    // Reset query cache
    this.queryCache = new Map();
    
    // Store global drives configuration
    drivesToIndex = [...directories];
    
    // Define progress handler
    const handleProgress = (progress) => {
      this.indexingProgress = progress;
      indexStats.progress = progress;
      return progressCallback ? progressCallback(progress) : true;
    };
    
    // Build the index
    const results = this.crawler.crawlDirectories(
      directories, 
      (filePath) => this.addToIndex(filePath),
      handleProgress
    );
    
    // Update stats
    indexStats.totalFiles = results.fileCount;
    indexStats.totalDirectories = results.dirCount;
    indexStats.lastUpdated = Date.now();
    indexStats.indexingComplete = !results.interrupted;
    this.indexingProgress = results.interrupted ? this.indexingProgress : 1.0;
    indexStats.progress = this.indexingProgress;
    
    console.log(`Indexing ${results.interrupted ? 'interrupted' : 'complete'}: ${results.fileCount} files in ${results.dirCount} directories`);
    
    // Save index cache if indexing completed
    if (!results.interrupted) {
      this.saveIndexCache();
    }
    
    return !results.interrupted;
  }
  
  /**
   * Get current indexing progress
   */
  getIndexingProgress() {
    return this.indexingProgress;
  }
  
  /**
   * Perform optimized search with various strategies
   */
  search(query, limit = 20) {
    return this.performSearch(query, limit, false);
  }
  
  /**
   * Perform fuzzy search
   */
  searchFuzzy(query, limit = 20) {
    return this.performSearch(query, limit, true);
  }
  
  /**
   * Core search implementation with customizable fuzzy behavior
   */
  performSearch(query, limit, fuzzy) {
    console.log(`Searching for "${query}" (limit: ${limit}, fuzzy: ${fuzzy})`);
    const startTime = performance.now();
    
    // Quick exit for empty query
    if (!query || !query.trim()) {
      return [];
    }
    
    query = query.trim();
    
    // Check if this is a D: drive specific search
    const isDDriveSearch = query.toLowerCase().includes('d:') || 
                          query.toLowerCase().includes('d\\') || 
                          query.toLowerCase().startsWith('d/');
    
    if (isDDriveSearch) {
      console.log('D: drive specific search detected, prioritizing D: drive results');
    }
    
    // Create a cache key that includes all search parameters
    const cacheKey = `${query}_${limit}_${fuzzy}_${isDDriveSearch}`;
    
    // Check cache first
    if (this.queryCache.has(cacheKey)) {
      console.log(`Query cache hit for "${query}"`);
      return this.queryCache.get(cacheKey);
    }
    
    // Handle special search types
    if (query.startsWith('ext:') || query.startsWith('extension:')) {
      const results = this.searchByExtension(query, limit);
      this.queryCache.set(cacheKey, results);
      return results;
    }
    
    if (query.startsWith('path:')) {
      const results = this.searchByPath(query.slice(5), limit);
      this.queryCache.set(cacheKey, results);
      return results;
    }
    
    // Special handling for executable searches
    const executableExtensions = ['exe', 'msi', 'com', 'bat', 'cmd', 'ps1', 'vbs', 'app', 'scr', 'reg', 'msc', 'appx', 'msix', 'lnk'];
    const normalizedQuery = query.trim().toLowerCase();
    
    // Check if user is searching for executables
    const isExeSearch = executableExtensions.some(ext => 
      normalizedQuery.includes(`.${ext}`) || 
      normalizedQuery.endsWith(ext) || 
      normalizedQuery === ext
    ) || 
    // Specific program search terms
    normalizedQuery.includes('app') ||
    normalizedQuery.includes('exe') ||
    normalizedQuery.includes('program') ||
    normalizedQuery.includes('launch') ||
    normalizedQuery.includes('start') ||
    normalizedQuery.includes('run') ||
    normalizedQuery.includes('application') ||
    normalizedQuery.includes('software') ||
    normalizedQuery.includes('tool') ||
    normalizedQuery.includes('utility');
    
    // Regular search
    const results = new Map(); // Use Map to avoid duplicates but maintain order
    const queryLower = query.toLowerCase();
    const queryParts = fuzzy ? queryLower.split(/\s+/).filter(p => p.length > 1) : [queryLower];
    
    // Try exact filename matches first (highest priority)
    if (this.nameIndex.has(queryLower)) {
      const exactMatches = this.nameIndex.get(queryLower);
      for (const idx of exactMatches) {
        const result = this.index[idx];
        
        // If this is a D: drive search, prioritize D: drive results
        if (isDDriveSearch && !result.path.startsWith('D:')) {
          continue; // Skip non-D: results in D: specific searches
        }
        
        results.set(result.path, result);
        if (results.size >= limit) break;
      }
    }
    
    // If searching for executables, add all matching executables first
    if (isExeSearch && results.size < limit) {
      console.log('Explicitly searching for executables');
      for (const ext of executableExtensions) {
        if (this.extIndex.has(`.${ext}`)) {
          const exeMatches = this.extIndex.get(`.${ext}`);
          for (const idx of exeMatches) {
            const result = this.index[idx];
            
            // If this is a D: drive search, prioritize D: drive results
            if (isDDriveSearch && !result.path.startsWith('D:')) {
              continue; // Skip non-D: results in D: specific searches
            }
            
            // Check if filename contains query terms
            if (queryParts.some(part => result.filename.toLowerCase().includes(part))) {
              results.set(result.path, result);
              if (results.size >= limit) break;
            }
          }
        }
        if (results.size >= limit) break;
      }
    }
    
    if (results.size >= limit) {
      const finalResults = Array.from(results.values());
      this.queryCache.set(cacheKey, finalResults);
      return finalResults;
    }
    
    // Try searching in filename (second priority)
    for (const item of this.index) {
      if (results.size >= limit) break;
      
      // For D: drive searches, prioritize D: drive results
      if (isDDriveSearch && !item.path.startsWith('D:')) {
        continue; // Skip non-D: results in D: specific searches
      }
      
      if (fuzzy) {
        // For fuzzy search, check if all parts are included
        const matchesAll = queryParts.every(part => 
          item.filename.toLowerCase().includes(part)
        );
        
        if (matchesAll) {
          results.set(item.path, item);
        }
      } else {
        // For regular search, simple inclusion check
        if (item.filename.toLowerCase().includes(queryLower)) {
          results.set(item.path, item);
        }
      }
    }
    
    // If we're specifically looking for D: drive results but have few,
    // try a broader search just within D: paths
    if (isDDriveSearch && results.size < Math.min(5, limit)) {
      console.log('Few D: drive results found, broadening D: drive search');
      
      // Try a more lenient search within D: paths only
      for (const item of this.index) {
        if (results.size >= limit) break;
        
        // Only look at D: drive paths
        if (!item.path.startsWith('D:')) continue;
        
        // Check if any query part matches
        if (queryParts.some(part => 
          item.filename.toLowerCase().includes(part) || 
          item.path.toLowerCase().includes(part)
        )) {
          results.set(item.path, item);
        }
      }
    }
    
    if (results.size >= limit) {
      const finalResults = Array.from(results.values());
      this.queryCache.set(cacheKey, finalResults);
      return finalResults;
    }
    
    // Try searching in path parts using path index (lowest priority)
    if (this.pathIndex.size > 0) {
      for (const part of queryParts) {
        if (part.length < 3) continue; // Skip short parts
        
        const matchingPaths = this.pathIndex.get(part) || [];
        for (const idx of matchingPaths) {
          if (results.size >= limit) break;
          const result = this.index[idx];
          
          // For D: drive searches, prioritize D: drive results
          if (isDDriveSearch && !result.path.startsWith('D:')) {
            continue; // Skip non-D: results in D: specific searches
          }
          
          results.set(result.path, result);
        }
      }
    }
    
    // Convert results to array
    const finalResults = Array.from(results.values());
    
    // Sort results by relevance
    const sortedResults = this.sortResultsByRelevance(finalResults, query, limit, isExeSearch);
    
    // Cache the results
    this.queryCache.set(cacheKey, sortedResults);
    
    // Log search performance
    const searchTime = (performance.now() - startTime);
    console.log(`Search completed in ${searchTime.toFixed(2)}ms, found ${sortedResults.length} results`);
    
    return sortedResults;
  }
  
  /**
   * Search by file extension
   */
  searchByExtension(query, limit) {
    let extension = query.includes(':') ? query.split(':')[1].trim() : '';
    if (!extension) return [];
    
    if (!extension.startsWith('.')) {
      extension = '.' + extension;
    }
    
    extension = extension.toLowerCase();
    
    // Use extension index if available
    if (this.extIndex.has(extension)) {
      const matches = this.extIndex.get(extension);
      return matches.slice(0, limit).map(idx => this.index[idx]);
    }
    
    // Fallback to linear search
    return this.index
      .filter(item => item.extension.toLowerCase() === extension)
      .slice(0, limit);
  }
  
  /**
   * Search by file path
   */
  searchByPath(pathQuery, limit) {
    const pathLower = pathQuery.toLowerCase();
    const results = [];
    
    // Use path index if possible
    if (pathLower.length > 2 && this.pathIndex.has(pathLower)) {
      const matches = this.pathIndex.get(pathLower);
      for (const idx of matches) {
        if (results.length >= limit) break;
        results.push(this.index[idx]);
      }
      return results;
    }
    
    // Fallback to linear search
    for (const item of this.index) {
      if (results.length >= limit) break;
      if (item.path.toLowerCase().includes(pathLower)) {
        results.push(item);
      }
    }
    
    return results;
  }
  
  /**
   * Sort search results by relevance
   */
  sortResultsByRelevance(results, query, limit, isExeSearch) {
    const queryLower = query.toLowerCase();
    const executableExtensions = ['exe', 'msi', 'com', 'bat', 'cmd', 'ps1', 'vbs', 'app', 'scr', 'reg', 'msc', 'appx', 'msix', 'lnk'];
    
    // Check if this is a D: drive specific search
    const isDDriveSearch = query.toLowerCase().includes('d:') || 
                           query.toLowerCase().includes('d\\') || 
                           query.toLowerCase().startsWith('d/');
                           
    // Detect if this is a program/application search
    const isProgramSearch = queryLower.includes('app') || 
                           queryLower.includes('exe') || 
                           queryLower.includes('program') ||
                           queryLower.includes('application') ||
                           queryLower.includes('software') ||
                           queryLower.includes('tool') ||
                           queryLower.includes('utility');
    
    // Common program locations to prioritize
    const programDirs = [
      'program files',
      'program files (x86)',
      'programs',
      'applications',
      'games',
      'steam',
      'start menu',
      'appdata'
    ];
    
    // Check if the path contains program directories
    const isInProgramDir = (path) => {
      const pathLower = path.toLowerCase();
      return programDirs.some(dir => pathLower.includes(dir));
    };
    
    results.sort((a, b) => {
      // Prioritize D: drive results for D: drive searches
      if (isDDriveSearch) {
        const aIsD = a.path.startsWith('D:');
        const bIsD = b.path.startsWith('D:');
        
        if (aIsD && !bIsD) return -1;
        if (!aIsD && bIsD) return 1;
      }
      
      // Extra priority for executables if explicitly searching for programs
      if (isExeSearch || isProgramSearch) {
        const aIsExe = executableExtensions.includes(a.extension.toLowerCase());
        const bIsExe = executableExtensions.includes(b.extension.toLowerCase());
        
        // Give highest priority to .exe files specifically
        const aIsActualExe = (a.extension || '').toLowerCase() === 'exe';
        const bIsActualExe = (b.extension || '').toLowerCase() === 'exe';
        
        // First prioritize .exe files
        if (aIsActualExe && !bIsActualExe) return -1;
        if (!aIsActualExe && bIsActualExe) return 1;
        
        // Then prioritize other executable types
        if (aIsExe && !bIsExe) return -1;
        if (!aIsExe && bIsExe) return 1;
        
        // If both are executables, prioritize by typical program locations
        if (aIsExe && bIsExe) {
          const aInProgramDir = isInProgramDir(a.path);
          const bInProgramDir = isInProgramDir(b.path);
          
          if (aInProgramDir && !bInProgramDir) return -1;
          if (!aInProgramDir && bInProgramDir) return 1;
        }
        
        return 0;
      } else {
        // Standard prioritization for non-exe-specific searches
        // First prioritize executable files if they seem relevant
        const aIsExe = executableExtensions.includes(a.extension.toLowerCase());
        const bIsExe = executableExtensions.includes(b.extension.toLowerCase());
        
        // If one is an executable and the other isn't, prioritize the executable
        if (aIsExe && !bIsExe) return -1;
        if (!aIsExe && bIsExe) return 1;
      }
      
      // Exact filename match (next priority)
      const aExact = a.filename.toLowerCase() === queryLower;
      const bExact = b.filename.toLowerCase() === queryLower;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      
      // Starts with the query (next priority)
      const aStarts = a.filename.toLowerCase().startsWith(queryLower);
      const bStarts = b.filename.toLowerCase().startsWith(queryLower);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      
      // Contains the query in filename (next priority)
      const aContains = a.filename.toLowerCase().includes(queryLower);
      const bContains = b.filename.toLowerCase().includes(queryLower);
      if (aContains && !bContains) return -1;
      if (!aContains && bContains) return 1;
      
      // Most recent files first (last priority)
      return b.lastModified - a.lastModified;
    });

    return results.slice(0, limit);
  }
}

// Create the indexer instance
const indexer = new HighPerformanceIndexer();

/**
 * Main search function
 */
function search(query, limit = 20, fuzzySearch = false) {
  console.log(`Searching for: "${query}" (limit: ${limit}, fuzzy: ${fuzzySearch})`);
  
  if (!query || query.trim() === '') {
    return {
      results: [],
      searchTime: 0,
      count: 0
    };
  }
  
  const startTime = performance.now();
  
  try {
    // Check if we have indexed files
    if (indexer.index.length === 0) {
      // No files indexed yet, load from cache or return empty results
      if (!indexer.loadIndexCache() || indexer.index.length === 0) {
        console.log('No files indexed yet');
        return {
          results: [],
          searchTime: 0,
          count: 0
        };
      }
    }
    
    // Special handling for executable searches
    const executableExtensions = ['exe', 'msi', 'com', 'bat', 'cmd', 'ps1', 'vbs', 'app', 'scr', 'reg', 'msc', 'appx', 'msix', 'lnk'];
    const normalizedQuery = query.trim().toLowerCase();
    
    // Enhanced check for program/app searches
    const isExeSearch = executableExtensions.some(ext => 
      normalizedQuery.includes(`.${ext}`) || 
      normalizedQuery.endsWith(ext) || 
      normalizedQuery === ext
    ) || 
    normalizedQuery.includes('app') ||
    normalizedQuery.includes('exe') ||
    normalizedQuery.includes('program') ||
    normalizedQuery.includes('launch') ||
    normalizedQuery.includes('start') ||
    normalizedQuery.includes('run') ||
    normalizedQuery.includes('application') ||
    normalizedQuery.includes('software') ||
    normalizedQuery.includes('tool') ||
    normalizedQuery.includes('utility');
    
    // Common program locations to look for if searching for programs
    const programDirs = [
      'program files',
      'program files (x86)',
      'programs',
      'applications',
      'games',
      'steam',
      'start menu',
      'appdata'
    ];
    
    // If this is likely an executable search and there's no explicit .exe suffix,
    // try to enhance the search by appending common executable extensions
    if (isExeSearch && !executableExtensions.some(ext => normalizedQuery.endsWith(ext))) {
      console.log('Enhancing search for executables');
      
      // Original search
      const originalResults = fuzzySearch 
        ? indexer.searchFuzzy(query, limit)
        : indexer.search(query, limit);
        
      // Get additional results by appending .exe to the query if needed
      let additionalResults = [];
      if (!normalizedQuery.includes('.exe')) {
        const exeQuery = `${query} .exe`;
        try {
          const exeResults = fuzzySearch
            ? indexer.searchFuzzy(exeQuery, Math.min(20, limit))
            : indexer.search(exeQuery, Math.min(20, limit));
            
          additionalResults = exeResults.filter(res => 
            res.extension.toLowerCase() === 'exe' &&
            !originalResults.some(orig => orig.path === res.path)
          );
          
          console.log(`Found ${additionalResults.length} additional .exe results`);
        } catch (err) {
          console.error('Error in additional .exe search:', err);
        }
      }
      
      // Try searching in common program directories
      let programDirResults = [];
      try {
        for (const programDir of programDirs) {
          if (programDirResults.length >= 10) break;
          
          const dirQuery = `${programDir} ${query}`;
          const dirResults = fuzzySearch
            ? indexer.searchFuzzy(dirQuery, 5)
            : indexer.search(dirQuery, 5);
            
          // Filter for executable files and deduplicate
          const newResults = dirResults.filter(res => 
            executableExtensions.includes(res.extension.toLowerCase()) &&
            !originalResults.some(orig => orig.path === res.path) &&
            !programDirResults.some(prev => prev.path === res.path)
          );
          
          programDirResults = [...programDirResults, ...newResults];
        }
        
        console.log(`Found ${programDirResults.length} results in program directories`);
      } catch (err) {
        console.error('Error in program directory search:', err);
      }
      
      // Combine all results
      let combinedResults = [
        ...originalResults,
        ...additionalResults,
        ...programDirResults
      ];
      
      // Special prioritization for exe files
      combinedResults.sort((a, b) => {
        const aIsExe = executableExtensions.includes((a.extension || '').toLowerCase());
        const bIsExe = executableExtensions.includes((b.extension || '').toLowerCase());
        
        // Give highest priority to .exe files specifically
        const aIsActualExe = (a.extension || '').toLowerCase() === 'exe';
        const bIsActualExe = (b.extension || '').toLowerCase() === 'exe';
        
        // First prioritize .exe files
        if (aIsActualExe && !bIsActualExe) return -1;
        if (!aIsActualExe && bIsActualExe) return 1;
        
        // Then prioritize other executable types
        if (aIsExe && !bIsExe) return -1;
        if (!aIsExe && bIsExe) return 1;
        
        // Check if in program directories
        const aInProgramDir = programDirs.some(dir => (a.path || '').toLowerCase().includes(dir));
        const bInProgramDir = programDirs.some(dir => (b.path || '').toLowerCase().includes(dir));
        
        if (aInProgramDir && !bInProgramDir) return -1;
        if (!aInProgramDir && bInProgramDir) return 1;
        
        return 0;
      });
      
      // Limit to requested number of results
      combinedResults = combinedResults.slice(0, limit);
      
      const searchTime = (performance.now() - startTime) / 1000;
      
      return {
        results: combinedResults,
        searchTime,
        count: combinedResults.length
      };
    }
    
    // Normal search
    const results = fuzzySearch 
      ? indexer.searchFuzzy(query, limit)
      : indexer.search(query, limit);
    
    const searchTime = (performance.now() - startTime) / 1000;
    
    return {
      results,
      searchTime,
      count: results.length
    };
  } catch (error) {
    console.error('Search error:', error);
    return {
      results: [],
      searchTime: 0,
      count: 0
    };
  }
}

/**
 * Initialize the search engine
 */
function init(dbPath, directories, syncInit = false) {
  console.log(`Initializing with dirs: ${directories.join(', ')}`);
  
  // Initialize the indexer
  if (!indexer.isInitialized()) {
    indexer.initialize();
  }
  
  // Try loading from cache first
  const cacheLoaded = indexer.loadIndexCache();
  
  // If cache was loaded and directories match, we can skip indexing
  const cacheDirsMatch = cacheLoaded && 
    JSON.stringify(drivesToIndex.sort()) === JSON.stringify(directories.sort());
  
  if (cacheLoaded && cacheDirsMatch) {
    console.log('Using cached index - no need to re-index');
    return true;
  }
  
  // Perform indexing
  if (syncInit) {
    // Synchronous indexing
    indexer.updateIndex(directories);
  } else {
    // Asynchronous indexing
    setTimeout(() => {
      indexer.updateIndex(directories, progress => {
        indexStats.progress = progress;
        return true; // Continue indexing
      });
    }, 0);
  }
  
  return true;
}

/**
 * Update the search index
 */
function updateIndex(directories) {
  console.log(`Updating index with dirs: ${directories.join(', ')}`);
  
  // Update asynchronously
  setTimeout(() => {
    indexer.updateIndex(directories, progress => {
      indexStats.progress = progress;
      return true; // Continue indexing
    });
  }, 0);
  
  return true;
}

/**
 * Get current indexing progress
 */
function getIndexingProgress() {
  return indexer.getIndexingProgress();
}

/**
 * Wait for indexing to complete
 */
function waitForIndexing(timeout = 0) {
  return indexStats.indexingComplete;
}

/**
 * Get statistics about the current index
 */
function getIndexStats() {
  return {
    ...indexStats,
    cacheEnabled: true,
    cacheFile: INDEX_CACHE_FILE
  };
}

/**
 * Clear search index and cache
 */
function clearIndex() {
  console.log('Clearing index and cache');
  
  // Clear in-memory index
  indexer.index = [];
  indexer.nameIndex = new Map();
  indexer.extIndex = new Map();
  indexer.pathIndex = new Map();
  indexer.queryCache = new Map();
  
  // Reset stats
  indexStats.totalFiles = 0;
  indexStats.totalDirectories = 0;
  indexStats.lastUpdated = Date.now();
  indexStats.indexingComplete = false;
  indexStats.progress = 0;
  
  // Delete cache file
  try {
    if (fs.existsSync(INDEX_CACHE_FILE)) {
      fs.unlinkSync(INDEX_CACHE_FILE);
      console.log('Cache file deleted');
    }
  } catch (err) {
    console.error('Failed to delete cache file:', err.message);
  }
  
  return true;
}

module.exports = {
  search,
  init,
  updateIndex,
  getIndexingProgress,
  waitForIndexing,
  getIndexStats,
  clearIndex
};
