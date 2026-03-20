const fs = require('fs');
const path = require('path');

function generateLua(prData, lastSync) {
  let lua = 'DI_RCL_PRVALUES = {\n';

  const keys = Object.keys(prData).sort();
  for (const key of keys) {
    const value = prData[key];
    lua += `\t["${key}"] = ${value},\n`;
  }

  lua += '}\n\n';
  
  if (lastSync) {
    lua += `DI_RCL_LAST_SYNC = "${lastSync}"\n`;
  }

  return lua;
}

async function writeSavedVariables(filePath, prData, lastSync) {
  if (!filePath) {
    throw new Error('SavedVariables path not configured');
  }

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory does not exist: ${dir}`);
  }

  const luaContent = generateLua(prData, lastSync);
  await fs.promises.writeFile(filePath, luaContent, 'utf8');
  console.log('[LuaWriter] Wrote', Object.keys(prData).length, 'PR values to', filePath);
}

function readSavedVariables(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Handle BOM if present
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }

    const prData = {};
    let count = 0;
    
    // More robust regex to handle any characters in keys and various number formats
    const regex = /\["(.+?)"\]\s*=\s*([-0-9.]+)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const key = match[1];
      const value = parseFloat(match[2]);
      if (!isNaN(value)) {
        prData[key] = value;
        count++;
      }
    }

    // Also try to extract last sync
    let lastSync = null;
    const syncMatch = content.match(/DI_RCL_LAST_SYNC\s*=\s*"([^"]+)"/);
    if (syncMatch) {
      lastSync = syncMatch[1];
    }

    console.log(`[LuaWriter] Read ${count} PR values from ${filePath}`);
    return { prData, lastSync, count };
  } catch (err) {
    console.error('[LuaWriter] Failed to read SavedVariables:', err);
    return null;
  }
}

module.exports = { writeSavedVariables, generateLua, readSavedVariables };
