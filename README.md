# Solana Meme-Coin Machine

A real-time Solana meme-coin detection, scoring, and alerting system using Helius webhooks, Supabase, and Telegram.

## Features

- **Real-time Detection**: Receives Helius webhooks for swap and pool creation events
- **Token Enrichment**: Automatically fetches token metadata, authorities, and holder distribution
- **Deterministic Scoring**: Scores tokens 0-100 based on liquidity, volume, buyers, and more
- **Risk Flags**: Identifies potential risks (mint authority, whale concentration, etc.)
- **Telegram Alerts**: Sends alerts when tokens score above thresholds
- **Persistent Storage**: Stores all data in Supabase for later analysis

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Helius Webhook │────▶│  Webhook Server │────▶│    Supabase     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                        ┌─────────────────┐             │
                        │ Enrich Worker   │◀────────────┤
                        └─────────────────┘             │
                                                        │
                        ┌─────────────────┐             │
                        │  Score Worker   │◀────────────┤
                        └─────────────────┘             │
                                │                       │
                                ▼                       │
                        ┌─────────────────┐             │
                        │  Telegram Bot   │◀────────────┘
                        └─────────────────┘
```

## Prerequisites

- Node.js 20+
- Supabase account (free tier works)
- Helius account (free tier works for testing)
- Telegram bot (via BotFather)

## Quick Start

### 1. Clone and Install

```bash
git clone <repo>
cd solana-memecoin-machine
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **Settings > API** and copy:
   - Project URL
   - Service Role Key (under "service_role")
3. Go to **SQL Editor** and run the contents of `src/db/schema.sql`

### 3. Set Up Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the prompts
3. Copy the bot token
4. Start a chat with your bot and send any message
5. Get your chat ID by visiting: `https://api.telegram.org/bot<TOKEN>/getUpdates`
   - Look for `"chat":{"id":123456789}` in the response

### 4. Set Up Helius

1. Create an account at [helius.dev](https://helius.dev)
2. Create a new project and copy your API key
3. Go to **Webhooks** and create a new webhook:
   - **URL**: `https://your-server.com/webhook/helius?secret=YOUR_SECRET`
   - **Transaction Types**: Select relevant types:
     - `SWAP`
     - `CREATE_POOL` (if available)
     - Or use "Enhanced" transactions
   - **Account Addresses**: Add DEX program addresses (optional, for filtering):
     - Raydium V4: `675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8`
     - Pump.fun: `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`
     - Meteora DLMM: `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo`

### 5. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Helius
HELIUS_API_KEY=your-helius-api-key
HELIUS_WEBHOOK_SECRET=your-chosen-secret

# Telegram
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id

# Server
PORT=3000
```

### 6. Run Locally

```bash
# Start everything (server + workers + bot)
npm run dev

# Or run components separately:
npm run server   # Just the webhook server
npm run enrich   # Just the enrichment worker
npm run score    # Just the scoring worker
npm run bot      # Just the Telegram bot
```

### 7. Test with Sample Webhook

In a new terminal:

```bash
npm run test:webhook
```

Or manually with curl:

```bash
curl -X POST http://localhost:3000/webhook/helius \
  -H "Content-Type: application/json" \
  -H "Authorization: your-webhook-secret" \
  -d '[{
    "signature": "test123",
    "timestamp": 1704067200,
    "type": "SWAP",
    "source": "RAYDIUM",
    "feePayer": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "tokenTransfers": [{
      "mint": "TestToken111111111111111111111111111111111",
      "toUserAccount": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      "tokenAmount": 1000000
    }]
  }]'
```

## Telegram Commands

- `/start` - Welcome message
- `/help` - Command help
- `/status <mint>` - Get token status and score
- `/ignore <mint>` - Stop tracking a token
- `/watch <mint>` - Start tracking a token
- `/top` - Top 5 scored tokens (last 30 minutes)

## Scoring System

### Positive Factors (up to 100 points)

| Factor | Max Points | Thresholds |
|--------|------------|------------|
| Liquidity | 25 | $50K+=25, $20K+=18, $10K+=12, $5K+=6 |
| Unique Buyers (1m) | 20 | 20+=20, 10+=14, 5+=8, 2+=4 |
| Swaps (1m) | 15 | 40+=15, 20+=10, 10+=6, 5+=3 |
| Volume (1m) | 10 | $50K+=10, $20K+=7, $10K+=4, $5K+=2 |
| Holder Count | 10 | 200+=10, 100+=7, 50+=4, 20+=2 |
| Unique Buyers (5m) | 10 | 50+=10, 30+=7, 15+=4, 5+=2 |
| Buy Pressure | 10 | 70%+=10, 60%+=7, 50%+=4, 40%+=2 |

### Penalties

| Factor | Max Penalty | Thresholds |
|--------|-------------|------------|
| Top 10 Concentration | -25 | >80%=-25, >70%=-18, >60%=-10, >50%=-5 |
| Top 1 Concentration | -15 | >50%=-15, >30%=-10, >20%=-5 |
| Authority Present | -20 | Both=-20, Mint=-10, Freeze=-10 |

### Alert Thresholds

- Score >= 70 (no hard flags): Alert sent
- Score >= 80 (even with flags): Alert sent
- Score change >= 10: Update sent

## Database Schema

See `src/db/schema.sql` for complete schema. Key tables:

- `tokens` - Discovered tokens with metadata
- `pools` - DEX pool information
- `swaps` - Individual swap transactions
- `holder_snapshots` - Holder distribution over time
- `token_metrics` - Rolling metrics snapshots
- `scores` - Computed scores with reasons
- `alerts` - Telegram alert tracking
- `raw_events` - Raw webhook payloads

## Deployment

### Render

1. Create a new Web Service
2. Connect your repo
3. Set environment variables
4. Set start command: `npm run dev`

### Fly.io

```bash
fly launch
fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ...
fly deploy
```

### VPS (with PM2)

```bash
npm install -g pm2
pm2 start src/index.js --name memecoin-machine
pm2 save
```

## Project Structure

```
src/
├── server.js           # Webhook receiver (Fastify)
├── helius.js           # Webhook parsing & Helius API
├── supabase.js         # Database operations
├── index.js            # Main entry point
├── db/
│   └── schema.sql      # Database schema
├── workers/
│   ├── enrich_worker.js  # Token enrichment
│   └── score_worker.js   # Score computation
├── scoring/
│   ├── score.js        # Scoring function
│   └── rules.js        # Thresholds & rules
├── telegram/
│   ├── bot.js          # Telegram bot
│   └── format.js       # Message formatting
└── utils/
    ├── logger.js       # Structured logging
    ├── time.js         # Time utilities
    └── dedupe.js       # Deduplication cache
```

## Configuration Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUPABASE_URL` | Yes | - | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | - | Supabase service role key |
| `HELIUS_API_KEY` | Recommended | - | Helius API key for enrichment |
| `HELIUS_WEBHOOK_SECRET` | Recommended | - | Webhook validation secret |
| `TELEGRAM_BOT_TOKEN` | Recommended | - | Telegram bot token |
| `TELEGRAM_CHAT_ID` | Recommended | - | Chat ID for alerts |
| `PORT` | No | 3000 | Server port |
| `HOST` | No | 0.0.0.0 | Server host |
| `ALERT_SCORE_THRESHOLD` | No | 70 | Min score for alerts |
| `ALERT_SCORE_THRESHOLD_WITH_FLAGS` | No | 80 | Min score with risk flags |
| `SCORE_CHANGE_ALERT_THRESHOLD` | No | 10 | Score change for update |
| `ENRICH_INTERVAL_MS` | No | 15000 | Enrichment interval |
| `ENRICH_BATCH_SIZE` | No | 10 | Tokens to enrich per batch |
| `SCORE_INTERVAL_MS` | No | 10000 | Scoring interval |
| `LOG_LEVEL` | No | info | Log level (debug/info/warn/error) |
| `ENABLE_TELEGRAM_ALERTS` | No | true | Enable/disable alerts |

## Limitations

- **No Auto-Trading**: This system is detection-only. No wallet keys, no trading.
- **No Redis**: Uses PostgreSQL for all state. May need optimization at scale.
- **Rate Limits**: Helius free tier has limits. Upgrade for high-volume detection.
- **Holder Data**: Limited to top 20 holders from Helius API.

## Security Notes

- Never commit `.env` file
- Use service role key only on server (not in browser)
- Validate webhook secret on all requests
- No private keys are stored or used

## License

MIT
