/**
 * Scoring Worker
 * Periodically computes scores for active tokens and sends alerts
 */

import { createLogger } from '../utils/logger.js';
import { sleep } from '../utils/time.js';
import {
  getActiveTokens,
  getLatestTokenMetrics,
  getLatestHolderSnapshot,
  getPoolsForToken,
  getLatestScore,
  insertScore,
  getOrCreateAlert,
} from '../supabase.js';
import { score, shouldAlert } from '../scoring/score.js';
import { sendTokenAlert } from '../telegram/bot.js';

const log = createLogger('score-worker');

// Configuration
const SCORE_INTERVAL_MS = parseInt(process.env.SCORE_INTERVAL_MS || '10000', 10);
const SCORE_BATCH_SIZE = parseInt(process.env.SCORE_BATCH_SIZE || '20', 10);

let isRunning = false;
let shouldStop = false;

/**
 * Start the scoring worker
 */
export async function startScoreWorker() {
  if (isRunning) {
    log.warn('Score worker already running');
    return;
  }

  isRunning = true;
  shouldStop = false;
  log.info('Score worker started', {
    interval: SCORE_INTERVAL_MS,
    batchSize: SCORE_BATCH_SIZE,
  });

  while (!shouldStop) {
    try {
      await scoreBatch();
    } catch (err) {
      log.error('Score batch error', err);
    }

    await sleep(SCORE_INTERVAL_MS);
  }

  isRunning = false;
  log.info('Score worker stopped');
}

/**
 * Stop the scoring worker
 */
export function stopScoreWorker() {
  shouldStop = true;
  log.info('Score worker stopping...');
}

/**
 * Score a batch of active tokens
 */
async function scoreBatch() {
  const tokens = await getActiveTokens(SCORE_BATCH_SIZE);

  if (tokens.length === 0) {
    log.debug('No active tokens to score');
    return;
  }

  log.debug('Scoring tokens', { count: tokens.length });

  let scored = 0;
  let alerted = 0;

  for (const token of tokens) {
    try {
      const result = await scoreToken(token);
      scored++;

      if (result.alerted) {
        alerted++;
      }
    } catch (err) {
      log.error('Failed to score token', { mint: token.mint, error: err.message });
    }
  }

  log.info('Score batch complete', { scored, alerted });
}

/**
 * Score a single token
 */
async function scoreToken(token) {
  const { mint } = token;

  // Get latest data
  const [metrics, holders, pools, previousScore] = await Promise.all([
    getLatestTokenMetrics(mint),
    getLatestHolderSnapshot(mint),
    getPoolsForToken(mint),
    getLatestScore(mint),
  ]);

  const pool = pools?.[0];

  // Compute score
  const scoreResult = score({
    token,
    metrics,
    holders,
    pool,
  });

  // Store score
  await insertScore(mint, {
    score: scoreResult.score,
    reasons: scoreResult.reasons,
    risk_flags: scoreResult.risk_flags,
    components: scoreResult.components,
  });

  log.debug('Token scored', {
    mint,
    score: scoreResult.score,
    riskFlags: scoreResult.risk_flags.length,
  });

  // Check if we should alert
  const alert = await getOrCreateAlert(mint);
  const alertCheck = shouldAlert(scoreResult, alert.last_score, alert.last_risk_flags || []);

  let alerted = false;

  if (alertCheck.shouldSend) {
    log.info('Sending alert', {
      mint,
      score: scoreResult.score,
      reason: alertCheck.reason,
      previousScore: alert.last_score,
    });

    await sendTokenAlert(token, scoreResult, metrics, holders);
    alerted = true;
  }

  return {
    score: scoreResult.score,
    alerted,
  };
}

/**
 * Score a specific token by mint (for on-demand scoring)
 */
export async function scoreTokenByMint(mint) {
  const { getToken } = await import('../supabase.js');
  const token = await getToken(mint);

  if (!token) {
    throw new Error(`Token not found: ${mint}`);
  }

  return scoreToken(token);
}

/**
 * Run once for testing
 */
export async function runOnce() {
  log.info('Running single score batch');
  await scoreBatch();
}

// Allow running directly
if (process.argv[1].includes('score_worker.js')) {
  // Load environment variables
  const { config } = await import('dotenv');
  config();

  // Need to initialize bot for alerts
  const { initBot } = await import('../telegram/bot.js');
  initBot();

  startScoreWorker().catch((err) => {
    log.error('Worker failed', err);
    process.exit(1);
  });

  // Handle shutdown
  process.on('SIGINT', () => {
    stopScoreWorker();
  });

  process.on('SIGTERM', () => {
    stopScoreWorker();
  });
}
