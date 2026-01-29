/**
 * Test script to send sample webhook payloads
 * Usage: node scripts/test_webhook.js [--url URL] [--secret SECRET]
 */

import { config } from 'dotenv';
config();

const DEFAULT_URL = `http://localhost:${process.env.PORT || 3000}/webhook/helius`;

// Parse command line arguments
const args = process.argv.slice(2);
let url = DEFAULT_URL;
let secret = process.env.HELIUS_WEBHOOK_SECRET || 'test-secret';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--url' && args[i + 1]) {
    url = args[i + 1];
    i++;
  } else if (args[i] === '--secret' && args[i + 1]) {
    secret = args[i + 1];
    i++;
  }
}

// Sample webhook payloads

// Sample 1: Swap transaction on Raydium
const sampleSwap = {
  signature: 'test_sig_' + Date.now() + '_swap',
  timestamp: Math.floor(Date.now() / 1000),
  type: 'SWAP',
  source: 'RAYDIUM',
  feePayer: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  tokenTransfers: [
    {
      mint: 'TestMeme' + Date.now().toString(36) + '111111111111111111111',
      fromUserAccount: 'PoolAccount111111111111111111111111111111111',
      toUserAccount: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
      tokenAmount: 1000000,
    },
    {
      mint: 'So11111111111111111111111111111111111111112', // WSOL
      fromUserAccount: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
      toUserAccount: 'PoolAccount111111111111111111111111111111111',
      tokenAmount: 0.5,
    },
  ],
  nativeTransfers: [
    {
      fromUserAccount: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
      toUserAccount: 'PoolAccount111111111111111111111111111111111',
      amount: 500000000, // 0.5 SOL in lamports
    },
  ],
};

// Sample 2: Pool creation
const samplePoolCreation = {
  signature: 'test_sig_' + Date.now() + '_pool',
  timestamp: Math.floor(Date.now() / 1000),
  type: 'CREATE_POOL',
  source: 'RAYDIUM',
  feePayer: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  instructions: [
    {
      programId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
      accounts: ['NewPool' + Date.now().toString(36) + '1111111111111111111'],
    },
  ],
  tokenTransfers: [
    {
      mint: 'TestMeme' + Date.now().toString(36) + '222222222222222222222',
      fromUserAccount: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
      toUserAccount: 'NewPool' + Date.now().toString(36) + '1111111111111111111',
      tokenAmount: 1000000000,
    },
    {
      mint: 'So11111111111111111111111111111111111111112',
      fromUserAccount: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
      toUserAccount: 'NewPool' + Date.now().toString(36) + '1111111111111111111',
      tokenAmount: 10,
    },
  ],
};

// Sample 3: Pump.fun swap
const samplePumpSwap = {
  signature: 'test_sig_' + Date.now() + '_pump',
  timestamp: Math.floor(Date.now() / 1000),
  type: 'SWAP',
  source: 'PUMP_FUN',
  feePayer: 'BuyerWallet1111111111111111111111111111111111',
  tokenTransfers: [
    {
      mint: 'PumpMeme' + Date.now().toString(36) + '333333333333333333333',
      fromUserAccount: 'PumpBondingCurve11111111111111111111111111',
      toUserAccount: 'BuyerWallet1111111111111111111111111111111111',
      tokenAmount: 5000000,
    },
  ],
  nativeTransfers: [
    {
      fromUserAccount: 'BuyerWallet1111111111111111111111111111111111',
      toUserAccount: 'PumpBondingCurve11111111111111111111111111',
      amount: 100000000, // 0.1 SOL
    },
  ],
};

// Sample 4: Batch of multiple swaps
const sampleBatch = [sampleSwap, samplePumpSwap];

async function sendWebhook(payload, name) {
  console.log(`\n📤 Sending ${name}...`);
  console.log(`   URL: ${url}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: secret,
        'X-Webhook-Secret': secret,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log(`   Status: ${response.status}`);
    console.log(`   Response:`, data);

    if (response.ok) {
      console.log(`   ✅ Success`);
    } else {
      console.log(`   ❌ Failed`);
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }
}

async function main() {
  console.log('🧪 Webhook Test Script');
  console.log('='.repeat(50));
  console.log(`Target URL: ${url}`);
  console.log(`Secret: ${secret ? '****' + secret.slice(-4) : 'not set'}`);

  // Send each sample
  await sendWebhook(sampleSwap, 'Sample Raydium Swap');
  await new Promise((r) => setTimeout(r, 500));

  await sendWebhook(samplePoolCreation, 'Sample Pool Creation');
  await new Promise((r) => setTimeout(r, 500));

  await sendWebhook(samplePumpSwap, 'Sample Pump.fun Swap');
  await new Promise((r) => setTimeout(r, 500));

  await sendWebhook(sampleBatch, 'Sample Batch (2 txs)');

  console.log('\n' + '='.repeat(50));
  console.log('✅ Test complete');
  console.log('\nTo verify, check:');
  console.log('1. Server logs for processing messages');
  console.log('2. Supabase tokens table for new entries');
  console.log('3. Supabase swaps table for new entries');
}

main().catch(console.error);
