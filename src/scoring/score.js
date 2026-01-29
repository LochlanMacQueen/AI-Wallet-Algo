/**
 * Token scoring function
 * Pure function that computes a deterministic score from token state
 */

import {
  LIQUIDITY_THRESHOLDS,
  UNIQUE_BUYERS_1M_THRESHOLDS,
  SWAPS_1M_THRESHOLDS,
  VOLUME_1M_THRESHOLDS,
  HOLDER_COUNT_THRESHOLDS,
  UNIQUE_BUYERS_5M_THRESHOLDS,
  BUY_PRESSURE_THRESHOLDS,
  TOP10_CONCENTRATION_PENALTIES,
  TOP1_CONCENTRATION_PENALTIES,
  AUTHORITY_PENALTIES,
  RISK_FLAGS,
  MAX_POINTS,
} from './rules.js';

/**
 * Score a token based on its current state
 *
 * @param {Object} tokenState - Token state object
 * @param {Object} tokenState.token - Token record from DB
 * @param {Object} tokenState.metrics - Latest token_metrics record
 * @param {Object} tokenState.holders - Latest holder_snapshot record
 * @param {Object} tokenState.pool - Pool record (optional)
 * @returns {Object} { score: number, reasons: string[], risk_flags: string[], components: Object }
 */
export function score(tokenState) {
  const { token, metrics, holders, pool } = tokenState;

  const components = {};
  const reasons = [];
  const riskFlags = [];

  let totalScore = 0;

  // ============================================
  // POSITIVE SCORING
  // ============================================

  // 1. Liquidity Score (0-25)
  const liquidityUsd = metrics?.liquidity_usd || pool?.liquidity_usd || 0;
  const liquidityResult = scoreByThreshold(liquidityUsd, LIQUIDITY_THRESHOLDS);
  components.liquidity = {
    value: liquidityUsd,
    points: liquidityResult.points,
    maxPoints: MAX_POINTS.LIQUIDITY,
    reason: liquidityResult.reason,
  };
  totalScore += liquidityResult.points;
  reasons.push(liquidityResult.reason);

  // 2. Unique Buyers 1m Score (0-20)
  const uniqueBuyers1m = metrics?.unique_buyers_1m || 0;
  const buyers1mResult = scoreByThreshold(uniqueBuyers1m, UNIQUE_BUYERS_1M_THRESHOLDS);
  components.unique_buyers_1m = {
    value: uniqueBuyers1m,
    points: buyers1mResult.points,
    maxPoints: MAX_POINTS.UNIQUE_BUYERS_1M,
    reason: buyers1mResult.reason,
  };
  totalScore += buyers1mResult.points;
  reasons.push(buyers1mResult.reason);

  // 3. Swaps 1m Score (0-15)
  const swaps1m = metrics?.swaps_1m || 0;
  const swaps1mResult = scoreByThreshold(swaps1m, SWAPS_1M_THRESHOLDS);
  components.swaps_1m = {
    value: swaps1m,
    points: swaps1mResult.points,
    maxPoints: MAX_POINTS.SWAPS_1M,
    reason: swaps1mResult.reason,
  };
  totalScore += swaps1mResult.points;
  reasons.push(swaps1mResult.reason);

  // 4. Volume 1m Score (0-10)
  const volume1m = metrics?.volume_usd_1m || 0;
  const volume1mResult = scoreByThreshold(volume1m, VOLUME_1M_THRESHOLDS);
  components.volume_1m = {
    value: volume1m,
    points: volume1mResult.points,
    maxPoints: MAX_POINTS.VOLUME_1M,
    reason: volume1mResult.reason,
  };
  totalScore += volume1mResult.points;
  reasons.push(volume1mResult.reason);

  // 5. Holder Count Score (0-10)
  const holderCount = holders?.holder_count || metrics?.holder_count || 0;
  const holderResult = scoreByThreshold(holderCount, HOLDER_COUNT_THRESHOLDS);
  components.holder_count = {
    value: holderCount,
    points: holderResult.points,
    maxPoints: MAX_POINTS.HOLDER_COUNT,
    reason: holderResult.reason,
  };
  totalScore += holderResult.points;
  reasons.push(holderResult.reason);

  // 6. Unique Buyers 5m Score (0-10)
  const uniqueBuyers5m = metrics?.unique_buyers_5m || 0;
  const buyers5mResult = scoreByThreshold(uniqueBuyers5m, UNIQUE_BUYERS_5M_THRESHOLDS);
  components.unique_buyers_5m = {
    value: uniqueBuyers5m,
    points: buyers5mResult.points,
    maxPoints: MAX_POINTS.UNIQUE_BUYERS_5M,
    reason: buyers5mResult.reason,
  };
  totalScore += buyers5mResult.points;
  reasons.push(buyers5mResult.reason);

  // 7. Buy Pressure Score (0-10)
  const buyVol = metrics?.buy_volume_usd_1m || 0;
  const sellVol = metrics?.sell_volume_usd_1m || 0;
  const totalVol = buyVol + sellVol;
  const buyRatio = totalVol > 0 ? buyVol / totalVol : 0.5;
  const buyPressureResult = scoreByThreshold(buyRatio, BUY_PRESSURE_THRESHOLDS);
  components.buy_pressure = {
    value: buyRatio,
    points: buyPressureResult.points,
    maxPoints: MAX_POINTS.BUY_PRESSURE,
    reason: buyPressureResult.reason,
  };
  totalScore += buyPressureResult.points;
  reasons.push(buyPressureResult.reason);

  // ============================================
  // PENALTIES
  // ============================================

  // Top 10 Concentration Penalty
  const top10Pct = holders?.top10_pct || 0;
  if (top10Pct > 0) {
    const top10Result = penaltyByThreshold(top10Pct, TOP10_CONCENTRATION_PENALTIES);
    components.top10_concentration = {
      value: top10Pct,
      penalty: top10Result.penalty,
      reason: top10Result.reason,
    };
    totalScore += top10Result.penalty;
    if (top10Result.penalty < 0) {
      reasons.push(top10Result.reason);
    }
  }

  // Top 1 Concentration Penalty
  const top1Pct = holders?.top1_pct || 0;
  if (top1Pct > 0) {
    const top1Result = penaltyByThreshold(top1Pct, TOP1_CONCENTRATION_PENALTIES);
    components.top1_concentration = {
      value: top1Pct,
      penalty: top1Result.penalty,
      reason: top1Result.reason,
    };
    totalScore += top1Result.penalty;
    if (top1Result.penalty < 0) {
      reasons.push(top1Result.reason);
    }
  }

  // Authority Penalties
  const hasMintAuth = token?.mint_authority && token.mint_authority !== null;
  const hasFreezeAuth = token?.freeze_authority && token.freeze_authority !== null;

  if (hasMintAuth && hasFreezeAuth) {
    components.authority = {
      mintAuthority: true,
      freezeAuthority: true,
      penalty: AUTHORITY_PENALTIES.BOTH_AUTHORITIES.penalty,
      reason: AUTHORITY_PENALTIES.BOTH_AUTHORITIES.reason,
    };
    totalScore += AUTHORITY_PENALTIES.BOTH_AUTHORITIES.penalty;
    reasons.push(AUTHORITY_PENALTIES.BOTH_AUTHORITIES.reason);
    riskFlags.push(AUTHORITY_PENALTIES.BOTH_AUTHORITIES.flag);
  } else if (hasMintAuth) {
    components.authority = {
      mintAuthority: true,
      freezeAuthority: false,
      penalty: AUTHORITY_PENALTIES.MINT_AUTHORITY.penalty,
      reason: AUTHORITY_PENALTIES.MINT_AUTHORITY.reason,
    };
    totalScore += AUTHORITY_PENALTIES.MINT_AUTHORITY.penalty;
    reasons.push(AUTHORITY_PENALTIES.MINT_AUTHORITY.reason);
    riskFlags.push(AUTHORITY_PENALTIES.MINT_AUTHORITY.flag);
  } else if (hasFreezeAuth) {
    components.authority = {
      mintAuthority: false,
      freezeAuthority: true,
      penalty: AUTHORITY_PENALTIES.FREEZE_AUTHORITY.penalty,
      reason: AUTHORITY_PENALTIES.FREEZE_AUTHORITY.reason,
    };
    totalScore += AUTHORITY_PENALTIES.FREEZE_AUTHORITY.penalty;
    reasons.push(AUTHORITY_PENALTIES.FREEZE_AUTHORITY.reason);
    riskFlags.push(AUTHORITY_PENALTIES.FREEZE_AUTHORITY.flag);
  }

  // ============================================
  // RISK FLAGS (non-scoring)
  // ============================================

  // Low Liquidity Warning
  if (liquidityUsd < RISK_FLAGS.LOW_LIQUIDITY.threshold) {
    riskFlags.push(RISK_FLAGS.LOW_LIQUIDITY.flag);
  }

  // Very New Token Warning
  if (token?.first_seen_at) {
    const ageMinutes = (Date.now() - new Date(token.first_seen_at).getTime()) / 60000;
    if (ageMinutes < RISK_FLAGS.NEW_TOKEN.thresholdMinutes) {
      riskFlags.push(RISK_FLAGS.NEW_TOKEN.flag);
    }
  }

  // Low Holder Count Warning
  if (holderCount < RISK_FLAGS.LOW_HOLDERS.threshold) {
    riskFlags.push(RISK_FLAGS.LOW_HOLDERS.flag);
  }

  // No Recent Volume Warning
  if (volume1m <= RISK_FLAGS.NO_VOLUME.threshold) {
    riskFlags.push(RISK_FLAGS.NO_VOLUME.flag);
  }

  // Whale Concentration Warning (top1 holder has > 40%)
  if (top1Pct > RISK_FLAGS.WHALE_CONCENTRATION.threshold) {
    riskFlags.push(RISK_FLAGS.WHALE_CONCENTRATION.flag);
  }

  // Rapid Price Drop Warning
  const priceChange5m = metrics?.price_change_5m || 0;
  if (priceChange5m < RISK_FLAGS.RAPID_PRICE_DROP.threshold) {
    riskFlags.push(RISK_FLAGS.RAPID_PRICE_DROP.flag);
  }

  // ============================================
  // FINAL SCORE
  // ============================================

  // Clamp to 0-100
  const finalScore = Math.max(0, Math.min(100, Math.round(totalScore)));

  return {
    score: finalScore,
    reasons,
    risk_flags: riskFlags,
    components,
  };
}

/**
 * Score by threshold (for positive scoring)
 */
function scoreByThreshold(value, thresholds) {
  const orderedThresholds = Object.values(thresholds).sort((a, b) => b.min - a.min);

  for (const threshold of orderedThresholds) {
    if (value >= threshold.min) {
      return {
        points: threshold.points,
        reason: threshold.reason,
      };
    }
  }

  // Default to lowest tier
  const lowest = orderedThresholds[orderedThresholds.length - 1];
  return {
    points: lowest.points,
    reason: lowest.reason,
  };
}

/**
 * Penalty by threshold (for negative scoring)
 */
function penaltyByThreshold(value, thresholds) {
  const orderedThresholds = Object.values(thresholds).sort((a, b) => b.min - a.min);

  for (const threshold of orderedThresholds) {
    if (value >= threshold.min) {
      return {
        penalty: threshold.penalty,
        reason: threshold.reason,
      };
    }
  }

  // Default to no penalty
  return {
    penalty: 0,
    reason: 'HEALTHY',
  };
}

/**
 * Check if a score qualifies for alerting
 */
export function shouldAlert(scoreResult, previousScore = null, previousRiskFlags = []) {
  const { score: currentScore, risk_flags: currentFlags } = scoreResult;
  const hasHardFlags = currentFlags.some((f) =>
    ['FULL_AUTHORITY_RISK', 'MINT_AUTHORITY_RISK', 'FREEZE_AUTHORITY_RISK'].includes(f)
  );

  const SCORE_THRESHOLD = parseInt(process.env.ALERT_SCORE_THRESHOLD || '70', 10);
  const SCORE_THRESHOLD_WITH_FLAGS = parseInt(process.env.ALERT_SCORE_THRESHOLD_WITH_FLAGS || '80', 10);
  const SCORE_CHANGE_THRESHOLD = parseInt(process.env.SCORE_CHANGE_ALERT_THRESHOLD || '10', 10);

  // First time alert conditions
  if (previousScore === null) {
    // High score without hard flags
    if (currentScore >= SCORE_THRESHOLD && !hasHardFlags) {
      return { shouldSend: true, reason: 'NEW_HIGH_SCORE' };
    }
    // Very high score even with flags
    if (currentScore >= SCORE_THRESHOLD_WITH_FLAGS) {
      return { shouldSend: true, reason: 'NEW_VERY_HIGH_SCORE' };
    }
    return { shouldSend: false, reason: 'SCORE_BELOW_THRESHOLD' };
  }

  // Update alert conditions
  const scoreDiff = Math.abs(currentScore - previousScore);
  const flagsChanged =
    JSON.stringify([...currentFlags].sort()) !== JSON.stringify([...previousRiskFlags].sort());

  // Score changed significantly
  if (scoreDiff >= SCORE_CHANGE_THRESHOLD) {
    return { shouldSend: true, reason: 'SCORE_CHANGE_SIGNIFICANT' };
  }

  // Risk flags changed
  if (flagsChanged && currentScore >= SCORE_THRESHOLD) {
    return { shouldSend: true, reason: 'FLAGS_CHANGED' };
  }

  return { shouldSend: false, reason: 'NO_SIGNIFICANT_CHANGE' };
}

export default score;
