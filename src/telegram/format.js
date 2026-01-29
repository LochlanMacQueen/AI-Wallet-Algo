/**
 * Telegram message formatting utilities
 */

import { getScoreLabel } from '../scoring/rules.js';
import { formatRelative } from '../utils/time.js';

/**
 * Format a number with K/M suffix
 */
function formatNumber(num, decimals = 1) {
  if (num === null || num === undefined) return 'N/A';
  if (num >= 1000000) return `${(num / 1000000).toFixed(decimals)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(decimals)}K`;
  return num.toFixed(decimals);
}

/**
 * Format USD amount
 */
function formatUsd(amount) {
  if (amount === null || amount === undefined) return 'N/A';
  return `$${formatNumber(amount)}`;
}

/**
 * Format percentage
 */
function formatPct(pct) {
  if (pct === null || pct === undefined) return 'N/A';
  return `${pct.toFixed(1)}%`;
}

/**
 * Get score emoji based on score value
 */
function getScoreEmoji(score) {
  if (score >= 90) return '🔥';
  if (score >= 80) return '🚀';
  if (score >= 70) return '✅';
  if (score >= 60) return '📈';
  if (score >= 50) return '⚠️';
  return '❌';
}

/**
 * Get risk flag emoji and description
 */
function formatRiskFlag(flag) {
  const flagMap = {
    MINT_AUTHORITY_RISK: '🔴 Mint Authority Present',
    FREEZE_AUTHORITY_RISK: '🔴 Freeze Authority Present',
    FULL_AUTHORITY_RISK: '🔴 Full Authority Risk',
    LOW_LIQUIDITY_WARNING: '⚠️ Low Liquidity',
    VERY_NEW_TOKEN: '⚠️ Very New Token',
    LOW_HOLDER_COUNT: '⚠️ Low Holder Count',
    NO_RECENT_VOLUME: '⚠️ No Recent Volume',
    WHALE_CONCENTRATION: '🐋 Whale Concentration',
    RAPID_PRICE_DROP: '📉 Rapid Price Drop',
  };
  return flagMap[flag] || flag;
}

/**
 * Format a new token alert message
 */
export function formatNewTokenAlert(token, scoreResult, metrics, holders) {
  const { score, risk_flags } = scoreResult;
  const scoreLabel = getScoreLabel(score);
  const emoji = getScoreEmoji(score);

  const lines = [
    `${emoji} *NEW ALERT* ${emoji}`,
    '',
    `*Token:* \`${token.symbol || 'Unknown'}\``,
    `*Name:* ${escapeMarkdown(token.name || 'Unknown')}`,
    `*Mint:* \`${token.mint}\``,
    '',
    `*SCORE: ${score}/100* (${scoreLabel})`,
    '',
    '📊 *Metrics (1m):*',
    `• Swaps: ${metrics?.swaps_1m || 0}`,
    `• Unique Buyers: ${metrics?.unique_buyers_1m || 0}`,
    `• Volume: ${formatUsd(metrics?.volume_usd_1m)}`,
    '',
    '💰 *Liquidity:*',
    `• USD: ${formatUsd(metrics?.liquidity_usd)}`,
    '',
    '👥 *Holders:*',
    `• Count: ${holders?.holder_count || 'N/A'}`,
    `• Top 10%: ${formatPct(holders?.top10_pct)}`,
  ];

  // Add risk flags if present
  if (risk_flags && risk_flags.length > 0) {
    lines.push('');
    lines.push('⚠️ *Risk Flags:*');
    for (const flag of risk_flags) {
      lines.push(`• ${formatRiskFlag(flag)}`);
    }
  }

  // Add links
  lines.push('');
  lines.push('🔗 *Links:*');
  lines.push(`• [Birdeye](https://birdeye.so/token/${token.mint}?chain=solana)`);
  lines.push(`• [DexScreener](https://dexscreener.com/solana/${token.mint})`);
  lines.push(`• [Solscan](https://solscan.io/token/${token.mint})`);

  // Add timestamp
  lines.push('');
  lines.push(`_First seen: ${formatRelative(token.first_seen_at)}_`);

  return lines.join('\n');
}

/**
 * Format an update alert message
 */
export function formatUpdateAlert(token, scoreResult, previousScore, metrics, holders) {
  const { score, risk_flags } = scoreResult;
  const scoreLabel = getScoreLabel(score);
  const emoji = getScoreEmoji(score);
  const scoreDiff = score - previousScore;
  const diffEmoji = scoreDiff > 0 ? '📈' : '📉';
  const diffText = scoreDiff > 0 ? `+${scoreDiff}` : `${scoreDiff}`;

  const lines = [
    `${emoji} *SCORE UPDATE* ${diffEmoji}`,
    '',
    `*Token:* \`${token.symbol || 'Unknown'}\``,
    `*Mint:* \`${token.mint}\``,
    '',
    `*SCORE: ${score}/100* (${scoreLabel})`,
    `*Change:* ${diffText} (was ${previousScore})`,
    '',
    '📊 *Current Metrics (1m):*',
    `• Swaps: ${metrics?.swaps_1m || 0}`,
    `• Unique Buyers: ${metrics?.unique_buyers_1m || 0}`,
    `• Volume: ${formatUsd(metrics?.volume_usd_1m)}`,
    `• Liquidity: ${formatUsd(metrics?.liquidity_usd)}`,
  ];

  // Add risk flags if present
  if (risk_flags && risk_flags.length > 0) {
    lines.push('');
    lines.push('⚠️ *Risk Flags:*');
    for (const flag of risk_flags) {
      lines.push(`• ${formatRiskFlag(flag)}`);
    }
  }

  lines.push('');
  lines.push(`_Updated: ${new Date().toLocaleTimeString()}_`);

  return lines.join('\n');
}

/**
 * Format token status response
 */
export function formatTokenStatus(token, scoreResult, metrics, holders, pool) {
  const { score, reasons, risk_flags } = scoreResult || { score: 0, reasons: [], risk_flags: [] };
  const scoreLabel = getScoreLabel(score);
  const emoji = getScoreEmoji(score);

  const lines = [
    `${emoji} *Token Status*`,
    '',
    `*Token:* \`${token.symbol || 'Unknown'}\``,
    `*Name:* ${escapeMarkdown(token.name || 'Unknown')}`,
    `*Mint:* \`${token.mint}\``,
    `*Status:* ${token.status}`,
    '',
    `*SCORE: ${score}/100* (${scoreLabel})`,
    '',
    '📊 *Metrics:*',
    `• Swaps 1m/5m: ${metrics?.swaps_1m || 0}/${metrics?.swaps_5m || 0}`,
    `• Buyers 1m/5m: ${metrics?.unique_buyers_1m || 0}/${metrics?.unique_buyers_5m || 0}`,
    `• Volume 1m/5m: ${formatUsd(metrics?.volume_usd_1m)}/${formatUsd(metrics?.volume_usd_5m)}`,
    '',
    '💰 *Liquidity:*',
    `• USD: ${formatUsd(metrics?.liquidity_usd || pool?.liquidity_usd)}`,
    `• SOL: ${metrics?.liquidity_sol || pool?.liquidity_sol || 'N/A'}`,
  ];

  if (pool) {
    lines.push(`• DEX: ${pool.dex || 'Unknown'}`);
  }

  lines.push('');
  lines.push('👥 *Holders:*');
  lines.push(`• Count: ${holders?.holder_count || 'N/A'}`);
  lines.push(`• Top 1%: ${formatPct(holders?.top1_pct)}`);
  lines.push(`• Top 10%: ${formatPct(holders?.top10_pct)}`);

  // Authorities
  lines.push('');
  lines.push('🔐 *Authorities:*');
  lines.push(`• Mint: ${token.mint_authority ? '⚠️ Present' : '✅ Revoked'}`);
  lines.push(`• Freeze: ${token.freeze_authority ? '⚠️ Present' : '✅ Revoked'}`);

  // Risk flags
  if (risk_flags && risk_flags.length > 0) {
    lines.push('');
    lines.push('⚠️ *Risk Flags:*');
    for (const flag of risk_flags) {
      lines.push(`• ${formatRiskFlag(flag)}`);
    }
  }

  // Score breakdown
  if (reasons && reasons.length > 0) {
    lines.push('');
    lines.push('📋 *Score Breakdown:*');
    for (const reason of reasons.slice(0, 8)) {
      lines.push(`• ${reason}`);
    }
  }

  // Links
  lines.push('');
  lines.push('🔗 *Links:*');
  lines.push(`• [Birdeye](https://birdeye.so/token/${token.mint}?chain=solana)`);
  lines.push(`• [DexScreener](https://dexscreener.com/solana/${token.mint})`);

  // Timestamps
  lines.push('');
  lines.push(`_First seen: ${formatRelative(token.first_seen_at)}_`);
  lines.push(`_Last enriched: ${formatRelative(token.last_enriched_at)}_`);

  return lines.join('\n');
}

/**
 * Format top tokens list
 */
export function formatTopTokens(tokens) {
  if (!tokens || tokens.length === 0) {
    return '📊 *Top Tokens*\n\nNo tokens found in the last 30 minutes.';
  }

  const lines = ['📊 *Top Scored Tokens (30m)*', ''];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const emoji = getScoreEmoji(t.score);
    const symbol = t.tokens?.symbol || 'Unknown';
    lines.push(`${i + 1}. ${emoji} *${t.score}* - \`${symbol}\``);
    lines.push(`   \`${t.token_mint}\``);
    if (t.risk_flags && t.risk_flags.length > 0) {
      lines.push(`   ⚠️ ${t.risk_flags.length} risk flag(s)`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format error message
 */
export function formatError(message) {
  return `❌ *Error*\n\n${escapeMarkdown(message)}`;
}

/**
 * Format success message
 */
export function formatSuccess(message) {
  return `✅ ${escapeMarkdown(message)}`;
}

/**
 * Escape special Markdown characters
 */
function escapeMarkdown(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

export { formatNumber, formatUsd, formatPct, getScoreEmoji, escapeMarkdown };
