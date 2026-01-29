/**
 * Deduplication utilities
 * Uses in-memory LRU cache for quick deduplication
 */

/**
 * Simple LRU Cache for deduplication
 */
class LRUCache {
  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  has(key) {
    if (!this.cache.has(key)) {
      return false;
    }
    // Move to end (most recently used)
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return true;
  }

  add(key, value = true) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Delete oldest (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  get(key) {
    if (!this.cache.has(key)) {
      return undefined;
    }
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

// Global caches for different entity types
const signatureCache = new LRUCache(50000);
const mintCache = new LRUCache(10000);
const eventCache = new LRUCache(20000);

/**
 * Check if a transaction signature has been seen
 */
export function hasSeenSignature(signature) {
  return signatureCache.has(signature);
}

/**
 * Mark a transaction signature as seen
 */
export function markSignatureSeen(signature) {
  signatureCache.add(signature);
}

/**
 * Check if a mint address has been seen recently
 */
export function hasSeenMint(mint) {
  return mintCache.has(mint);
}

/**
 * Mark a mint as seen
 */
export function markMintSeen(mint) {
  mintCache.add(mint);
}

/**
 * Check if an event (by unique ID) has been processed
 */
export function hasProcessedEvent(eventId) {
  return eventCache.has(eventId);
}

/**
 * Mark an event as processed
 */
export function markEventProcessed(eventId) {
  eventCache.add(eventId);
}

/**
 * Generate a unique event ID from components
 */
export function generateEventId(signature, eventType, index = 0) {
  return `${signature}:${eventType}:${index}`;
}

/**
 * Check and mark signature atomically
 * Returns true if this is the first time seeing it
 */
export function checkAndMarkSignature(signature) {
  if (signatureCache.has(signature)) {
    return false;
  }
  signatureCache.add(signature);
  return true;
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    signatures: signatureCache.size(),
    mints: mintCache.size(),
    events: eventCache.size(),
  };
}

/**
 * Clear all caches
 */
export function clearAllCaches() {
  signatureCache.clear();
  mintCache.clear();
  eventCache.clear();
}

export { LRUCache };
