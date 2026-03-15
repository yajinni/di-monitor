const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, Notification, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const settings = require('./src/settings');
const Poller = require('./src/poller');
const Watcher = require('./src/watcher');
const { writeSavedVariables } = require('./src/lua-writer');
const { isWowRunning } = require('./src/wow-detector');

const ADDON_NAME = 'DI_To_RCL_Import';
const PR_VALUES_FILE = 'PRValues.lua';

let mainWindow = null;
let tray = null;
let poller = null;
let watcher = null;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

function getAddonFilePath() {
  const wowPath = settings.get('wowPath');
  if (!wowPath) return null;
  return path.join(wowPath, '_retail_', 'Interface', 'AddOns', ADDON_NAME, PR_VALUES_FILE);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 450,
    show: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.setMenuBarVisibility(false);

  // Open DevTools in development
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  logger.setMainWindow(mainWindow);
  if (poller) {
    poller.setMainWindow(mainWindow);
  }
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  tray = new Tray(iconPath);
  tray.setToolTip('DI Monitor');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

async function handlePRUpdate(prData) {
  console.log('[DI Monitor] handlePRUpdate called with', Object.keys(prData).length, 'characters');

  const filePath = getAddonFilePath();

  if (!filePath) {
    logger.addEntry('error', 'WoW path not configured — skipping update');
    console.log('[DI Monitor] No file path configured');
    return;
  }

  console.log('[DI Monitor] Target file path:', filePath);

  // Ensure the addon folder exists
  const addonDir = path.dirname(filePath);
  if (!fs.existsSync(addonDir)) {
    logger.addEntry('error', `Addon folder not found: ${ADDON_NAME}. Make sure the addon is installed.`);
    console.log('[DI Monitor] Addon folder does not exist:', addonDir);
    return;
  }

  console.log('[DI Monitor] Addon folder exists, attempting write...');

  try {
    await writeSavedVariables(filePath, prData);
    const count = Object.keys(prData).length;
    logger.addEntry('updated', `PR values updated for ${count} characters`);
    console.log('[DI Monitor] Write successful');
  } catch (err) {
    logger.addEntry('error', `Failed to write PR values: ${err.message}`);
    console.log('[DI Monitor] Write failed:', err.message);
    return;
  }

  try {
    const wowRunning = await isWowRunning();

    if (wowRunning) {
      dialog.showMessageBox({
        type: 'info',
        title: 'DI Monitor',
        message: 'New PR values received! Reload your game!',
        buttons: ['OK']
      });
    } else {
      if (tray) {
        tray.displayBalloon({
          title: 'DI Monitor',
          content: 'PR values updated.',
          iconType: 'info'
        });
      }
    }
  } catch (err) {
    logger.addEntry('error', `WoW detection failed: ${err.message}`);
  }
}

function setupIPC() {
  ipcMain.handle('get-settings', () => {
    return {
      wowPath: settings.get('wowPath'),
      runOnStartup: settings.get('runOnStartup'),
      siteUrl: settings.get('siteUrl'),
      pollInterval: settings.get('pollInterval'),
      rclootcouncilPath: settings.get('rclootcouncilPath')
    };
  });

  ipcMain.handle('save-settings', (event, newSettings) => {
    if (newSettings.wowPath !== undefined) {
      settings.set('wowPath', newSettings.wowPath);
    }
    if (newSettings.runOnStartup !== undefined) {
      settings.set('runOnStartup', newSettings.runOnStartup);
      app.setLoginItemSettings({ openAtLogin: newSettings.runOnStartup });
    }
    if (newSettings.siteUrl !== undefined) {
      settings.set('siteUrl', newSettings.siteUrl);
    }
    if (newSettings.pollInterval !== undefined) {
      settings.set('pollInterval', newSettings.pollInterval);
    }
    if (newSettings.rclootcouncilPath !== undefined) {
      settings.set('rclootcouncilPath', newSettings.rclootcouncilPath);
    }

    // Reconfigure poller with new settings
    if (poller) {
      poller.configure(settings.get('siteUrl'), settings.get('pollInterval'));
    }

    // Reconfigure watcher with new settings
    if (watcher) {
      watcher.configure(settings.get('rclootcouncilPath'), settings.get('siteUrl'));
    }

    return true;
  });

  ipcMain.handle('get-logs', () => {
    return logger.getEntries();
  });

  ipcMain.handle('select-wow-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select your World of Warcraft installation folder',
      properties: ['openDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const selected = result.filePaths[0];
      const addonDir = path.join(selected, '_retail_', 'Interface', 'AddOns', ADDON_NAME);
      if (fs.existsSync(addonDir)) {
        return { path: selected, valid: true };
      }
      return { path: selected, valid: false, error: `Could not find the ${ADDON_NAME} addon. Make sure you selected the main World of Warcraft folder and the addon is installed.` };
    }
    return null;
  });

  ipcMain.handle('select-rcl-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select RCLootCouncil.lua SavedVariables file',
      properties: ['openFile'],
      filters: [
        { name: 'Lua Files', extensions: ['lua'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const selected = result.filePaths[0];
      const filename = path.basename(selected).toLowerCase();
      
      if (filename === 'rclootcouncil.lua') {
        return { path: selected, valid: true };
      }
      return { path: selected, valid: false, error: 'Please select the specific file named "RCLootCouncil.lua"' };
    }
    return null;
  });

  ipcMain.handle('validate-addon', (event, wowPath) => {
    if (!wowPath) return { found: false };
    const addonDir = path.join(wowPath, '_retail_', 'Interface', 'AddOns', ADDON_NAME);
    return { found: fs.existsSync(addonDir), path: addonDir };
  });

  ipcMain.handle('open-logs-folder', () => {
    shell.openPath(app.getPath('userData'));
  });
}

function startPoller() {
  console.log('[Main] startPoller() called');
  poller = new Poller(handlePRUpdate);

  if (mainWindow) {
    poller.setMainWindow(mainWindow);
  }

  const siteUrl = settings.get('siteUrl');
  const pollInterval = settings.get('pollInterval');
  console.log('[Main] Configuring poller with siteUrl:', siteUrl, 'interval:', pollInterval);
  poller.configure(siteUrl, pollInterval);

  if (siteUrl) {
    console.log('[Main] Starting poller');
    poller.start();
  } else {
    console.log('[Main] No siteUrl configured, poller not started');
  }
}

function startWatcher() {
  console.log('[Main] startWatcher() called');
  watcher = new Watcher();
  
  const rclPath = settings.get('rclootcouncilPath');
  const siteUrl = settings.get('siteUrl');
  
  watcher.configure(rclPath, siteUrl);
}

app.on('ready', () => {
  logger.init();
  setupIPC();
  createTray();
  createWindow();
  startPoller();
  startWatcher();

  app.setLoginItemSettings({
    openAtLogin: settings.get('runOnStartup')
  });
});

app.on('window-all-closed', () => {
  // Don't quit — keep tray alive
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (poller) poller.stop();
  if (watcher) watcher.stop();
});
