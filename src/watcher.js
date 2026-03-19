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

    // Set new timeout to trigger the sync after 10 seconds of no further changes
    this.timeoutId = setTimeout(() => {
      this.triggerSync();
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
}

module.exports = Watcher;
