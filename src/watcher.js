const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class Watcher {
  constructor() {
    this.filePath = '';
    this.siteUrl = '';
    this.timeoutId = null;
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

  configure(filePath, siteUrl) {
    const changed = this.filePath !== filePath || this.siteUrl !== siteUrl;
    this.filePath = filePath;
    this.siteUrl = siteUrl;

    if (changed) {
      if (this.isWatching) {
        this.stop();
      }
      if (this.filePath && this.siteUrl) {
        this.start();
      }
    }
  }

  start() {
    if (!this.filePath || !fs.existsSync(this.filePath)) {
      console.log(`[Watcher] Invalid or missing file path: ${this.filePath}`);
      return;
    }

    if (!this.siteUrl) {
      console.log('[Watcher] No siteUrl configured, aborting');
      return;
    }

    console.log(`[Watcher] Started watching: ${this.filePath}`);
    logger.addEntry('system', `Started watching RCLootCouncil file`);

    this.isWatching = true;
    
    // Using fs.watchFile which is generally more reliable for continuous tracking of a single file
    fs.watchFile(this.filePath, { interval: 1000 }, (curr, prev) => {
      // Only trigger if the file was modified
      if (curr.mtime > prev.mtime) {
        console.log(`[Watcher] File change detected: ${this.filePath}`);
        this.handleFileChange();
      }
    });
  }

  stop() {
    if (this.isWatching && this.filePath) {
      fs.unwatchFile(this.filePath);
      console.log(`[Watcher] Stopped watching: ${this.filePath}`);
      this.isWatching = false;
    }
    
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  handleFileChange() {
    // Clear any existing timeout (debounce)
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    logger.addEntry('system', `Detected RCLootCouncil file change, waiting ${this.debounceMs / 1000}s...`);

    // Set new timeout to trigger the sync/export after 10 seconds of no further changes
    this.timeoutId = setTimeout(async () => {
      await this.triggerSync();
      await this.exportLootDBToJSON();
    }, this.debounceMs);
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
    if (!this.filePath || !fs.existsSync(this.filePath)) return;

    try {
      const content = fs.readFileSync(this.filePath, 'utf8');
      
      // Look for the lootDB table. It's usually nested inside profiles.
      // We look for ["lootDB"] = { and match the balanced braces.
      const lootDBMatch = content.match(/\["lootDB"\]\s*=\s*\{/);
      if (!lootDBMatch) {
        console.log('[Watcher] No lootDB found in RCLootCouncil.lua');
        return;
      }

      const startIndex = lootDBMatch.index + lootDBMatch[0].length - 1;
      const lootDataRaw = this.extractBalancedBraces(content, startIndex);
      
      if (!lootDataRaw) {
        console.log('[Watcher] Failed to extract lootDB content');
        return;
      }

      // Convert Lua table string to JSON
      const jsonData = this.luaToJson(lootDataRaw);
      
      const outputDir = path.dirname(this.filePath);
      const outputPath = path.join(outputDir, 'RCLootCouncil.json');
      
      fs.writeFileSync(outputPath, JSON.stringify(jsonData, null, 2), 'utf8');
      logger.addEntry('success', `Exported lootDB to ${path.basename(outputPath)}`);
      console.log(`[Watcher] Exported lootDB to: ${outputPath}`);

    } catch (err) {
      console.error('[Watcher] Error exporting lootDB:', err);
      logger.addEntry('error', `Failed to export LootDB: ${err.message}`);
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

module.exports = Watcher;
