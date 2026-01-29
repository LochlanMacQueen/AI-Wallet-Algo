/**
 * Main Entry Point
 * Starts the server, workers, and bot together
 */

import { config } from 'dotenv';
config();

import { createLogger } from './utils/logger.js';
import { startServer, stopServer } from './server.js';
import { startEnrichWorker, stopEnrichWorker } from './workers/enrich_worker.js';
import { startScoreWorker, stopScoreWorker } from './workers/score_worker.js';
import { initBot, stopBot } from './telegram/bot.js';
import { testConnection } from './supabase.js';

const log = createLogger('main');

// Track running state
let isShuttingDown = false;

/**
 * Validate environment variables
 */
function validateEnv() {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    log.error('Missing required environment variables', { missing });
    return false;
  }

  // Warn about optional but recommended
  const recommended = ['HELIUS_API_KEY', 'HELIUS_WEBHOOK_SECRET', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];
  const missingRecommended = recommended.filter((key) => !process.env[key]);

  if (missingRecommended.length > 0) {
    log.warn('Missing recommended environment variables', { missing: missingRecommended });
  }

  return true;
}

/**
 * Main startup function
 */
async function main() {
  log.info('Starting Solana Meme-Coin Machine...');

  // Validate environment
  if (!validateEnv()) {
    log.error('Environment validation failed');
    process.exit(1);
  }

  // Test database connection
  log.info('Testing database connection...');
  const dbOk = await testConnection();
  if (!dbOk) {
    log.error('Database connection failed. Please check your Supabase configuration.');
    process.exit(1);
  }
  log.info('Database connected');

  // Start Telegram bot
  log.info('Initializing Telegram bot...');
  const bot = initBot();
  if (bot) {
    log.info('Telegram bot initialized');
  } else {
    log.warn('Telegram bot not initialized (check TELEGRAM_BOT_TOKEN)');
  }

  // Start webhook server
  log.info('Starting webhook server...');
  await startServer();

  // Start enrichment worker
  log.info('Starting enrichment worker...');
  startEnrichWorker().catch((err) => {
    log.error('Enrichment worker crashed', err);
  });

  // Start scoring worker
  log.info('Starting scoring worker...');
  startScoreWorker().catch((err) => {
    log.error('Scoring worker crashed', err);
  });

  log.info('All components started successfully');
  log.info('Webhook endpoint: POST /webhook/helius');
  log.info('Health check: GET /health');
}

/**
 * Graceful shutdown
 */
async function shutdown(signal) {
  if (isShuttingDown) {
    log.warn('Shutdown already in progress');
    return;
  }

  isShuttingDown = true;
  log.info('Shutting down...', { signal });

  // Stop workers first
  stopEnrichWorker();
  stopScoreWorker();

  // Stop bot
  stopBot();

  // Stop server
  await stopServer();

  log.info('Shutdown complete');
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  log.error('Uncaught exception', err);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled rejection', { reason: String(reason) });
});

// Start the application
main().catch((err) => {
  log.error('Fatal error during startup', err);
  process.exit(1);
});
