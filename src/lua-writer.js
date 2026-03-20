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
    const content = fs.readFileSync(filePath, 'utf8');
    const prData = {};
    
    // Simple regex to match ["key"] = value
    const regex = /\["([^"]+)"\]\s*=\s*([0-9.]+)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      prData[match[1]] = parseFloat(match[2]);
    }

    // Also try to extract last sync
    let lastSync = null;
    const syncMatch = content.match(/DI_RCL_LAST_SYNC\s*=\s*"([^"]+)"/);
    if (syncMatch) {
      lastSync = syncMatch[1];
    }

    return { prData, lastSync };
  } catch (err) {
    console.error('[LuaWriter] Failed to read SavedVariables:', err);
    return null;
  }
}

module.exports = { writeSavedVariables, generateLua, readSavedVariables };
