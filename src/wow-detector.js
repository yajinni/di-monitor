const { exec } = require('child_process');

function isWowRunning() {
  return new Promise((resolve) => {
    // Check for Wow.exe specifically at the start of the line to avoid matching proxies
    exec('tasklist /FI "IMAGENAME eq Wow.exe" /NH', (err, stdout) => {
      if (err) return resolve(false);
      // stdout will contain something like "Wow.exe  1234 Console..." or a "No tasks" message
      resolve(/^wow\.exe/i.test(stdout.trim()));
    });
  });
}

module.exports = { isWowRunning };
