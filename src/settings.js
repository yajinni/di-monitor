const Store = require('electron-store');

const store = new Store({
  defaults: {
    wowPath: '',
    runOnStartup: false,
    siteUrl: '',
    pollInterval: 5,
    rclootcouncilPath: ''
  }
});

module.exports = store;
