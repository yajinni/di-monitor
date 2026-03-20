const fs = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('./logger');

class Watcher {
  constructor() {
    this.luaPath = '';
    this.jsonPath = '';
    this.siteUrl = '';
    this.luaTimeoutId = null;
    this.jsonTimeoutId = null;
    this.debounceMs = 10000; // 10 seconds
    this.isWatching = false;
  }

  getNormalizedUrl() {
    if (!this.siteUrl) return '';
    let url = this.siteUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    return url.replace(/\/+$/, '');
  }

  configure(luaPath, jsonPath, siteUrl) {
    const changed = this.luaPath !== luaPath || this.jsonPath !== jsonPath || this.siteUrl !== siteUrl;
    this.luaPath = luaPath;
    this.jsonPath = jsonPath;
    this.siteUrl = siteUrl;

    if (changed) {
      if (this.isWatching) {
        this.stop();
      }
      if (this.luaPath && this.siteUrl) {
        this.start();
      }
    }
  }

  start() {
    if (!this.luaPath || !fs.existsSync(this.luaPath)) {
      console.log(`[Watcher] Invalid or missing Lua file path: ${this.luaPath}`);
      return;
    }

    if (!this.siteUrl) {
      console.log('[Watcher] No siteUrl configured, aborting');
      return;
    }

    console.log(`[Watcher] Started watching Lua: ${this.luaPath}`);
    logger.addEntry('system', `Started watching RCLootCouncil file`);

    this.isWatching = true;
    
    // 1. Watch the Lua file for extraction
    fs.watchFile(this.luaPath, { interval: 1000 }, (curr, prev) => {
      if (curr.mtime > prev.mtime) {
        console.log(`[Watcher] Lua file change detected: ${this.luaPath}`);
        this.handleLuaChange();
      }
    });

    // 2. Watch the JSON file for uploading (if it exists)
    this.refreshJsonWatcher();
  }

  refreshJsonWatcher() {
    if (!this.jsonPath) return;

    if (fs.existsSync(this.jsonPath)) {
      console.log(`[Watcher] Started watching JSON: ${this.jsonPath}`);
      fs.watchFile(this.jsonPath, { interval: 1000 }, (curr, prev) => {
        if (curr.mtime > prev.mtime) {
          console.log(`[Watcher] JSON file change detected: ${this.jsonPath}`);
          this.handleJsonChange();
        }
      });
    } else {
      console.log(`[Watcher] JSON file not found yet: ${this.jsonPath}`);
      logger.addEntry('system', 'No loot file made yet');
    }
  }

  stop() {
    if (this.isWatching) {
      if (this.luaPath) fs.unwatchFile(this.luaPath);
      if (this.jsonPath) fs.unwatchFile(this.jsonPath);
      console.log(`[Watcher] Stopped watching files`);
      this.isWatching = false;
    }
    
    if (this.luaTimeoutId) {
      clearTimeout(this.luaTimeoutId);
      this.luaTimeoutId = null;
    }
    if (this.jsonTimeoutId) {
      clearTimeout(this.jsonTimeoutId);
      this.jsonTimeoutId = null;
    }
  }

  handleLuaChange() {
    if (this.luaTimeoutId) {
      clearTimeout(this.luaTimeoutId);
    }

    logger.addEntry('system', `Detected RCLootCouncil.lua change, waiting ${this.debounceMs / 1000}s...`);

    this.luaTimeoutId = setTimeout(async () => {
      await this.exportLootDBToJSON();
    }, this.debounceMs);
  }

  handleJsonChange() {
    if (this.jsonTimeoutId) {
      clearTimeout(this.jsonTimeoutId);
    }

    logger.addEntry('system', `Detected extracted_loot.json change, triggering upload in 2s...`);

    // Shorter debounce for JSON since it's the final product
    this.jsonTimeoutId = setTimeout(async () => {
      try {
        if (!fs.existsSync(this.jsonPath)) return;
        const content = fs.readFileSync(this.jsonPath, 'utf8');
        const jsonData = JSON.parse(content);
        await this.triggerLootUpload(jsonData);
      } catch (err) {
        console.error('[Watcher] Failed to upload JSON:', err);
        logger.addEntry('error', `JSON upload failed: ${err.message}`);
      }
    }, 2000);
  }

  async triggerSync() {
    const baseUrl = this.getNormalizedUrl();
    if (!baseUrl) return;

    logger.addEntry('connection', 'Triggering WoW Audit loot sync from RCLootCouncil update');
    const url = `${baseUrl}/api/sync-loot-from-wowaudit`;
    
    console.log(`[Watcher] Triggering sync at: ${url}`);

    try {
      // The API doesn't require an explicit API key in the request because the Cloudflare Worker 
      // fetches it from its own SQLite DB (env.DB) using 'wowaudit_api_key'
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log(`[Watcher] API response status: ${res.status}`);

      if (!res.ok) {
        const text = await res.text();
        console.log(`[Watcher] API Error Text: ${text}`);
        logger.addEntry('error', `Loot sync failed (${res.status}): ${res.statusText}`);
        return;
      }

      const data = await res.json();
      console.log('[Watcher] Sync success:', data);
      
      if (data.success) {
        logger.addEntry('success', `Loot sync successful: ${data.inserted} items inserted`);
      } else {
        logger.addEntry('error', `Loot sync returned false success: ${JSON.stringify(data)}`);
      }
    } catch (err) {
      console.error('[Watcher] Network error during sync:', err);
      logger.addEntry('error', `Network error triggering sync: ${err.message}`);
    }
  }

  async exportLootDBToJSON() {
    if (!this.luaPath || !fs.existsSync(this.luaPath)) return;

    logger.addEntry('system', 'Extracting loot data from RCLootCouncil.lua...');

    try {
      const content = fs.readFileSync(this.luaPath, 'utf8');
      const lootDBMatch = content.match(/RCLootCouncilLootDB\s*=\s*\{/) || content.match(/\["lootDB"\]\s*=\s*\{/);
      
      if (!lootDBMatch) {
        logger.addEntry('error', 'No lootDB table found in RCLootCouncil.lua');
        return;
      }

      const startIndex = lootDBMatch.index + lootDBMatch[0].length - 1;
      const lootDataRaw = this.extractBalancedBraces(content, startIndex);
      if (!lootDataRaw) {
        logger.addEntry('error', 'Failed to extract balanced table content');
        return;
      }

      const jsonData = this.luaToJson(lootDataRaw);
      if (!jsonData) {
        logger.addEntry('error', 'JSON conversion failed');
        return;
      }

      if (!this.jsonPath) {
        logger.addEntry('error', 'Output JSON path not configured');
        return;
      }

      // Ensure directory exists
      const outputDir = path.dirname(this.jsonPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      fs.writeFileSync(this.jsonPath, JSON.stringify(jsonData, null, 2), 'utf8');
      logger.addEntry('success', `Loot extracted to ${path.basename(this.jsonPath)}`);
      
      // If we just created the file for the first time, start watching it
      if (this.isWatching) {
        fs.unwatchFile(this.jsonPath); // Clear old watch if any
        this.refreshJsonWatcher();
      }

      return { success: true, items: jsonData }; // For manual button trigger
    } catch (err) {
      console.error('[Watcher] Error exporting lootDB:', err);
      logger.addEntry('error', `Failed to export LootDB: ${err.message}`);
    }
  }

  async triggerLootUpload(jsonData) {
    const baseUrl = this.getNormalizedUrl();
    if (!baseUrl) {
      logger.addEntry('system', 'Skipping loot upload: No site URL configured.');
      return { success: false, error: 'No site URL configured' };
    }

    const url = `${baseUrl}/api/sync-loot-json`;
    logger.addEntry('system', 'Uploading loot to website...');

    try {
      const response = await axios.post(url, jsonData, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      });

      if (response.data && response.data.success) {
        logger.addEntry('success', `Loot uploaded successfully: ${response.data.message}`, { items: response.data.insertedItems });
        return { success: true, message: response.data.message, items: response.data.insertedItems };
      } else {
        logger.addEntry('error', `Loot upload failed: ${response.data.error || 'Unknown error'}`);
        return { success: false, error: response.data.error || 'Unknown error' };
      }
    } catch (err) {
      console.error('[Watcher] Upload error:', err);
      const errorMsg = err.response?.data?.error || err.message;
      logger.addEntry('error', `Loot upload failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  extractBalancedBraces(text, startIndex) {
    let braceCount = 0;
    let endIndex = -1;

    for (let i = startIndex; i < text.length; i++) {
        if (text[i] === '{') braceCount++;
        else if (text[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
                endIndex = i;
                break;
            }
        }
    }

    if (endIndex !== -1) {
        return text.substring(startIndex, endIndex + 1);
    }
    return null;
  }

  luaToJson(luaStr) {
    // Basic conversion logic for RCLC lootDB structure
    // 1. Remove Lua comments
    let json = luaStr.replace(/--.*$/gm, '');
    
    // 2. Convert ["key"] = to "key":
    json = json.replace(/\["([^"]+)"\]\s*=\s*/g, '"$1": ');
    
    // 3. Convert integer keys [1] = to nothing (it's an array)
    // Actually, RCLC uses { [1] = { ... }, [2] = { ... } }
    json = json.replace(/\[\d+\]\s*=\s*/g, '');

    // 4. Handle Lua table start/end { } -> [ ] or { }
    // RCLC lootDB is usually an array of items, but could be a map if keys are missing.
    // Given our regex replacements above, it should look like JSON now.
    
    // 5. Final cleanups for trailing commas and Lua specific values
    json = json.replace(/,(\s*[}\]])/g, '$1'); // Trailing commas
    json = json.replace(/true/g, 'true').replace(/false/g, 'false');
    
    // If the first table has no "keys", treat as array
    if (json.trim().startsWith('{') && !json.includes('":')) {
      json = '[' + json.substring(1, json.length - 1) + ']';
    }

    try {
      // Use a more robust check: replace { with [ if it looks like an array
      // But for RCLC, many tables use mixed modes. 
      // A safer bet for a quick extraction:
      return this.recursivelyConvertLua(json);
    } catch (e) {
      console.error('Lua to JSON conversion failed:', e);
      return null;
    }
  }

  recursivelyConvertLua(str) {
    // This is a "best effort" cleanup since we can't run a full Lua VM
    // We'll clean up the most common RCLC patterns
    let s = str.trim();
    
    // Remove Lua table equals
    s = s.replace(/=/g, ':');
    
    // Add quotes to unquoted keys if any remain
    s = s.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    
    // Handle remaining [1] style keys
    s = s.replace(/\[(\d+)\]\s*:/g, '');

    // Replace {} with [] if no colons remain
    if (!s.includes(':')) {
        s = s.replace(/\{/g, '[').replace(/\}/g, ']');
    }

    try {
        // Attempt parsing
        // We'll use a very simplified approach: 
        // We want to turn the Lua table string into valid JSON
        // The most important thing is replacing { with [ when they contain no keys
        
        // This regex finds tables that don't have key-value pairs
        // s = s.replace(/\{\s*([^:]+)\s*\}/g, '[$1]'); // Doesn't handle nesting well
        
        // For RCLC, the lootDB is usually an array of objects.
        // So { { ... }, { ... } } should be [ { ... }, { ... } ]
        
        return JSON.parse(this.fixLuaBraces(s));
    } catch (e) {
        throw new Error("Invalid structure after conversion attempt.");
    }
  }

  fixLuaBraces(s) {
    // Simple heuristic: if a { is immediately followed by another { or a value WITHOUT a key, it's an array
    // We'll do a character-by-character pass to be safe with nesting
    let result = "";
    let stack = [];
    
    for (let i = 0; i < s.length; i++) {
        let char = s[i];
        if (char === '{') {
            // Peek ahead to see if there's a colon before the next comma or closing brace
            let isArray = true;
            let bracketDepth = 0;
            for (let j = i + 1; j < s.length; j++) {
                if (s[j] === '{') bracketDepth++;
                if (s[j] === '}') {
                    if (bracketDepth === 0) break;
                    bracketDepth--;
                }
                if (s[j] === ':' && bracketDepth === 0) {
                    isArray = false;
                    break;
                }
                if (s[j] === ',' && bracketDepth === 0) {
                    // Stay true to current isArray finding
                }
            }
            stack.push(isArray ? '[' : '{');
            result += stack[stack.length - 1];
        } else if (char === '}') {
            result += stack.pop() === '[' ? ']' : '}';
        } else {
            result += char;
        }
    }
    return result;
  }
}

module.exports = Watcher;
