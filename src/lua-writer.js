const fs = require('fs');
const path = require('path');

function generateLua(prData) {
  let lua = 'DI_RCL_PRVALUES = {\n';

  const keys = Object.keys(prData).sort();
  for (const key of keys) {
    const value = prData[key];
    lua += `\t["${key}"] = ${value},\n`;
  }

  lua += '}\n';
  return lua;
}

async function writeSavedVariables(filePath, prData) {
  if (!filePath) {
    throw new Error('SavedVariables path not configured');
  }

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory does not exist: ${dir}`);
  }

  const luaContent = generateLua(prData);
  await fs.promises.writeFile(filePath, luaContent, 'utf8');
  console.log('[LuaWriter] Wrote', Object.keys(prData).length, 'PR values to', filePath);
}

module.exports = { writeSavedVariables, generateLua };
