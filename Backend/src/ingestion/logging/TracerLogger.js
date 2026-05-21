import crypto from 'crypto';

class TracerLogger {
  constructor(defaultContext = {}) {
    this.defaultContext = defaultContext;
  }

  static generateTraceId() {
    return crypto.randomBytes(8).toString('hex');
  }

  _format(level, message, context = {}) {
    const mergedContext = { ...this.defaultContext, ...context };
    const timestamp = new Date().toISOString();
    const traceIdStr = mergedContext.traceId ? `[traceId=${mergedContext.traceId}]` : '';
    const platformStr = mergedContext.platform ? `[${mergedContext.platform}]` : '';
    const durationStr = mergedContext.durationMs !== undefined ? `[${mergedContext.durationMs}ms]` : '';
    const retryStr = mergedContext.retry !== undefined ? `[Retry=${mergedContext.retry}]` : '';

    // Color codes for console
    const colors = {
      INFO: '\x1b[32m', // Green
      WARN: '\x1b[33m', // Yellow
      ERROR: '\x1b[31m', // Red
      DEBUG: '\x1b[36m', // Cyan
      RESET: '\x1b[0m'
    };

    const color = colors[level] || colors.RESET;
    const logHeader = `${color}[${level}]${colors.RESET}[${timestamp}]${platformStr}${traceIdStr}${retryStr}${durationStr}`;
    
    // Print to console nicely
    if (level === 'ERROR') {
      console.error(`${logHeader} ${message}`, Object.keys(context).length ? context : '');
    } else if (level === 'WARN') {
      console.warn(`${logHeader} ${message}`, Object.keys(context).length ? context : '');
    } else {
      console.log(`${logHeader} ${message}`, Object.keys(context).length ? context : '');
    }

    return {
      timestamp,
      level,
      message,
      ...mergedContext
    };
  }

  info(message, context) {
    return this._format('INFO', message, context);
  }

  warn(message, context) {
    return this._format('WARN', message, context);
  }

  error(message, context) {
    return this._format('ERROR', message, context);
  }

  debug(message, context) {
    return this._format('DEBUG', message, context);
  }
}

export { TracerLogger };
