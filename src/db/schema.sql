-- Solana Meme-Coin Machine Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension (usually enabled by default in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. TOKENS TABLE
-- Core table for tracking discovered tokens
-- ============================================
CREATE TABLE IF NOT EXISTS tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mint TEXT UNIQUE NOT NULL,
    name TEXT,
    symbol TEXT,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ignored', 'dead', 'scam')),
    last_enriched_at TIMESTAMPTZ,
    mint_authority TEXT,
    freeze_authority TEXT,
    decimals INTEGER,
    supply NUMERIC,
    meta JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 2. POOLS TABLE
-- DEX pool information for tokens
-- ============================================
CREATE TABLE IF NOT EXISTS pools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_mint TEXT NOT NULL REFERENCES tokens(mint) ON DELETE CASCADE,
    pool_address TEXT UNIQUE,
    dex TEXT NOT NULL DEFAULT 'unknown',
    base_mint TEXT,
    quote_mint TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    liquidity_usd NUMERIC,
    liquidity_sol NUMERIC,
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    meta JSONB DEFAULT '{}'::jsonb
);

-- ============================================
-- 3. SWAPS TABLE
-- Individual swap transactions
-- ============================================
CREATE TABLE IF NOT EXISTS swaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_mint TEXT NOT NULL REFERENCES tokens(mint) ON DELETE CASCADE,
    signature TEXT UNIQUE NOT NULL,
    ts TIMESTAMPTZ NOT NULL,
    side TEXT CHECK (side IN ('buy', 'sell', 'unknown')),
    amount_usd NUMERIC,
    amount_token NUMERIC,
    amount_sol NUMERIC,
    buyer TEXT,
    seller TEXT,
    pool_address TEXT,
    meta JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 4. HOLDER_SNAPSHOTS TABLE
-- Point-in-time holder distribution data
-- ============================================
CREATE TABLE IF NOT EXISTS holder_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_mint TEXT NOT NULL REFERENCES tokens(mint) ON DELETE CASCADE,
    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    holder_count INTEGER,
    top1_pct NUMERIC,
    top5_pct NUMERIC,
    top10_pct NUMERIC,
    top20_pct NUMERIC,
    meta JSONB DEFAULT '{}'::jsonb
);

-- ============================================
-- 5. TOKEN_METRICS TABLE
-- Rolling metrics snapshots for scoring
-- ============================================
CREATE TABLE IF NOT EXISTS token_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_mint TEXT NOT NULL REFERENCES tokens(mint) ON DELETE CASCADE,
    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    swaps_1m INTEGER DEFAULT 0,
    swaps_5m INTEGER DEFAULT 0,
    swaps_15m INTEGER DEFAULT 0,
    unique_buyers_1m INTEGER DEFAULT 0,
    unique_buyers_5m INTEGER DEFAULT 0,
    unique_buyers_15m INTEGER DEFAULT 0,
    unique_sellers_1m INTEGER DEFAULT 0,
    unique_sellers_5m INTEGER DEFAULT 0,
    volume_usd_1m NUMERIC DEFAULT 0,
    volume_usd_5m NUMERIC DEFAULT 0,
    volume_usd_15m NUMERIC DEFAULT 0,
    buy_volume_usd_1m NUMERIC DEFAULT 0,
    sell_volume_usd_1m NUMERIC DEFAULT 0,
    price_change_5m NUMERIC,
    liquidity_usd NUMERIC,
    liquidity_sol NUMERIC,
    holder_count INTEGER,
    meta JSONB DEFAULT '{}'::jsonb
);

-- ============================================
-- 6. SCORES TABLE
-- Computed scores with reasoning
-- ============================================
CREATE TABLE IF NOT EXISTS scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_mint TEXT NOT NULL REFERENCES tokens(mint) ON DELETE CASCADE,
    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
    reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
    risk_flags JSONB DEFAULT '[]'::jsonb,
    components JSONB DEFAULT '{}'::jsonb,
    meta JSONB DEFAULT '{}'::jsonb
);

-- ============================================
-- 7. ALERTS TABLE
-- Telegram alert tracking
-- ============================================
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_mint TEXT UNIQUE NOT NULL REFERENCES tokens(mint) ON DELETE CASCADE,
    last_score INTEGER,
    last_sent_at TIMESTAMPTZ,
    telegram_message_id TEXT,
    telegram_chat_id TEXT,
    alert_count INTEGER DEFAULT 0,
    last_risk_flags JSONB DEFAULT '[]'::jsonb,
    meta JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 8. RAW_EVENTS TABLE
-- Store raw webhook payloads for debugging
-- ============================================
CREATE TABLE IF NOT EXISTS raw_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT,
    signature TEXT,
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Tokens indexes
CREATE INDEX IF NOT EXISTS idx_tokens_status_first_seen ON tokens(status, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_last_enriched ON tokens(last_enriched_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_tokens_mint ON tokens(mint);

-- Pools indexes
CREATE INDEX IF NOT EXISTS idx_pools_token_mint ON pools(token_mint);
CREATE INDEX IF NOT EXISTS idx_pools_dex ON pools(dex);

-- Swaps indexes
CREATE INDEX IF NOT EXISTS idx_swaps_token_mint_ts ON swaps(token_mint, ts DESC);
CREATE INDEX IF NOT EXISTS idx_swaps_ts ON swaps(ts DESC);
CREATE INDEX IF NOT EXISTS idx_swaps_signature ON swaps(signature);
CREATE INDEX IF NOT EXISTS idx_swaps_buyer ON swaps(buyer) WHERE buyer IS NOT NULL;

-- Holder snapshots indexes
CREATE INDEX IF NOT EXISTS idx_holder_snapshots_token_mint_ts ON holder_snapshots(token_mint, ts DESC);

-- Token metrics indexes
CREATE INDEX IF NOT EXISTS idx_token_metrics_token_mint_ts ON token_metrics(token_mint, ts DESC);

-- Scores indexes
CREATE INDEX IF NOT EXISTS idx_scores_token_mint_ts ON scores(token_mint, ts DESC);
CREATE INDEX IF NOT EXISTS idx_scores_score ON scores(score DESC) WHERE score >= 70;

-- Alerts indexes
CREATE INDEX IF NOT EXISTS idx_alerts_token_mint ON alerts(token_mint);
CREATE INDEX IF NOT EXISTS idx_alerts_last_sent ON alerts(last_sent_at DESC);

-- Raw events indexes
CREATE INDEX IF NOT EXISTS idx_raw_events_processed ON raw_events(processed) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_raw_events_created ON raw_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_events_signature ON raw_events(signature) WHERE signature IS NOT NULL;

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_tokens_updated_at ON tokens;
CREATE TRIGGER update_tokens_updated_at
    BEFORE UPDATE ON tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_alerts_updated_at ON alerts;
CREATE TRIGGER update_alerts_updated_at
    BEFORE UPDATE ON alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- USEFUL VIEWS
-- ============================================

-- View for latest metrics per token
CREATE OR REPLACE VIEW latest_token_metrics AS
SELECT DISTINCT ON (token_mint) *
FROM token_metrics
ORDER BY token_mint, ts DESC;

-- View for latest scores per token
CREATE OR REPLACE VIEW latest_scores AS
SELECT DISTINCT ON (token_mint) *
FROM scores
ORDER BY token_mint, ts DESC;

-- View for active tokens with their latest score
CREATE OR REPLACE VIEW active_tokens_scored AS
SELECT
    t.*,
    ls.score,
    ls.reasons,
    ls.risk_flags,
    ls.ts as score_ts
FROM tokens t
LEFT JOIN latest_scores ls ON t.mint = ls.token_mint
WHERE t.status = 'active';

-- ============================================
-- CLEANUP FUNCTION (call periodically)
-- ============================================

CREATE OR REPLACE FUNCTION cleanup_old_data(days_to_keep INTEGER DEFAULT 7)
RETURNS void AS $$
BEGIN
    -- Delete old raw events
    DELETE FROM raw_events WHERE created_at < NOW() - (days_to_keep || ' days')::interval;

    -- Delete old swaps (keep more recent for active tokens)
    DELETE FROM swaps
    WHERE ts < NOW() - (days_to_keep || ' days')::interval
    AND token_mint IN (SELECT mint FROM tokens WHERE status != 'active');

    -- Delete old metrics snapshots (keep latest per token)
    DELETE FROM token_metrics tm
    WHERE ts < NOW() - (days_to_keep || ' days')::interval
    AND EXISTS (
        SELECT 1 FROM token_metrics tm2
        WHERE tm2.token_mint = tm.token_mint
        AND tm2.ts > tm.ts
    );

    -- Delete old holder snapshots
    DELETE FROM holder_snapshots hs
    WHERE ts < NOW() - (days_to_keep || ' days')::interval
    AND EXISTS (
        SELECT 1 FROM holder_snapshots hs2
        WHERE hs2.token_mint = hs.token_mint
        AND hs2.ts > hs.ts
    );

    -- Delete old scores (keep latest per token)
    DELETE FROM scores s
    WHERE ts < NOW() - (days_to_keep || ' days')::interval
    AND EXISTS (
        SELECT 1 FROM scores s2
        WHERE s2.token_mint = s.token_mint
        AND s2.ts > s.ts
    );
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (adjust as needed)
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
