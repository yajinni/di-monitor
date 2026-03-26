const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class AttendanceHandler {
  constructor() {
    this.filePath = '';
    this.siteUrl = '';
    this.timeoutId = null;
    this.debounceMs = 5000; // 5 seconds is enough for SV writes
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
      console.log(`[AttendanceHandler] Invalid or missing file path: ${this.filePath}`);
      return;
    }

    if (!this.siteUrl) {
      console.log('[AttendanceHandler] No siteUrl configured, aborting');
      return;
    }

    console.log(`[AttendanceHandler] Started watching: ${this.filePath}`);
    logger.addEntry('system', `Started watching Attendance file`);

    this.isWatching = true;
    
    fs.watchFile(this.filePath, { interval: 1000 }, (curr, prev) => {
      if (curr.mtime > prev.mtime) {
        console.log(`[AttendanceHandler] File change detected: ${this.filePath}`);
        this.handleFileChange();
      }
    });
  }

  stop() {
    if (this.isWatching && this.filePath) {
      fs.unwatchFile(this.filePath);
      console.log(`[AttendanceHandler] Stopped watching: ${this.filePath}`);
      this.isWatching = false;
    }
    
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  handleFileChange() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    this.timeoutId = setTimeout(() => {
      this.processFile();
    }, this.debounceMs);
  }

  async processFile() {
    if (!this.filePath || !fs.existsSync(this.filePath)) {
      return { success: false, error: 'Attendance file not found or not configured.' };
    }

    try {
      const content = fs.readFileSync(this.filePath, 'utf8');
      const attendanceData = this.parseAttendance(content);

      if (attendanceData && attendanceData.length > 0) {
        logger.addEntry('system', `Found ${attendanceData.length} attendance records. Uploading...`);
        const result = await this.uploadAttendance(attendanceData);
        
        if (result.success) {
          this.clearAttendanceInFile(content);
          return { success: true, message: result.message };
        } else {
          return { success: false, error: result.error || 'Upload failed' };
        }
      } else {
        console.log('[AttendanceHandler] No attendance records found in file.');
        return { success: false, error: 'No attendance records found in file.' };
      }
    } catch (err) {
      console.error('[AttendanceHandler] Error processing file:', err);
      logger.addEntry('error', `Failed to process attendance file: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  parseAttendance(content) {
    // Look for DI_RCL_Attendance = { ... } and use negative lookahead to skip "},"
    const tableMatch = content.match(/DI_RCL_Attendance\s*=\s*\{([\s\S]*?)\n\}(?!\s*,)/);
    if (!tableMatch) return null;

    const tableContent = tableMatch[1];
    const entries = [];
    
    // Find each { ... } entry block
    const blockRegex = /\{([\s\S]*?)\}/g;
    let blockMatch;

    while ((blockMatch = blockRegex.exec(tableContent)) !== null) {
      const blockBody = blockMatch[1];
      const nameMatch = blockBody.match(/\["name"\]\s*=\s*"([^"]+)"/);
      const dateMatch = blockBody.match(/\["date"\]\s*=\s*"([^"]+)"/);

      if (nameMatch && dateMatch) {
        entries.push({
          name: nameMatch[1],
          date: dateMatch[1]
        });
      }
    }

    return entries;
  }

  async uploadAttendance(data) {
    const baseUrl = this.getNormalizedUrl();
    if (!baseUrl) return { success: false, error: 'Site URL not configured.' };

    const url = `${baseUrl}/api/attendance`;
    console.log(`[AttendanceHandler] Uploading to: ${url}`);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!res.ok) {
        const errText = await res.text();
        logger.addEntry('error', `Attendance upload failed (${res.status}): ${errText}`);
        return { success: false, error: `Upload failed (${res.status}): ${errText}` };
      }

      const result = await res.json();
      const message = result.message || 'Data sent successfully';
      logger.addEntry('success', `Attendance sync successful: ${message}`);
      return { success: true, message: message };
    } catch (err) {
      logger.addEntry('error', `Network error syncing attendance: ${err.message}`);
      return { success: false, error: `Network error: ${err.message}` };
    }
  }

  clearAttendanceInFile(originalContent) {
    try {
      // Replace the table with an empty one
      const newContent = originalContent.replace(
        /DI_RCL_Attendance\s*=\s*\{[\s\S]*?\n\}(?!\s*,)/,
        'DI_RCL_Attendance = {}'
      );
      
      fs.writeFileSync(this.filePath, newContent, 'utf8');
      console.log('[AttendanceHandler] Cleared local attendance table.');
    } catch (err) {
      console.error('[AttendanceHandler] Failed to clear attendance in file:', err);
    }
  }
}

module.exports = AttendanceHandler;
