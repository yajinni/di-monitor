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

module.exports = { writeSavedVariables, generateLua };
