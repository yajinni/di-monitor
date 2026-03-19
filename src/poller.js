const logger = require('./logger');

class Poller {
  constructor(onPRChange) {
    this.onPRChange = onPRChange;
    this.siteUrl = '';
    this.interval = 5;
    this.timer = null;
    this.lastPRData = null;
    this.lastKnownTimestamp = null;
    this.lastManualSync = null;
    this.mainWindow = null;
  }

  getNormalizedUrl() {
    if (!this.siteUrl) return '';
    let url = this.siteUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    return url.replace(/\/+$/, '');
  }

  setMainWindow(win) {
    this.mainWindow = win;
  }

  configure(siteUrl, intervalSeconds) {
    const changed = this.siteUrl !== siteUrl || this.interval !== intervalSeconds;
    this.siteUrl = siteUrl;
    this.interval = intervalSeconds;

    if (changed) {
      if (this.timer) {
        this.stop();
      }
      if (this.siteUrl) {
        this.start();
      }
    }
  }

  start() {
    console.log('[Poller] start() called, siteUrl:', this.siteUrl);
    if (!this.siteUrl) {
      logger.addEntry('error', 'Site URL not configured — polling disabled');
      this.notifyStatus('No site URL configured');
      console.log('[Poller] No site URL configured, aborting');
      return;
    }

    console.log('[Poller] Starting polling every', this.interval, 'seconds');
    logger.addEntry('connection', `Polling ${this.siteUrl} every ${this.interval}s`);
    this.notifyStatus('Polling...');
    this.poll();
    this.timer = setInterval(() => this.poll(), this.interval * 1000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async poll() {
    console.log('[Poller] poll() called');
    if (!this.siteUrl) {
      console.log('[Poller] No siteUrl, skipping poll');
      return;
    }

    try {
      const baseUrl = this.getNormalizedUrl();
      if (!baseUrl) return;

      // 1. Check if the database has updated by getting the latest timestamp
      const timestampUrl = `${baseUrl}/api/roster-last-updated`;
      const tsRes = await fetch(timestampUrl);
      
      if (!tsRes.ok) {
        logger.addEntry('error', `API returned ${tsRes.status}: ${tsRes.statusText}`);
        this.notifyStatus(`Error: ${tsRes.status}`);
        return;
      }
      
      const tsData = await tsRes.json();
      
      // If the timestamp hasn't changed, we can exit early!
      if (this.lastKnownTimestamp === tsData.last_updated && tsData.last_updated !== null) {
          // No changes yet, no need to download the full roster
          return;
      }
      
      const newTimestamp = tsData.last_updated;

      // 2. Actually fetch the roster since it has changed
      const url = `${baseUrl}/api/roster`;
      console.log('[Poller] Data changed, fetching full roster PRs:', url);

      const res = await fetch(url);
      console.log('[Poller] API response status:', res.status);

      if (!res.ok) {
        logger.addEntry('error', `API returned ${res.status}: ${res.statusText}`);
        this.notifyStatus(`Error: ${res.status}`);
        return;
      }

      const data = await res.json();

      if (!data.roster || !Array.isArray(data.roster)) {
        logger.addEntry('error', 'Invalid roster response from API');
        return;
      }
      
      // Successfully downloaded the new data, update our timestamp tracker
      this.lastKnownTimestamp = newTimestamp;

      // Extract manual sync timestamp if present
      const lastSync = data.last_pr_sync || null;

      // Calculate PR values
      const prData = {};
      for (const c of data.roster) {
        if (!c.name || !c.realm) continue;
        const ep = c.ep ?? 0;
        const gp = c.gp ?? 0;
        if (gp <= 0) continue;
        const pr = parseFloat((ep / gp).toFixed(2));
        const key = `${c.name}-${c.realm}`.toLowerCase();
        prData[key] = pr;
      }

      // Check if PR values changed OR if a manual sync was triggered
      const changes = this.detectChanges(prData);
      const isManualSync = lastSync && lastSync !== this.lastManualSync;
      
      if (changes.length > 0 || isManualSync) {
        const count = Object.keys(prData).length;
        console.log(`[DI Monitor] Data updated. Manual Sync: ${isManualSync}. Rows: ${count}`);
        
        if (changes.length > 0) {
          const msg = `PR values changed for ${changes.length} character${changes.length === 1 ? '' : 's'}`;
          logger.addEntry('received', msg, { changes });
        }

        this.lastPRData = prData;
        this.lastManualSync = lastSync;
        this.onPRChange(prData, lastSync);
      } else {
        // No changes detected
        console.log('[DI Monitor] No changes detected in PR values or manual sync');
      }

      this.notifyStatus('Connected');
    } catch (err) {
      let msg = err.message;
      if (msg === 'fetch failed') {
        msg = 'Connection failed. Check your URL and Internet.';
      }
      logger.addEntry('error', `Poll failed: ${msg}`);
      this.notifyStatus(`Error: ${msg}`);
    }
  }

  detectChanges(newData) {
    if (!this.lastPRData) {
      // First poll - return all characters as "new"
      return Object.entries(newData).map(([name, pr]) => ({
        name,
        oldPr: null,
        newPr: pr,
        isNew: true
      }));
    }

    const changes = [];
    const TOLERANCE = 0.001; // Allow for floating point precision

    // Check for changed or new characters
    for (const [name, newPr] of Object.entries(newData)) {
      const oldPr = this.lastPRData[name];
      if (oldPr === undefined) {
        changes.push({ name, oldPr: null, newPr, isNew: true });
      } else if (Math.abs(oldPr - newPr) > TOLERANCE) {
        changes.push({ name, oldPr, newPr, isNew: false });
      }
    }

    return changes;
  }

  hasChanged(newData) {
    if (!this.lastPRData) return true;

    const oldKeys = Object.keys(this.lastPRData).sort();
    const newKeys = Object.keys(newData).sort();

    if (oldKeys.length !== newKeys.length) return true;

    for (let i = 0; i < newKeys.length; i++) {
      if (oldKeys[i] !== newKeys[i]) return true;
      if (this.lastPRData[oldKeys[i]] !== newData[newKeys[i]]) return true;
    }

    return false;
  }

  notifyStatus(status) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('poll-status', status);
    }
  }
}

module.exports = Poller;
