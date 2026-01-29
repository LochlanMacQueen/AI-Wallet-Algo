/**
 * Time utilities
 */

/**
 * Get current timestamp as ISO string
 */
export function now() {
  return new Date().toISOString();
}

/**
 * Get timestamp N minutes ago
 */
export function minutesAgo(minutes) {
  const date = new Date();
  date.setMinutes(date.getMinutes() - minutes);
  return date.toISOString();
}

/**
 * Get timestamp N seconds ago
 */
export function secondsAgo(seconds) {
  const date = new Date();
  date.setSeconds(date.getSeconds() - seconds);
  return date.toISOString();
}

/**
 * Get timestamp N hours ago
 */
export function hoursAgo(hours) {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date.toISOString();
}

/**
 * Get timestamp N days ago
 */
export function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

/**
 * Parse timestamp to Date object
 */
export function parseTs(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

/**
 * Format duration in human readable form
 */
export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Format timestamp as relative time (e.g., "2m ago")
 */
export function formatRelative(ts) {
  const date = parseTs(ts);
  if (!date) return 'unknown';

  const diff = Date.now() - date.getTime();

  if (diff < 0) return 'in future';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if timestamp is older than specified seconds
 */
export function isOlderThan(ts, seconds) {
  const date = parseTs(ts);
  if (!date) return true;
  return Date.now() - date.getTime() > seconds * 1000;
}

/**
 * Get Unix timestamp in seconds
 */
export function unixSeconds() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Convert Unix timestamp to ISO string
 */
export function fromUnix(unix) {
  return new Date(unix * 1000).toISOString();
}
