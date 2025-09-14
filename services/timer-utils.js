const { logToFile } = require('./logs-optimized');

/**
 * TimerManager
 * - Centralise la gestion des setInterval / setTimeout
 * - Fournit start/stop/clearAll et protège contre les rejets non gérés
 */
class TimerManager {
  constructor(namespace = 'timers') {
    this.namespace = namespace;
    this.intervals = new Map();
    this.timeouts = new Map();
  }

  setInterval(key, fn, ms, options = {}) {
    const { immediate = false, unref = false } = options;

    // Nettoyer si déjà existant
    this.clearInterval(key);

    const wrapped = () => {
      try {
        const res = fn();
        if (res && typeof res.then === 'function') {
          res.catch(err => {
            logToFile?.(`[TIMER:${this.namespace}] Interval '${key}' error: ${err.message}`);
          });
        }
      } catch (err) {
        logToFile?.(`[TIMER:${this.namespace}] Interval '${key}' sync error: ${err.message}`);
      }
    };

    if (immediate) {
      // Exécuter une fois immédiatement
      try {
        const res = fn();
        if (res && typeof res.then === 'function') {
          res.catch(err => {
            logToFile?.(`[TIMER:${this.namespace}] Immediate '${key}' error: ${err.message}`);
          });
        }
      } catch (err) {
        logToFile?.(`[TIMER:${this.namespace}] Immediate '${key}' sync error: ${err.message}`);
      }
    }

    const id = setInterval(wrapped, ms);
    if (unref && typeof id.unref === 'function') id.unref();
    this.intervals.set(key, id);
    logToFile?.(`[TIMER:${this.namespace}] Interval '${key}' started (${Math.round(ms/1000)}s)`);
    return id;
  }

  clearInterval(key) {
    const id = this.intervals.get(key);
    if (id) {
      clearInterval(id);
      this.intervals.delete(key);
      logToFile?.(`[TIMER:${this.namespace}] Interval '${key}' cleared`);
    }
  }

  setTimeout(key, fn, ms, options = {}) {
    const { unref = false } = options;

    this.clearTimeout(key);

    const wrapped = () => {
      try {
        const res = fn();
        if (res && typeof res.then === 'function') {
          res.catch(err => {
            logToFile?.(`[TIMER:${this.namespace}] Timeout '${key}' error: ${err.message}`);
          });
        }
      } catch (err) {
        logToFile?.(`[TIMER:${this.namespace}] Timeout '${key}' sync error: ${err.message}`);
      } finally {
        // Retirer après exécution
        this.timeouts.delete(key);
      }
    };

    const id = setTimeout(wrapped, ms);
    if (unref && typeof id.unref === 'function') id.unref();
    this.timeouts.set(key, id);
    logToFile?.(`[TIMER:${this.namespace}] Timeout '${key}' set (${Math.round(ms/1000)}s)`);
    return id;
  }

  clearTimeout(key) {
    const id = this.timeouts.get(key);
    if (id) {
      clearTimeout(id);
      this.timeouts.delete(key);
      logToFile?.(`[TIMER:${this.namespace}] Timeout '${key}' cleared`);
    }
  }

  clearAll() {
    for (const [key, id] of this.intervals.entries()) {
      clearInterval(id);
      logToFile?.(`[TIMER:${this.namespace}] Interval '${key}' cleared (all)`);
    }
    this.intervals.clear();

    for (const [key, id] of this.timeouts.entries()) {
      clearTimeout(id);
      logToFile?.(`[TIMER:${this.namespace}] Timeout '${key}' cleared (all)`);
    }
    this.timeouts.clear();
  }

  isActive(key) {
    return this.intervals.has(key) || this.timeouts.has(key);
  }
}

module.exports = { TimerManager };
