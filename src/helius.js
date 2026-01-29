/**
 * Helius webhook validation and parsing
 * Handles incoming webhook events from Helius
 */

import { createLogger } from './utils/logger.js';
import { checkAndMarkSignature } from './utils/dedupe.js';

const log = createLogger('helius');

// Known DEX program IDs on Solana
const DEX_PROGRAMS = {
  RAYDIUM_V4: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  RAYDIUM_CLMM: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
  RAYDIUM_CP: 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
  ORCA_WHIRLPOOL: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
  METEORA_DLMM: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
  METEORA_POOLS: 'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB',
  PUMP_FUN: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  PUMP_FUN_AMM: 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',
  JUPITER_V6: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  MOONSHOT: 'MoonCVVNZFSYkqNXP6bxHLPL6QQJiMagDL3qcqUQTrG',
};

// SPL Token Program
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

// System Program
const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

// Wrapped SOL
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// Known stablecoins
const STABLECOIN_MINTS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
]);

/**
 * Validate webhook secret
 */
export function validateWebhookSecret(request) {
  const secret = process.env.HELIUS_WEBHOOK_SECRET;
  if (!secret) {
    log.warn('HELIUS_WEBHOOK_SECRET not configured, skipping validation');
    return true;
  }

  // Check header (Helius sends as Authorization header or custom header)
  const authHeader = request.headers['authorization'] || request.headers['x-webhook-secret'];

  if (authHeader === secret || authHeader === `Bearer ${secret}`) {
    return true;
  }

  // Check query param
  const querySecret = request.query?.secret;
  if (querySecret === secret) {
    return true;
  }

  log.warn('Webhook secret validation failed');
  return false;
}

/**
 * Parse Helius webhook payload
 * Extracts relevant token and swap information
 */
export function parseWebhookPayload(payload) {
  const results = {
    tokens: [], // New token candidates
    swaps: [], // Swap transactions
    pools: [], // New pool creations
    raw: payload, // Store raw for debugging
  };

  // Handle array of transactions
  const transactions = Array.isArray(payload) ? payload : [payload];

  for (const tx of transactions) {
    try {
      const parsed = parseTransaction(tx);
      if (parsed.token) results.tokens.push(parsed.token);
      if (parsed.swap) results.swaps.push(parsed.swap);
      if (parsed.pool) results.pools.push(parsed.pool);
    } catch (err) {
      log.error('Failed to parse transaction', { error: err.message, signature: tx?.signature });
    }
  }

  return results;
}

/**
 * Parse a single transaction
 */
function parseTransaction(tx) {
  const result = {
    token: null,
    swap: null,
    pool: null,
  };

  if (!tx) return result;

  const signature = tx.signature;

  // Skip if already processed
  if (signature && !checkAndMarkSignature(signature)) {
    return result;
  }

  // Try to identify transaction type
  const type = tx.type || identifyTransactionType(tx);

  switch (type) {
    case 'SWAP':
      result.swap = parseSwapTransaction(tx);
      if (result.swap) {
        result.token = {
          mint: result.swap.token_mint,
          source: 'swap',
        };
      }
      break;

    case 'CREATE_POOL':
    case 'INITIALIZE_POOL':
      result.pool = parsePoolCreation(tx);
      if (result.pool) {
        result.token = {
          mint: result.pool.token_mint,
          source: 'pool_creation',
        };
      }
      break;

    case 'TRANSFER':
    case 'TOKEN_MINT':
      result.token = parseTokenFromTransfer(tx);
      break;

    default:
      // Try to extract any relevant mint from the transaction
      result.token = extractMintFromTransaction(tx);
  }

  return result;
}

/**
 * Identify transaction type from its structure
 */
function identifyTransactionType(tx) {
  // Check source if available
  if (tx.source) {
    const source = tx.source.toUpperCase();
    if (source.includes('RAYDIUM') || source.includes('ORCA') || source.includes('METEORA')) {
      return 'SWAP';
    }
    if (source.includes('PUMP')) {
      return 'SWAP';
    }
  }

  // Check type field
  if (tx.type) {
    return tx.type.toUpperCase();
  }

  // Check instructions for DEX program IDs
  const instructions = tx.instructions || tx.accountData || [];
  for (const ix of instructions) {
    const programId = ix.programId || ix.program;
    if (programId && Object.values(DEX_PROGRAMS).includes(programId)) {
      return 'SWAP';
    }
  }

  // Check for token transfers
  if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
    return 'TRANSFER';
  }

  return 'UNKNOWN';
}

/**
 * Parse swap transaction
 */
function parseSwapTransaction(tx) {
  const signature = tx.signature;
  const timestamp = tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : new Date().toISOString();

  // Try to extract swap details from different formats
  let tokenMint = null;
  let side = 'unknown';
  let amountUsd = null;
  let amountToken = null;
  let amountSol = null;
  let buyer = null;
  let seller = null;
  let poolAddress = null;

  // Check tokenTransfers (Helius enhanced format)
  if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
    for (const transfer of tx.tokenTransfers) {
      const mint = transfer.mint;

      // Skip SOL and stablecoins to find the meme token
      if (mint === WSOL_MINT || STABLECOIN_MINTS.has(mint)) {
        // This might be the quote token
        if (transfer.tokenAmount) {
          amountSol = parseFloat(transfer.tokenAmount) || null;
        }
        continue;
      }

      // This is likely the meme token
      tokenMint = mint;
      amountToken = parseFloat(transfer.tokenAmount) || null;

      // Determine buy/sell based on direction
      if (transfer.toUserAccount === tx.feePayer) {
        side = 'buy';
        buyer = tx.feePayer;
      } else if (transfer.fromUserAccount === tx.feePayer) {
        side = 'sell';
        seller = tx.feePayer;
      }
    }
  }

  // Try nativeTransfers for SOL amount
  if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
    let totalSol = 0;
    for (const transfer of tx.nativeTransfers) {
      if (transfer.amount) {
        totalSol += Math.abs(transfer.amount);
      }
    }
    if (totalSol > 0 && !amountSol) {
      amountSol = totalSol / 1e9; // Convert lamports to SOL
    }
  }

  // Check swap event if available (Helius parsed format)
  if (tx.events?.swap) {
    const swap = tx.events.swap;
    tokenMint = tokenMint || swap.tokenOutputs?.[0]?.mint || swap.tokenInputs?.[0]?.mint;
    if (swap.nativeOutput?.amount) {
      side = 'sell';
      seller = tx.feePayer;
    } else if (swap.nativeInput?.amount) {
      side = 'buy';
      buyer = tx.feePayer;
    }
  }

  // Try to get account keys for pool address
  if (tx.accountData) {
    for (const acc of tx.accountData) {
      if (acc.account && isDexPool(acc.account)) {
        poolAddress = acc.account;
        break;
      }
    }
  }

  // Skip if we couldn't identify a token
  if (!tokenMint) {
    return null;
  }

  // Skip known tokens (SOL, stablecoins)
  if (tokenMint === WSOL_MINT || STABLECOIN_MINTS.has(tokenMint)) {
    return null;
  }

  return {
    token_mint: tokenMint,
    signature,
    ts: timestamp,
    side,
    amount_usd: amountUsd,
    amount_token: amountToken,
    amount_sol: amountSol,
    buyer,
    seller,
    pool_address: poolAddress,
    meta: {
      source: tx.source || 'unknown',
      type: tx.type,
      fee_payer: tx.feePayer,
    },
  };
}

/**
 * Parse pool creation transaction
 */
function parsePoolCreation(tx) {
  let tokenMint = null;
  let poolAddress = null;
  let dex = 'unknown';
  let baseMint = null;
  let quoteMint = null;

  // Check instructions for pool initialization
  if (tx.instructions) {
    for (const ix of tx.instructions) {
      const programId = ix.programId;

      // Identify DEX
      for (const [name, id] of Object.entries(DEX_PROGRAMS)) {
        if (programId === id) {
          dex = name.toLowerCase();
          break;
        }
      }

      // Extract accounts (pool address is usually one of the first accounts)
      if (ix.accounts && ix.accounts.length > 0) {
        poolAddress = poolAddress || ix.accounts[0];
      }
    }
  }

  // Extract token mints from token transfers or inner instructions
  if (tx.tokenTransfers) {
    for (const transfer of tx.tokenTransfers) {
      if (transfer.mint === WSOL_MINT) {
        quoteMint = WSOL_MINT;
      } else if (STABLECOIN_MINTS.has(transfer.mint)) {
        quoteMint = transfer.mint;
      } else {
        tokenMint = transfer.mint;
        baseMint = transfer.mint;
      }
    }
  }

  if (!tokenMint) return null;

  return {
    token_mint: tokenMint,
    pool_address: poolAddress,
    dex,
    base_mint: baseMint,
    quote_mint: quoteMint,
    created_at: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : new Date().toISOString(),
    meta: {
      signature: tx.signature,
      fee_payer: tx.feePayer,
    },
  };
}

/**
 * Parse token from transfer transaction
 */
function parseTokenFromTransfer(tx) {
  if (!tx.tokenTransfers || tx.tokenTransfers.length === 0) {
    return null;
  }

  for (const transfer of tx.tokenTransfers) {
    const mint = transfer.mint;

    // Skip known tokens
    if (mint === WSOL_MINT || STABLECOIN_MINTS.has(mint)) {
      continue;
    }

    return {
      mint,
      source: 'transfer',
    };
  }

  return null;
}

/**
 * Extract any mint from transaction
 */
function extractMintFromTransaction(tx) {
  // Check tokenTransfers
  if (tx.tokenTransfers) {
    for (const transfer of tx.tokenTransfers) {
      if (transfer.mint && transfer.mint !== WSOL_MINT && !STABLECOIN_MINTS.has(transfer.mint)) {
        return {
          mint: transfer.mint,
          source: 'transaction',
        };
      }
    }
  }

  // Check accountData for token accounts
  if (tx.accountData) {
    for (const acc of tx.accountData) {
      if (acc.tokenBalanceChanges) {
        for (const change of acc.tokenBalanceChanges) {
          if (change.mint && change.mint !== WSOL_MINT && !STABLECOIN_MINTS.has(change.mint)) {
            return {
              mint: change.mint,
              source: 'account_data',
            };
          }
        }
      }
    }
  }

  return null;
}

/**
 * Check if an address is a known DEX pool pattern
 */
function isDexPool(address) {
  // This is a heuristic - in production you'd check against known pool addresses
  // or verify the account owner is a DEX program
  return false; // Placeholder
}

/**
 * Get event type string for storage
 */
export function getEventType(tx) {
  if (tx.type) return tx.type;
  if (tx.source) return `${tx.source}_TRANSACTION`;
  return 'UNKNOWN';
}

/**
 * Fetch Helius API for token metadata
 */
export async function fetchTokenMetadata(mint) {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    log.warn('HELIUS_API_KEY not configured');
    return null;
  }

  try {
    const response = await fetch(`https://api.helius.xyz/v0/token-metadata?api-key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mintAccounts: [mint],
        includeOffChain: true,
        disableCache: false,
      }),
    });

    if (!response.ok) {
      log.warn('Failed to fetch token metadata', { mint, status: response.status });
      return null;
    }

    const data = await response.json();
    return data[0] || null;
  } catch (err) {
    log.error('Error fetching token metadata', { mint, error: err.message });
    return null;
  }
}

/**
 * Fetch Helius API for parsed transactions
 */
export async function fetchParsedTransactions(signatures) {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    log.warn('HELIUS_API_KEY not configured');
    return [];
  }

  try {
    const response = await fetch(`https://api.helius.xyz/v0/transactions?api-key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: signatures }),
    });

    if (!response.ok) {
      log.warn('Failed to fetch transactions', { status: response.status });
      return [];
    }

    return await response.json();
  } catch (err) {
    log.error('Error fetching transactions', { error: err.message });
    return [];
  }
}

/**
 * Fetch DAS API for token holders (via Helius)
 */
export async function fetchTokenHolders(mint, limit = 20) {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    log.warn('HELIUS_API_KEY not configured');
    return null;
  }

  try {
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'holder-query',
        method: 'getTokenLargestAccounts',
        params: [mint],
      }),
    });

    if (!response.ok) {
      log.warn('Failed to fetch token holders', { mint, status: response.status });
      return null;
    }

    const data = await response.json();
    return data.result?.value || null;
  } catch (err) {
    log.error('Error fetching token holders', { mint, error: err.message });
    return null;
  }
}

/**
 * Fetch token account info (mint authority, freeze authority, supply)
 */
export async function fetchTokenInfo(mint) {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    log.warn('HELIUS_API_KEY not configured');
    return null;
  }

  try {
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'token-info',
        method: 'getAccountInfo',
        params: [
          mint,
          {
            encoding: 'jsonParsed',
          },
        ],
      }),
    });

    if (!response.ok) {
      log.warn('Failed to fetch token info', { mint, status: response.status });
      return null;
    }

    const data = await response.json();
    const parsed = data.result?.value?.data?.parsed;

    if (parsed?.type === 'mint' && parsed?.info) {
      return {
        mintAuthority: parsed.info.mintAuthority,
        freezeAuthority: parsed.info.freezeAuthority,
        decimals: parsed.info.decimals,
        supply: parsed.info.supply,
      };
    }

    return null;
  } catch (err) {
    log.error('Error fetching token info', { mint, error: err.message });
    return null;
  }
}

export { DEX_PROGRAMS, WSOL_MINT, STABLECOIN_MINTS };
