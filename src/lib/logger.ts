/**
 * Simple logger utility that only logs in development mode
 * In production builds, debug logs are stripped out
 */

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = {
  /**
   * Debug log - only appears in development
   */
  debug: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  /**
   * Info log - only appears in development
   */
  info: (...args: unknown[]) => {
    if (isDevelopment) {
      console.info(...args);
    }
  },

  /**
   * Warning log - appears in all environments
   */
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },

  /**
   * Error log - appears in all environments
   */
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};
