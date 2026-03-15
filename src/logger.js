const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const MAX_ENTRIES = 500;
const LOG_FILE_NAME = 'app-logs.json';

class Logger {
  constructor() {
    this.entries = [];
    this.mainWindow = null;
    this.logPath = null;
  }

  init() {
    try {
      this.logPath = path.join(app.getPath('userData'), LOG_FILE_NAME);
      this.loadLogs();
    } catch (err) {
      console.error('Logger initialization failed:', err);
    }
  }

  setMainWindow(win) {
    this.mainWindow = win;
  }

  loadLogs() {
    if (this.logPath && fs.existsSync(this.logPath)) {
      try {
        const data = fs.readFileSync(this.logPath, 'utf8');
        this.entries = JSON.parse(data);
      } catch (err) {
        console.error('Failed to load logs from disk:', err);
        this.entries = [];
      }
    }
  }

  saveLogs() {
    if (this.logPath) {
      try {
        fs.writeFileSync(this.logPath, JSON.stringify(this.entries, null, 2));
      } catch (err) {
        console.error('Failed to save logs to disk:', err);
      }
    }
  }

  addEntry(type, message, metadata = null) {
    const entry = {
      timestamp: new Date().toLocaleString(),
      type,
      message,
      metadata
    };

    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.shift();
    }

    this.saveLogs();

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('log-update', entry);
    }

    return entry;
  }

  getEntries() {
    return this.entries;
  }
}

module.exports = new Logger();
