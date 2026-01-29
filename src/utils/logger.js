/**
 * Simple structured logger utility
 */

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] ?? LOG_LEVELS.info;

/**
 * Format a log message with timestamp and level
 */
function formatMessage(level, module, message, data) {
  const timestamp = new Date().toISOString();
  const base = {
    ts: timestamp,
    level,
    module,
    msg: message,
  };

  if (data && Object.keys(data).length > 0) {
    return { ...base, ...data };
  }
  return base;
}

/**
 * Output log to console
 */
function output(level, formatted) {
  const str = JSON.stringify(formatted);
  if (level === 'error') {
    console.error(str);
  } else if (level === 'warn') {
    console.warn(str);
  } else {
    console.log(str);
  }
}

/**
 * Create a logger instance for a specific module
 */
export function createLogger(module) {
  return {
    debug(message, data = {}) {
      if (currentLevel <= LOG_LEVELS.debug) {
        output('debug', formatMessage('debug', module, message, data));
      }
    },

    info(message, data = {}) {
      if (currentLevel <= LOG_LEVELS.info) {
        output('info', formatMessage('info', module, message, data));
      }
    },

    warn(message, data = {}) {
      if (currentLevel <= LOG_LEVELS.warn) {
        output('warn', formatMessage('warn', module, message, data));
      }
    },

    error(message, data = {}) {
      if (currentLevel <= LOG_LEVELS.error) {
        // Handle Error objects
        if (data instanceof Error) {
          data = {
            error: data.message,
            stack: data.stack,
          };
        } else if (data.error instanceof Error) {
          data = {
            ...data,
            error: data.error.message,
            stack: data.error.stack,
          };
        }
        output('error', formatMessage('error', module, message, data));
      }
    },
  };
}

// Default logger
export const logger = createLogger('app');
