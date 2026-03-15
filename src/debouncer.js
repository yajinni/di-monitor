class Debouncer {
  constructor(callback, delay = 3000) {
    this.callback = callback;
    this.delay = delay;
    this.timer = null;
    this.latestData = null;
  }

  call(data) {
    console.log('[Debouncer] call() invoked, scheduling callback in', this.delay, 'ms');
    this.latestData = data;

    if (this.timer) {
      console.log('[Debouncer] Clearing previous timer');
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      console.log('[Debouncer] Timeout fired, executing callback');
      this.timer = null;
      this.callback(this.latestData);
    }, this.delay);
  }

  cancel() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

module.exports = Debouncer;
