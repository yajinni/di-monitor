const Store = require('electron-store');

const store = new Store({
  defaults: {
    wowPath: '',
    wowAccount: '',
    runOnStartup: false,
    siteUrl: '',
    pollInterval: 5,
    rclootcouncilPath: '',
    attendancePath: ''
  }
});

module.exports = store;
