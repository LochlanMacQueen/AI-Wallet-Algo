/**
 * Enrichment Worker
 * Periodically enriches active tokens with additional data
 */

import { createLogger } from '../utils/logger.js';
import { sleep } from '../utils/time.js';
import {
  getTokensToEnrich,
  updateTokenEnrichment,
  upsertPool,
  insertHolderSnapshot,
  insertTokenMetrics,
  getSwapMetrics,
  getPoolsForToken,
} from '../supabase.js';
import { fetchTokenMetadata, fetchTokenHolders, fetchTokenInfo } from '../helius.js';

const log = createLogger('enrich-worker');

// Configuration
const ENRICH_INTERVAL_MS = parseInt(process.env.ENRICH_INTERVAL_MS || '15000', 10);
const ENRICH_BATCH_SIZE = parseInt(process.env.ENRICH_BATCH_SIZE || '10', 10);
const ENRICH_STALE_SECONDS = parseInt(process.env.ENRICH_STALE_SECONDS || '30', 10);

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

let isRunning = false;
let shouldStop = false;

/**
 * Start the enrichment worker
 */
export async function startEnrichWorker() {
  if (isRunning) {
    log.warn('Enrich worker already running');
    return;
  }

  isRunning = true;
  shouldStop = false;
  log.info('Enrich worker started', {
    interval: ENRICH_INTERVAL_MS,
    batchSize: ENRICH_BATCH_SIZE,
    staleSeconds: ENRICH_STALE_SECONDS,
  });

  while (!shouldStop) {
    try {
      await enrichBatch();
    } catch (err) {
      log.error('Enrich batch error', err);
    }

    await sleep(ENRICH_INTERVAL_MS);
  }

  isRunning = false;
  log.info('Enrich worker stopped');
}

/**
 * Stop the enrichment worker
 */
export function stopEnrichWorker() {
  shouldStop = true;
  log.info('Enrich worker stopping...');
}

/**
 * Enrich a batch of tokens
 */
async function enrichBatch() {
  const tokens = await getTokensToEnrich(ENRICH_BATCH_SIZE, ENRICH_STALE_SECONDS);

  if (tokens.length === 0) {
    log.debug('No tokens to enrich');
    return;
  }

  log.info('Enriching tokens', { count: tokens.length });

  // Process tokens in parallel with rate limiting
  const results = await Promise.allSettled(tokens.map((token) => enrichToken(token)));

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  log.info('Enrich batch complete', { succeeded, failed });
}

/**
 * Enrich a single token
 */
async function enrichToken(token) {
  const { mint } = token;
  log.debug('Enriching token', { mint });

  const enrichData = {};
  const errors = [];

  // 1. Fetch token metadata (name, symbol)
  try {
    const metadata = await retryWithBackoff(() => fetchTokenMetadata(mint));
    if (metadata) {
      if (metadata.onChainMetadata?.metadata?.data?.name) {
        enrichData.name = metadata.onChainMetadata.metadata.data.name;
      }
      if (metadata.onChainMetadata?.metadata?.data?.symbol) {
        enrichData.symbol = metadata.onChainMetadata.metadata.data.symbol;
      }
      if (metadata.legacyMetadata) {
        enrichData.name = enrichData.name || metadata.legacyMetadata.name;
        enrichData.symbol = enrichData.symbol || metadata.legacyMetadata.symbol;
      }
    }
  } catch (err) {
    errors.push(`metadata: ${err.message}`);
  }

  // 2. Fetch token info (authorities, decimals, supply)
  try {
    const tokenInfo = await retryWithBackoff(() => fetchTokenInfo(mint));
    if (tokenInfo) {
      enrichData.mint_authority = tokenInfo.mintAuthority;
      enrichData.freeze_authority = tokenInfo.freezeAuthority;
      enrichData.decimals = tokenInfo.decimals;
      enrichData.supply = tokenInfo.supply;
    }
  } catch (err) {
    errors.push(`tokenInfo: ${err.message}`);
  }

  // 3. Fetch holder distribution
  let holderSnapshot = null;
  try {
    const holders = await retryWithBackoff(() => fetchTokenHolders(mint));
    if (holders && holders.length > 0) {
      holderSnapshot = calculateHolderDistribution(holders);
      await insertHolderSnapshot(mint, holderSnapshot);
    }
  } catch (err) {
    errors.push(`holders: ${err.message}`);
  }

  // 4. Calculate swap metrics from DB
  let swapMetrics = null;
  try {
    swapMetrics = await getSwapMetrics(mint);
  } catch (err) {
    errors.push(`swapMetrics: ${err.message}`);
  }

  // 5. Get pool liquidity (if we have pools)
  let liquidityData = null;
  try {
    const pools = await getPoolsForToken(mint);
    if (pools && pools.length > 0) {
      // Use the pool with highest liquidity
      const bestPool = pools.reduce(
        (best, p) => ((p.liquidity_usd || 0) > (best?.liquidity_usd || 0) ? p : best),
        null
      );
      if (bestPool) {
        liquidityData = {
          liquidity_usd: bestPool.liquidity_usd,
          liquidity_sol: bestPool.liquidity_sol,
        };
      }
    }
  } catch (err) {
    errors.push(`pools: ${err.message}`);
  }

  // 6. Insert token metrics snapshot
  if (swapMetrics || holderSnapshot || liquidityData) {
    try {
      await insertTokenMetrics(mint, {
        ...swapMetrics,
        liquidity_usd: liquidityData?.liquidity_usd,
        liquidity_sol: liquidityData?.liquidity_sol,
        holder_count: holderSnapshot?.holder_count,
      });
    } catch (err) {
      errors.push(`insertMetrics: ${err.message}`);
    }
  }

  // 7. Update token enrichment timestamp and data
  enrichData.meta = {
    ...token.meta,
    last_enrich_errors: errors.length > 0 ? errors : undefined,
    enrich_count: (token.meta?.enrich_count || 0) + 1,
  };

  await updateTokenEnrichment(mint, enrichData);

  if (errors.length > 0) {
    log.warn('Token enriched with errors', { mint, errors });
  } else {
    log.debug('Token enriched successfully', { mint });
  }
}

/**
 * Calculate holder distribution from largest accounts
 */
function calculateHolderDistribution(holders) {
  if (!holders || holders.length === 0) {
    return {
      holder_count: 0,
      top1_pct: 0,
      top5_pct: 0,
      top10_pct: 0,
      top20_pct: 0,
    };
  }

  // Sort by amount descending
  const sorted = [...holders].sort((a, b) => {
    const amountA = parseFloat(a.uiAmount || a.amount || 0);
    const amountB = parseFloat(b.uiAmount || b.amount || 0);
    return amountB - amountA;
  });

  // Calculate total supply from top holders (estimate)
  const totalFromTop = sorted.reduce((sum, h) => sum + parseFloat(h.uiAmount || h.amount || 0), 0);

  if (totalFromTop === 0) {
    return {
      holder_count: sorted.length,
      top1_pct: 0,
      top5_pct: 0,
      top10_pct: 0,
      top20_pct: 0,
    };
  }

  // Calculate percentages
  const top1Amount = sorted.slice(0, 1).reduce((sum, h) => sum + parseFloat(h.uiAmount || h.amount || 0), 0);
  const top5Amount = sorted.slice(0, 5).reduce((sum, h) => sum + parseFloat(h.uiAmount || h.amount || 0), 0);
  const top10Amount = sorted
    .slice(0, 10)
    .reduce((sum, h) => sum + parseFloat(h.uiAmount || h.amount || 0), 0);
  const top20Amount = sorted
    .slice(0, 20)
    .reduce((sum, h) => sum + parseFloat(h.uiAmount || h.amount || 0), 0);

  return {
    holder_count: sorted.length,
    top1_pct: (top1Amount / totalFromTop) * 100,
    top5_pct: (top5Amount / totalFromTop) * 100,
    top10_pct: (top10Amount / totalFromTop) * 100,
    top20_pct: (top20Amount / totalFromTop) * 100,
    meta: {
      total_from_top: totalFromTop,
      top_holders: sorted.slice(0, 5).map((h) => ({
        address: h.address,
        amount: h.uiAmount || h.amount,
      })),
    },
  };
}

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff(fn, maxRetries = MAX_RETRIES, delay = RETRY_DELAY_MS) {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Don't retry on certain errors
      if (err.status === 404 || err.status === 400) {
        throw err;
      }

      if (i < maxRetries - 1) {
        const waitTime = delay * Math.pow(2, i);
        log.debug('Retrying after error', { attempt: i + 1, waitTime, error: err.message });
        await sleep(waitTime);
      }
    }
  }

  throw lastError;
}

/**
 * Run once for testing
 */
export async function runOnce() {
  log.info('Running single enrich batch');
  await enrichBatch();
}

// Allow running directly
if (process.argv[1].includes('enrich_worker.js')) {
  // Load environment variables
  const { config } = await import('dotenv');
  config();

  startEnrichWorker().catch((err) => {
    log.error('Worker failed', err);
    process.exit(1);
  });

  // Handle shutdown
  process.on('SIGINT', () => {
    stopEnrichWorker();
  });

  process.on('SIGTERM', () => {
    stopEnrichWorker();
  });
}
