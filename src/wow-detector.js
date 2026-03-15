const { exec } = require('child_process');

function isWowRunning() {
  return new Promise((resolve) => {
    exec('tasklist /FI "IMAGENAME eq Wow.exe" /NH', (err, stdout) => {
      if (err) return resolve(false);
      resolve(stdout.toLowerCase().includes('wow.exe'));
    });
  });
}

module.exports = { isWowRunning };
