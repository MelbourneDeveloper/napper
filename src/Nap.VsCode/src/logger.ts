// Logger — decoupled from vscode SDK
// Accepts a write function; the adapter provides the OutputChannel binding

import {
  LOG_PREFIX_INFO,
  LOG_PREFIX_WARN,
  LOG_PREFIX_ERROR,
  LOG_PREFIX_DEBUG,
} from "./constants";

export type LogWriter = (message: string) => void;

const formatMessage = (prefix: string, message: string): string =>
  `[${new Date().toISOString()}] [${prefix}] ${message}`;

export const createLogger = (writer: LogWriter) => ({
  info: (message: string): void => {
    writer(formatMessage(LOG_PREFIX_INFO, message));
  },
  warn: (message: string): void => {
    writer(formatMessage(LOG_PREFIX_WARN, message));
  },
  error: (message: string): void => {
    writer(formatMessage(LOG_PREFIX_ERROR, message));
  },
  debug: (message: string): void => {
    writer(formatMessage(LOG_PREFIX_DEBUG, message));
  },
});

export type Logger = ReturnType<typeof createLogger>;
