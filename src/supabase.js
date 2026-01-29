/**
 * Supabase client and database operations
 */

import { createClient } from '@supabase/supabase-js';
import { createLogger } from './utils/logger.js';
import { minutesAgo, secondsAgo } from './utils/time.js';

const log = createLogger('supabase');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  log.error('Missing Supabase configuration', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseKey,
  });
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '', {
  auth: {
    persistSession: false,
  },
});

// ============================================
// TOKENS
// ============================================

/**
 * Upsert a token (create if not exists, update if exists)
 */
export async function upsertToken(mint, data = {}) {
  const { data: token, error } = await supabase
    .from('tokens')
    .upsert(
      {
        mint,
        ...data,
      },
      { onConflict: 'mint', ignoreDuplicates: false }
    )
    .select()
    .single();

  if (error) {
    log.error('Failed to upsert token', { mint, error: error.message });
    throw error;
  }

  return token;
}

/**
 * Get token by mint address
 */
export async function getToken(mint) {
  const { data, error } = await supabase
    .from('tokens')
    .select('*')
    .eq('mint', mint)
    .single();

  if (error && error.code !== 'PGRST116') {
    log.error('Failed to get token', { mint, error: error.message });
    throw error;
  }

  return data;
}

/**
 * Update token status
 */
export async function updateTokenStatus(mint, status) {
  const { error } = await supabase
    .from('tokens')
    .update({ status })
    .eq('mint', mint);

  if (error) {
    log.error('Failed to update token status', { mint, status, error: error.message });
    throw error;
  }
}

/**
 * Get tokens that need enrichment
 */
export async function getTokensToEnrich(limit = 10, staleSeconds = 30) {
  const staleTime = secondsAgo(staleSeconds);

  const { data, error } = await supabase
    .from('tokens')
    .select('*')
    .eq('status', 'active')
    .or(`last_enriched_at.is.null,last_enriched_at.lt.${staleTime}`)
    .order('first_seen_at', { ascending: false })
    .limit(limit);

  if (error) {
    log.error('Failed to get tokens to enrich', { error: error.message });
    throw error;
  }

  return data || [];
}

/**
 * Update token enrichment timestamp and data
 */
export async function updateTokenEnrichment(mint, enrichData) {
  const { error } = await supabase
    .from('tokens')
    .update({
      ...enrichData,
      last_enriched_at: new Date().toISOString(),
    })
    .eq('mint', mint);

  if (error) {
    log.error('Failed to update token enrichment', { mint, error: error.message });
    throw error;
  }
}

/**
 * Get active tokens
 */
export async function getActiveTokens(limit = 100) {
  const { data, error } = await supabase
    .from('tokens')
    .select('*')
    .eq('status', 'active')
    .order('first_seen_at', { ascending: false })
    .limit(limit);

  if (error) {
    log.error('Failed to get active tokens', { error: error.message });
    throw error;
  }

  return data || [];
}

// ============================================
// POOLS
// ============================================

/**
 * Upsert a pool
 */
export async function upsertPool(tokenMint, poolAddress, data = {}) {
  const { data: pool, error } = await supabase
    .from('pools')
    .upsert(
      {
        token_mint: tokenMint,
        pool_address: poolAddress,
        ...data,
      },
      { onConflict: 'pool_address', ignoreDuplicates: false }
    )
    .select()
    .single();

  if (error) {
    log.error('Failed to upsert pool', { tokenMint, poolAddress, error: error.message });
    throw error;
  }

  return pool;
}

/**
 * Get pools for a token
 */
export async function getPoolsForToken(tokenMint) {
  const { data, error } = await supabase
    .from('pools')
    .select('*')
    .eq('token_mint', tokenMint)
    .order('created_at', { ascending: false });

  if (error) {
    log.error('Failed to get pools', { tokenMint, error: error.message });
    throw error;
  }

  return data || [];
}

// ============================================
// SWAPS
// ============================================

/**
 * Insert a swap (ignore duplicates)
 */
export async function insertSwap(swapData) {
  const { data, error } = await supabase
    .from('swaps')
    .upsert(swapData, { onConflict: 'signature', ignoreDuplicates: true })
    .select()
    .single();

  if (error && error.code !== '23505') {
    // 23505 = unique violation (duplicate)
    log.error('Failed to insert swap', { signature: swapData.signature, error: error.message });
    throw error;
  }

  return data;
}

/**
 * Get swap metrics for a token
 */
export async function getSwapMetrics(tokenMint) {
  const now = new Date();
  const oneMinAgo = minutesAgo(1);
  const fiveMinAgo = minutesAgo(5);
  const fifteenMinAgo = minutesAgo(15);

  // Get all swaps in the last 15 minutes
  const { data: swaps, error } = await supabase
    .from('swaps')
    .select('ts, side, amount_usd, buyer, seller')
    .eq('token_mint', tokenMint)
    .gte('ts', fifteenMinAgo)
    .order('ts', { ascending: false });

  if (error) {
    log.error('Failed to get swap metrics', { tokenMint, error: error.message });
    throw error;
  }

  if (!swaps || swaps.length === 0) {
    return {
      swaps_1m: 0,
      swaps_5m: 0,
      swaps_15m: 0,
      unique_buyers_1m: 0,
      unique_buyers_5m: 0,
      unique_buyers_15m: 0,
      unique_sellers_1m: 0,
      unique_sellers_5m: 0,
      volume_usd_1m: 0,
      volume_usd_5m: 0,
      volume_usd_15m: 0,
      buy_volume_usd_1m: 0,
      sell_volume_usd_1m: 0,
    };
  }

  // Calculate metrics for different time windows
  const metrics = {
    swaps_1m: 0,
    swaps_5m: 0,
    swaps_15m: 0,
    unique_buyers_1m: new Set(),
    unique_buyers_5m: new Set(),
    unique_buyers_15m: new Set(),
    unique_sellers_1m: new Set(),
    unique_sellers_5m: new Set(),
    volume_usd_1m: 0,
    volume_usd_5m: 0,
    volume_usd_15m: 0,
    buy_volume_usd_1m: 0,
    sell_volume_usd_1m: 0,
  };

  for (const swap of swaps) {
    const swapTime = new Date(swap.ts).getTime();
    const oneMinTime = new Date(oneMinAgo).getTime();
    const fiveMinTime = new Date(fiveMinAgo).getTime();

    const volume = parseFloat(swap.amount_usd) || 0;

    // 15 minute window
    metrics.swaps_15m++;
    metrics.volume_usd_15m += volume;
    if (swap.buyer) metrics.unique_buyers_15m.add(swap.buyer);
    if (swap.seller) metrics.unique_sellers_5m.add(swap.seller);

    // 5 minute window
    if (swapTime >= fiveMinTime) {
      metrics.swaps_5m++;
      metrics.volume_usd_5m += volume;
      if (swap.buyer) metrics.unique_buyers_5m.add(swap.buyer);
    }

    // 1 minute window
    if (swapTime >= oneMinTime) {
      metrics.swaps_1m++;
      metrics.volume_usd_1m += volume;
      if (swap.buyer) metrics.unique_buyers_1m.add(swap.buyer);
      if (swap.seller) metrics.unique_sellers_1m.add(swap.seller);
      if (swap.side === 'buy') {
        metrics.buy_volume_usd_1m += volume;
      } else if (swap.side === 'sell') {
        metrics.sell_volume_usd_1m += volume;
      }
    }
  }

  return {
    swaps_1m: metrics.swaps_1m,
    swaps_5m: metrics.swaps_5m,
    swaps_15m: metrics.swaps_15m,
    unique_buyers_1m: metrics.unique_buyers_1m.size,
    unique_buyers_5m: metrics.unique_buyers_5m.size,
    unique_buyers_15m: metrics.unique_buyers_15m.size,
    unique_sellers_1m: metrics.unique_sellers_1m.size,
    unique_sellers_5m: metrics.unique_sellers_5m.size,
    volume_usd_1m: metrics.volume_usd_1m,
    volume_usd_5m: metrics.volume_usd_5m,
    volume_usd_15m: metrics.volume_usd_15m,
    buy_volume_usd_1m: metrics.buy_volume_usd_1m,
    sell_volume_usd_1m: metrics.sell_volume_usd_1m,
  };
}

// ============================================
// HOLDER SNAPSHOTS
// ============================================

/**
 * Insert holder snapshot
 */
export async function insertHolderSnapshot(tokenMint, data) {
  const { error } = await supabase.from('holder_snapshots').insert({
    token_mint: tokenMint,
    ...data,
  });

  if (error) {
    log.error('Failed to insert holder snapshot', { tokenMint, error: error.message });
    throw error;
  }
}

/**
 * Get latest holder snapshot for a token
 */
export async function getLatestHolderSnapshot(tokenMint) {
  const { data, error } = await supabase
    .from('holder_snapshots')
    .select('*')
    .eq('token_mint', tokenMint)
    .order('ts', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    log.error('Failed to get holder snapshot', { tokenMint, error: error.message });
    throw error;
  }

  return data;
}

// ============================================
// TOKEN METRICS
// ============================================

/**
 * Insert token metrics snapshot
 */
export async function insertTokenMetrics(tokenMint, metrics) {
  const { error } = await supabase.from('token_metrics').insert({
    token_mint: tokenMint,
    ...metrics,
  });

  if (error) {
    log.error('Failed to insert token metrics', { tokenMint, error: error.message });
    throw error;
  }
}

/**
 * Get latest token metrics
 */
export async function getLatestTokenMetrics(tokenMint) {
  const { data, error } = await supabase
    .from('token_metrics')
    .select('*')
    .eq('token_mint', tokenMint)
    .order('ts', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    log.error('Failed to get token metrics', { tokenMint, error: error.message });
    throw error;
  }

  return data;
}

// ============================================
// SCORES
// ============================================

/**
 * Insert score
 */
export async function insertScore(tokenMint, scoreData) {
  const { data, error } = await supabase
    .from('scores')
    .insert({
      token_mint: tokenMint,
      ...scoreData,
    })
    .select()
    .single();

  if (error) {
    log.error('Failed to insert score', { tokenMint, error: error.message });
    throw error;
  }

  return data;
}

/**
 * Get latest score for a token
 */
export async function getLatestScore(tokenMint) {
  const { data, error } = await supabase
    .from('scores')
    .select('*')
    .eq('token_mint', tokenMint)
    .order('ts', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    log.error('Failed to get latest score', { tokenMint, error: error.message });
    throw error;
  }

  return data;
}

/**
 * Get top scored tokens in last N minutes
 */
export async function getTopScoredTokens(minutes = 30, limit = 5) {
  const since = minutesAgo(minutes);

  const { data, error } = await supabase
    .from('scores')
    .select(
      `
      *,
      tokens (mint, name, symbol, status)
    `
    )
    .gte('ts', since)
    .order('score', { ascending: false })
    .limit(limit * 3); // Get more to deduplicate

  if (error) {
    log.error('Failed to get top scored tokens', { error: error.message });
    throw error;
  }

  // Deduplicate by token_mint (keep highest score)
  const seen = new Set();
  const unique = [];
  for (const score of data || []) {
    if (!seen.has(score.token_mint)) {
      seen.add(score.token_mint);
      unique.push(score);
      if (unique.length >= limit) break;
    }
  }

  return unique;
}

// ============================================
// ALERTS
// ============================================

/**
 * Get or create alert for a token
 */
export async function getOrCreateAlert(tokenMint) {
  // Try to get existing alert
  let { data: alert, error } = await supabase
    .from('alerts')
    .select('*')
    .eq('token_mint', tokenMint)
    .single();

  if (error && error.code === 'PGRST116') {
    // Create new alert
    const { data: newAlert, error: insertError } = await supabase
      .from('alerts')
      .insert({ token_mint: tokenMint })
      .select()
      .single();

    if (insertError) {
      log.error('Failed to create alert', { tokenMint, error: insertError.message });
      throw insertError;
    }

    return newAlert;
  }

  if (error) {
    log.error('Failed to get alert', { tokenMint, error: error.message });
    throw error;
  }

  return alert;
}

/**
 * Update alert after sending
 */
export async function updateAlert(tokenMint, updateData) {
  const { error } = await supabase.from('alerts').update(updateData).eq('token_mint', tokenMint);

  if (error) {
    log.error('Failed to update alert', { tokenMint, error: error.message });
    throw error;
  }
}

// ============================================
// RAW EVENTS
// ============================================

/**
 * Store raw webhook event
 */
export async function storeRawEvent(eventType, signature, payload) {
  const { error } = await supabase.from('raw_events').insert({
    event_type: eventType,
    signature,
    payload,
  });

  if (error) {
    log.error('Failed to store raw event', { eventType, error: error.message });
    // Don't throw - this is non-critical
  }
}

/**
 * Mark raw event as processed
 */
export async function markEventProcessed(id, error = null) {
  const { error: updateError } = await supabase
    .from('raw_events')
    .update({
      processed: true,
      processed_at: new Date().toISOString(),
      error: error ? String(error) : null,
    })
    .eq('id', id);

  if (updateError) {
    log.error('Failed to mark event processed', { id, error: updateError.message });
  }
}

/**
 * Test database connection
 */
export async function testConnection() {
  try {
    const { data, error } = await supabase.from('tokens').select('count').limit(1);
    if (error) throw error;
    return true;
  } catch (err) {
    log.error('Database connection test failed', err);
    return false;
  }
}
