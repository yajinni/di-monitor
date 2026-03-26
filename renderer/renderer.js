const logBody = document.getElementById('logBody');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const siteUrlInput = document.getElementById('siteUrl');
const pollIntervalInput = document.getElementById('pollInterval');
const wowPathInput = document.getElementById('wowPath');
const browseWowBtn = document.getElementById('browseWowBtn');
const wowPathError = document.getElementById('wowPathError');
const addonStatus = document.getElementById('addonStatus');
const rclPathInput = document.getElementById('rclPath');
const browseRclBtn = document.getElementById('browseRclBtn');
const rclPathError = document.getElementById('rclPathError');
const attendancePathInput = document.getElementById('attendancePath');
const browseAttendanceBtn = document.getElementById('browseAttendanceBtn');
const attendancePathError = document.getElementById('attendancePathError');
const openLogsBtn = document.getElementById('openLogsBtn');
const runOnStartupCheckbox = document.getElementById('runOnStartup');
const wowAccountSelect = document.getElementById('wowAccount');
const accountGroup = document.getElementById('accountGroup');
const saveBtn = document.getElementById('saveBtn');
const saveMessage = document.getElementById('saveMessage');

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

// Log entry rendering
function addLogEntry(entry) {
  const tr = document.createElement('tr');
  tr.className = `log-${entry.type}`;

  const msgCell = document.createElement('td');
  msgCell.className = 'log-msg';
  msgCell.textContent = entry.message;

  // If entry has change metadata, make it clickable
  if (entry.metadata && entry.metadata.changes) {
    tr.style.cursor = 'pointer';
    tr.style.opacity = '0.8';
    tr.addEventListener('mouseover', () => tr.style.opacity = '1');
    tr.addEventListener('mouseout', () => tr.style.opacity = '0.8');
    tr.addEventListener('click', () => showChangesDialog(entry.metadata.changes));
    msgCell.style.textDecoration = 'underline dotted';
  } else if (entry.metadata && entry.metadata.items) {
    tr.style.cursor = 'pointer';
    tr.style.opacity = '0.8';
    tr.addEventListener('mouseover', () => tr.style.opacity = '1');
    tr.addEventListener('mouseout', () => tr.style.opacity = '0.8');
    tr.addEventListener('click', () => showLootDialog(entry.metadata.items));
    msgCell.style.textDecoration = 'underline dotted';
  } else if (entry.metadata && entry.metadata.unmatched) {
    tr.style.cursor = 'pointer';
    tr.style.opacity = '0.8';
    tr.addEventListener('mouseover', () => tr.style.opacity = '1');
    tr.addEventListener('mouseout', () => tr.style.opacity = '0.8');
    tr.addEventListener('click', () => showUnmatchedPlayersDialog(entry.metadata.unmatched));
    msgCell.style.textDecoration = 'underline dotted';
  }

  tr.innerHTML = `
    <td class="log-time">${entry.timestamp}</td>
    <td class="log-type">${entry.type}</td>
  `;
  tr.appendChild(msgCell);
  logBody.appendChild(tr);

  const container = document.querySelector('.log-container');
  container.scrollTop = container.scrollHeight;
}

// Show dialog with character changes
function showChangesDialog(changes) {
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    background: #16213e;
    border: 2px solid #e94560;
    border-radius: 8px;
    padding: 20px;
    max-width: 600px;
    max-height: 500px;
    overflow-y: auto;
    color: #e0e0e0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
  `;

  let html = '<h3 style="color: #e94560; margin-top: 0;">Character PR Changes</h3>';
  html += '<table style="width: 100%; border-collapse: collapse;">';
  html += '<thead><tr style="border-bottom: 1px solid #0f3460;"><th style="text-align: left; padding: 8px;">Character</th><th style="text-align: right; padding: 8px;">Old PR</th><th style="text-align: right; padding: 8px;">New PR</th><th style="text-align: center; padding: 8px;">Change</th></tr></thead>';
  html += '<tbody>';

  for (const change of changes) {
    const oldPr = change.oldPr !== null ? change.oldPr.toFixed(2) : 'NEW';
    const newPr = change.newPr.toFixed(2);
    const diff = change.oldPr !== null ? (change.newPr - change.oldPr).toFixed(2) : 'NEW';
    const diffColor = diff === 'NEW' ? '#4caf50' : (diff > 0 ? '#4caf50' : (diff < 0 ? '#ef5350' : '#64b5f6'));

    html += `<tr style="border-bottom: 1px solid #0f3460;">
      <td style="padding: 8px;">${change.name}</td>
      <td style="text-align: right; padding: 8px; color: #888;">${oldPr}</td>
      <td style="text-align: right; padding: 8px; color: #fff;">${newPr}</td>
      <td style="text-align: center; padding: 8px; color: ${diffColor}; font-weight: bold;">${diff}</td>
    </tr>`;
  }

  html += '</tbody></table>';
  content.innerHTML = html;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = `
    margin-top: 16px;
    padding: 8px 16px;
    background: #e94560;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    width: 100%;
  `;
  closeBtn.addEventListener('click', () => dialog.remove());
  content.appendChild(closeBtn);

  dialog.appendChild(content);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.remove();
  });

  document.body.appendChild(dialog);
}

function showLootDialog(items) {
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    background: #16213e;
    border: 2px solid #48abe0;
    border-radius: 8px;
    padding: 20px;
    width: 600px;
    max-height: 500px;
    overflow-y: auto;
    color: #e0e0e0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
  `;

  let html = '<h3 style="color: #48abe0; margin-top: 0;">New Loot Recorded</h3>';
  
  if (!items || items.length === 0) {
    html += '<p style="color: #888;">No new items were added (they might have already been synced).</p>';
  } else {
    html += '<table style="width: 100%; border-collapse: collapse;">';
    html += '<thead><tr style="border-bottom: 1px solid #0f3460;"><th style="text-align: left; padding: 8px;">Character</th><th style="text-align: left; padding: 8px;">Item</th><th style="text-align: right; padding: 8px;">GP</th></tr></thead>';
    html += '<tbody>';

    for (const item of items) {
      html += `<tr style="border-bottom: 1px solid #0f3460;">
        <td style="padding: 8px;">${item.char}</td>
        <td style="padding: 8px; color: #fff;">${item.name}</td>
        <td style="text-align: right; padding: 8px; color: #4caf50;">${item.gp > 0 ? '+' + item.gp : '-'}</td>
      </tr>`;
    }

    html += '</tbody></table>';
  }
  
  content.innerHTML = html;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = `
    margin-top: 16px;
    padding: 8px 16px;
    background: #48abe0;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    width: 100%;
  `;
  closeBtn.addEventListener('click', () => dialog.remove());
  content.appendChild(closeBtn);

  dialog.appendChild(content);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.remove();
  });

  document.body.appendChild(dialog);
}

function showUnmatchedPlayersDialog(players) {
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    background: #16213e;
    border: 2px solid #f9a825;
    border-radius: 8px;
    padding: 20px;
    width: 500px;
    max-height: 400px;
    overflow-y: auto;
    color: #e0e0e0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
  `;

  let html = '<h3 style="color: #f9a825; margin-top: 0;">Characters Not on Roster</h3>';
  html += '<p style="font-size: 14px; color: #bbb; line-height: 1.4;">The following character names (as seen in your addon) were not found in your website\'s roster. These loot records were saved, but they aren\'t linked to a specific character profile.</p>';
  html += '<ul style="margin-top: 15px; padding-left: 20px; color: #fff; line-height: 1.6;">';
  
  // Sort and list names
  const sortedPlayers = [...players].sort();
  for (const player of sortedPlayers) {
    html += `<li>${player}</li>`;
  }
  
  html += '</ul>';
  content.innerHTML = html;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = `
    margin-top: 20px;
    padding: 10px;
    background: #f9a825;
    color: #1a1a2e;
    font-weight: bold;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    width: 100%;
  `;
  closeBtn.addEventListener('click', () => dialog.remove());
  content.appendChild(closeBtn);

  dialog.appendChild(content);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.remove();
  });

  document.body.appendChild(dialog);
}

async function loadLogs() {
  const logs = await window.diMonitor.getLogs();
  for (const entry of logs) {
    addLogEntry(entry);
  }
}

async function validateAddon(wowPath) {
  if (!wowPath) {
    addonStatus.textContent = '';
    addonStatus.className = 'addon-status';
    return;
  }

  const result = await window.diMonitor.validateAddon(wowPath);

  if (result.found) {
    addonStatus.textContent = `${'\u2705'} Addon found.`;
    addonStatus.className = 'addon-status addon-found';
  } else {
    addonStatus.textContent = `Addon not found. Make sure ${wowPath} is correct and the DI_To_RCL_Import addon is installed.`;
    addonStatus.className = 'addon-status addon-missing';
  }
}

// Load settings
async function loadSettings() {
  const s = await window.diMonitor.getSettings();
  siteUrlInput.value = s.siteUrl || '';
  pollIntervalInput.value = s.pollInterval || 5;
  wowPathInput.value = s.wowPath || '';
  rclPathInput.value = s.rclootcouncilPath || '';
  attendancePathInput.value = s.attendancePath || '';
  runOnStartupCheckbox.checked = s.runOnStartup;

  if (s.wowPath) {
    await validateAddon(s.wowPath);
    await refreshAccounts(s.wowPath, s.wowAccount);
  }

  const version = await window.diMonitor.getAppVersion();
  document.getElementById('appVersion').textContent = `v${version}`;
}

async function refreshAccounts(wowPath, selectedAccount) {
  if (!wowPath) {
    accountGroup.style.display = 'none';
    return;
  }

  const accounts = await window.diMonitor.getWowAccounts(wowPath);
  if (accounts && accounts.length > 0) {
    wowAccountSelect.innerHTML = '<option value="">-- Select Account --</option>';
    accounts.forEach(acc => {
      const opt = document.createElement('option');
      opt.value = acc;
      opt.textContent = acc;
      if (acc === selectedAccount) opt.selected = true;
      wowAccountSelect.appendChild(opt);
    });
    accountGroup.style.display = 'block';
  } else {
    accountGroup.style.display = 'none';
  }
}

// Browse for WoW folder
browseWowBtn.addEventListener('click', async () => {
  const result = await window.diMonitor.selectWowFolder();
  if (!result) return;

  if (result.valid) {
    wowPathInput.value = result.path;
    wowPathError.textContent = '';
    wowPathError.className = 'field-error';
    await validateAddon(result.path);
    await refreshAccounts(result.path);
  } else {
    wowPathInput.value = result.path;
    wowPathError.textContent = result.error;
    wowPathError.className = 'field-error visible';
    addonStatus.textContent = '';
  }
});

// WoW Account changed
wowAccountSelect.addEventListener('change', async () => {
  const accountName = wowAccountSelect.value;
  const wowPath = wowPathInput.value;
  if (!accountName || !wowPath) return;

  const files = await window.diMonitor.getAccountFiles({ wowPath, accountName });
  if (files) {
    rclPathInput.value = files.rclPath;
    attendancePathInput.value = files.attendancePath;
  }
});

// Browse for RCLootCouncil file
browseRclBtn.addEventListener('click', async () => {
  const result = await window.diMonitor.selectRclFile();
  if (!result) return;

  if (result.valid) {
    rclPathInput.value = result.path;
    rclPathError.textContent = '';
    rclPathError.className = 'field-error';
  } else {
    rclPathInput.value = result.path;
    rclPathError.textContent = result.error;
    rclPathError.className = 'field-error visible';
  }
});

// Browse for Attendance file
browseAttendanceBtn.addEventListener('click', async () => {
  const result = await window.diMonitor.selectAttendanceFile();
  if (!result) return;

  if (result.valid) {
    attendancePathInput.value = result.path;
    attendancePathError.textContent = '';
    attendancePathError.className = 'field-error';
  } else {
    attendancePathInput.value = result.path;
    attendancePathError.textContent = result.error;
    attendancePathError.className = 'field-error visible';
  }
});

// Open logs folder
openLogsBtn.addEventListener('click', () => {
  window.diMonitor.openLogsFolder();
});

// Save settings
saveBtn.addEventListener('click', async () => {
  await window.diMonitor.saveSettings({
    wowPath: wowPathInput.value,
    wowAccount: wowAccountSelect.value,
    runOnStartup: runOnStartupCheckbox.checked,
    siteUrl: siteUrlInput.value,
    rclootcouncilPath: rclPathInput.value,
    attendancePath: attendancePathInput.value,
    pollInterval: parseInt(pollIntervalInput.value, 10) || 5
  });

  saveMessage.textContent = 'Settings saved!';
  saveMessage.classList.add('visible');
  setTimeout(() => saveMessage.classList.remove('visible'), 2000);
});

// Live updates from main process
window.diMonitor.onLogUpdate((entry) => {
  addLogEntry(entry);
});

window.diMonitor.onPollStatus((status) => {
  const isConnected = status === 'Connected' || status === 'Polling...';
  statusDot.className = `status-dot ${isConnected ? 'connected' : ''}`;
  statusText.textContent = status;
});

// Initialize
loadLogs();
loadSettings();

// Manual Sync Button
const sendLootBtn = document.getElementById('sendLootBtn');
if (sendLootBtn) {
  sendLootBtn.addEventListener('click', async () => {
    sendLootBtn.disabled = true;
    sendLootBtn.textContent = 'Sending...';
    try {
      const result = await window.diMonitor.sendLootData();
      if (result.success) {
        addLogEntry({
          timestamp: new Date().toLocaleString(),
          type: 'success',
          message: `Loot manual sync: ${result.message}`,
          metadata: { items: result.items }
        });
      } else {
        addLogEntry({
          timestamp: new Date().toLocaleString(),
          type: 'error',
          message: `Loot manual sync failed: ${result.error}`
        });
      }
    } catch (e) {
      addLogEntry({
        timestamp: new Date().toLocaleTimeString(),
        type: 'error',
        message: `Loot manual sync error: ${e.message}`
      });
    } finally {
      sendLootBtn.disabled = false;
      sendLootBtn.textContent = 'Send Loot Data';
    }
  });
}

// Manual On Time Sync Button
const sendAttendanceBtn = document.getElementById('sendAttendanceBtn');
if (sendAttendanceBtn) {
  sendAttendanceBtn.addEventListener('click', async () => {
    sendAttendanceBtn.disabled = true;
    sendAttendanceBtn.textContent = 'Sending...';
    try {
      const result = await window.diMonitor.sendAttendanceData();
      if (result.success) {
        addLogEntry({
          timestamp: new Date().toLocaleString(),
          type: 'success',
          message: `On Time sync: ${result.message}`
        });
      } else {
        addLogEntry({
          timestamp: new Date().toLocaleString(),
          type: 'error',
          message: `On Time sync failed: ${result.error}`
        });
      }
    } catch (e) {
      addLogEntry({
        timestamp: new Date().toLocaleTimeString(),
        type: 'error',
        message: `On Time sync error: ${e.message}`
      });
    } finally {
      sendAttendanceBtn.disabled = false;
      sendAttendanceBtn.textContent = 'Send On Time Data';
    }
  });
}
