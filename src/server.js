/**
 * Webhook Server
 * Receives and processes Helius webhooks
 */

import Fastify from 'fastify';
import { createLogger } from './utils/logger.js';
import { validateWebhookSecret, parseWebhookPayload, getEventType } from './helius.js';
import { upsertToken, insertSwap, upsertPool, storeRawEvent, testConnection } from './supabase.js';

const log = createLogger('server');

// Create Fastify instance
const fastify = Fastify({
  logger: false, // We use our own logger
  trustProxy: true,
});

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  const dbOk = await testConnection();
  return {
    status: dbOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    db: dbOk ? 'connected' : 'disconnected',
  };
});

// Root endpoint
fastify.get('/', async (request, reply) => {
  return {
    name: 'Solana Meme-Coin Machine',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      webhook: '/webhook/helius',
    },
  };
});

// Helius webhook endpoint
fastify.post('/webhook/helius', async (request, reply) => {
  const startTime = Date.now();

  // Validate webhook secret
  if (!validateWebhookSecret(request)) {
    log.warn('Invalid webhook secret', {
      ip: request.ip,
      headers: Object.keys(request.headers),
    });
    return reply.code(401).send({ error: 'Unauthorized' });
  }

  const payload = request.body;

  // Quick acknowledgment - process asynchronously
  // Helius expects a 200 response quickly
  reply.code(200).send({ received: true });

  // Process in background
  setImmediate(async () => {
    try {
      await processWebhookPayload(payload);
      log.info('Webhook processed', { durationMs: Date.now() - startTime });
    } catch (err) {
      log.error('Webhook processing failed', { error: err.message, stack: err.stack });
    }
  });
});

/**
 * Process webhook payload
 */
async function processWebhookPayload(payload) {
  // Parse the payload
  const parsed = parseWebhookPayload(payload);

  log.debug('Parsed webhook', {
    tokens: parsed.tokens.length,
    swaps: parsed.swaps.length,
    pools: parsed.pools.length,
  });

  // Store raw event for debugging (in background)
  const transactions = Array.isArray(payload) ? payload : [payload];
  for (const tx of transactions) {
    if (tx.signature) {
      storeRawEvent(getEventType(tx), tx.signature, tx).catch((err) =>
        log.error('Failed to store raw event', { error: err.message })
      );
    }
  }

  // Process tokens (create if not exists)
  for (const tokenData of parsed.tokens) {
    try {
      await upsertToken(tokenData.mint, {
        meta: {
          source: tokenData.source,
          discovered_at: new Date().toISOString(),
        },
      });
      log.debug('Token upserted', { mint: tokenData.mint, source: tokenData.source });
    } catch (err) {
      // Ignore duplicate errors
      if (!err.message.includes('duplicate') && !err.message.includes('unique')) {
        log.error('Failed to upsert token', { mint: tokenData.mint, error: err.message });
      }
    }
  }

  // Process swaps
  for (const swap of parsed.swaps) {
    try {
      // Ensure token exists
      await upsertToken(swap.token_mint, {
        meta: {
          source: 'swap',
          discovered_at: new Date().toISOString(),
        },
      });

      // Insert swap
      await insertSwap(swap);
      log.debug('Swap inserted', {
        mint: swap.token_mint,
        signature: swap.signature,
        side: swap.side,
      });
    } catch (err) {
      // Ignore duplicate errors
      if (!err.message.includes('duplicate') && !err.message.includes('unique')) {
        log.error('Failed to insert swap', { signature: swap.signature, error: err.message });
      }
    }
  }

  // Process pools
  for (const pool of parsed.pools) {
    try {
      // Ensure token exists
      await upsertToken(pool.token_mint, {
        meta: {
          source: 'pool_creation',
          discovered_at: new Date().toISOString(),
        },
      });

      // Insert pool
      await upsertPool(pool.token_mint, pool.pool_address, {
        dex: pool.dex,
        base_mint: pool.base_mint,
        quote_mint: pool.quote_mint,
        created_at: pool.created_at,
        meta: pool.meta,
      });
      log.debug('Pool upserted', {
        mint: pool.token_mint,
        pool: pool.pool_address,
        dex: pool.dex,
      });
    } catch (err) {
      if (!err.message.includes('duplicate') && !err.message.includes('unique')) {
        log.error('Failed to upsert pool', { pool: pool.pool_address, error: err.message });
      }
    }
  }
}

/**
 * Start the server
 */
export async function startServer() {
  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  try {
    await fastify.listen({ port, host });
    log.info('Server started', { port, host });
    return fastify;
  } catch (err) {
    log.error('Failed to start server', err);
    throw err;
  }
}

/**
 * Stop the server
 */
export async function stopServer() {
  try {
    await fastify.close();
    log.info('Server stopped');
  } catch (err) {
    log.error('Error stopping server', err);
  }
}

/**
 * Get the Fastify instance
 */
export function getServer() {
  return fastify;
}

// Allow running directly
if (process.argv[1].includes('server.js')) {
  // Load environment variables
  const { config } = await import('dotenv');
  config();

  startServer().catch((err) => {
    log.error('Server failed to start', err);
    process.exit(1);
  });

  // Handle shutdown
  process.on('SIGINT', async () => {
    await stopServer();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await stopServer();
    process.exit(0);
  });
}

export default { startServer, stopServer, getServer };
