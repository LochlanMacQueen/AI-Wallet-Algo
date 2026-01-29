/**
 * Scoring rules and thresholds
 * All thresholds are configurable via environment variables
 */

// ============================================
// LIQUIDITY SCORING (0-25 points)
// ============================================
export const LIQUIDITY_THRESHOLDS = {
  EXCELLENT: { min: 50000, points: 25, reason: 'LIQ_50K_PLUS' },
  GOOD: { min: 20000, points: 18, reason: 'LIQ_20K_PLUS' },
  MODERATE: { min: 10000, points: 12, reason: 'LIQ_10K_PLUS' },
  LOW: { min: 5000, points: 6, reason: 'LIQ_5K_PLUS' },
  VERY_LOW: { min: 0, points: 0, reason: 'LIQ_BELOW_5K' },
};

// ============================================
// UNIQUE BUYERS 1M SCORING (0-20 points)
// ============================================
export const UNIQUE_BUYERS_1M_THRESHOLDS = {
  EXCELLENT: { min: 20, points: 20, reason: 'BUYERS_1M_20_PLUS' },
  GOOD: { min: 10, points: 14, reason: 'BUYERS_1M_10_PLUS' },
  MODERATE: { min: 5, points: 8, reason: 'BUYERS_1M_5_PLUS' },
  LOW: { min: 2, points: 4, reason: 'BUYERS_1M_2_PLUS' },
  VERY_LOW: { min: 0, points: 0, reason: 'BUYERS_1M_BELOW_2' },
};

// ============================================
// SWAPS 1M SCORING (0-15 points)
// ============================================
export const SWAPS_1M_THRESHOLDS = {
  EXCELLENT: { min: 40, points: 15, reason: 'SWAPS_1M_40_PLUS' },
  GOOD: { min: 20, points: 10, reason: 'SWAPS_1M_20_PLUS' },
  MODERATE: { min: 10, points: 6, reason: 'SWAPS_1M_10_PLUS' },
  LOW: { min: 5, points: 3, reason: 'SWAPS_1M_5_PLUS' },
  VERY_LOW: { min: 0, points: 0, reason: 'SWAPS_1M_BELOW_5' },
};

// ============================================
// VOLUME 1M SCORING (0-10 points)
// ============================================
export const VOLUME_1M_THRESHOLDS = {
  EXCELLENT: { min: 50000, points: 10, reason: 'VOL_1M_50K_PLUS' },
  GOOD: { min: 20000, points: 7, reason: 'VOL_1M_20K_PLUS' },
  MODERATE: { min: 10000, points: 4, reason: 'VOL_1M_10K_PLUS' },
  LOW: { min: 5000, points: 2, reason: 'VOL_1M_5K_PLUS' },
  VERY_LOW: { min: 0, points: 0, reason: 'VOL_1M_BELOW_5K' },
};

// ============================================
// HOLDER COUNT SCORING (0-10 points)
// ============================================
export const HOLDER_COUNT_THRESHOLDS = {
  EXCELLENT: { min: 200, points: 10, reason: 'HOLDERS_200_PLUS' },
  GOOD: { min: 100, points: 7, reason: 'HOLDERS_100_PLUS' },
  MODERATE: { min: 50, points: 4, reason: 'HOLDERS_50_PLUS' },
  LOW: { min: 20, points: 2, reason: 'HOLDERS_20_PLUS' },
  VERY_LOW: { min: 0, points: 0, reason: 'HOLDERS_BELOW_20' },
};

// ============================================
// UNIQUE BUYERS 5M BONUS (0-10 points)
// ============================================
export const UNIQUE_BUYERS_5M_THRESHOLDS = {
  EXCELLENT: { min: 50, points: 10, reason: 'BUYERS_5M_50_PLUS' },
  GOOD: { min: 30, points: 7, reason: 'BUYERS_5M_30_PLUS' },
  MODERATE: { min: 15, points: 4, reason: 'BUYERS_5M_15_PLUS' },
  LOW: { min: 5, points: 2, reason: 'BUYERS_5M_5_PLUS' },
  VERY_LOW: { min: 0, points: 0, reason: 'BUYERS_5M_BELOW_5' },
};

// ============================================
// BUY/SELL RATIO BONUS (0-10 points)
// Buy pressure indicates organic interest
// ============================================
export const BUY_PRESSURE_THRESHOLDS = {
  STRONG: { min: 0.7, points: 10, reason: 'BUY_PRESSURE_70_PCT' },
  GOOD: { min: 0.6, points: 7, reason: 'BUY_PRESSURE_60_PCT' },
  NEUTRAL: { min: 0.5, points: 4, reason: 'BUY_PRESSURE_50_PCT' },
  WEAK: { min: 0.4, points: 2, reason: 'BUY_PRESSURE_40_PCT' },
  SELL_PRESSURE: { min: 0, points: 0, reason: 'SELL_PRESSURE' },
};

// ============================================
// PENALTIES
// ============================================

// Top 10 Holder Concentration Penalty (0 to -25 points)
export const TOP10_CONCENTRATION_PENALTIES = {
  EXTREME: { min: 80, penalty: -25, reason: 'TOP10_PCT_80_PLUS_PENALTY' },
  HIGH: { min: 70, penalty: -18, reason: 'TOP10_PCT_70_PLUS_PENALTY' },
  MODERATE: { min: 60, penalty: -10, reason: 'TOP10_PCT_60_PLUS_PENALTY' },
  LOW: { min: 50, penalty: -5, reason: 'TOP10_PCT_50_PLUS_PENALTY' },
  HEALTHY: { min: 0, penalty: 0, reason: 'TOP10_PCT_HEALTHY' },
};

// Top 1 Holder Concentration Penalty (0 to -15 points)
export const TOP1_CONCENTRATION_PENALTIES = {
  EXTREME: { min: 50, penalty: -15, reason: 'TOP1_PCT_50_PLUS_PENALTY' },
  HIGH: { min: 30, penalty: -10, reason: 'TOP1_PCT_30_PLUS_PENALTY' },
  MODERATE: { min: 20, penalty: -5, reason: 'TOP1_PCT_20_PLUS_PENALTY' },
  LOW: { min: 0, penalty: 0, reason: 'TOP1_PCT_HEALTHY' },
};

// Authority Risk Penalty (0 to -20 points)
export const AUTHORITY_PENALTIES = {
  MINT_AUTHORITY: { penalty: -10, reason: 'MINT_AUTHORITY_PRESENT', flag: 'MINT_AUTHORITY_RISK' },
  FREEZE_AUTHORITY: { penalty: -10, reason: 'FREEZE_AUTHORITY_PRESENT', flag: 'FREEZE_AUTHORITY_RISK' },
  BOTH_AUTHORITIES: { penalty: -20, reason: 'BOTH_AUTHORITIES_PRESENT', flag: 'FULL_AUTHORITY_RISK' },
};

// ============================================
// RISK FLAGS (non-scoring warnings)
// ============================================
export const RISK_FLAGS = {
  LOW_LIQUIDITY: { threshold: 5000, flag: 'LOW_LIQUIDITY_WARNING' },
  NEW_TOKEN: { thresholdMinutes: 5, flag: 'VERY_NEW_TOKEN' },
  LOW_HOLDERS: { threshold: 10, flag: 'LOW_HOLDER_COUNT' },
  NO_VOLUME: { threshold: 0, flag: 'NO_RECENT_VOLUME' },
  WHALE_CONCENTRATION: { threshold: 40, flag: 'WHALE_CONCENTRATION' },
  RAPID_PRICE_DROP: { threshold: -30, flag: 'RAPID_PRICE_DROP' },
};

// ============================================
// ALERT THRESHOLDS
// ============================================
export const ALERT_THRESHOLDS = {
  SCORE_THRESHOLD: parseInt(process.env.ALERT_SCORE_THRESHOLD || '70', 10),
  SCORE_THRESHOLD_WITH_FLAGS: parseInt(process.env.ALERT_SCORE_THRESHOLD_WITH_FLAGS || '80', 10),
  SCORE_CHANGE_THRESHOLD: parseInt(process.env.SCORE_CHANGE_ALERT_THRESHOLD || '10', 10),
};

// ============================================
// MAXIMUM POINTS PER CATEGORY
// ============================================
export const MAX_POINTS = {
  LIQUIDITY: 25,
  UNIQUE_BUYERS_1M: 20,
  SWAPS_1M: 15,
  VOLUME_1M: 10,
  HOLDER_COUNT: 10,
  UNIQUE_BUYERS_5M: 10,
  BUY_PRESSURE: 10,
  // Total positive: 100
};

// ============================================
// SCORE INTERPRETATION
// ============================================
export const SCORE_LABELS = {
  90: 'Exceptional',
  80: 'Very Strong',
  70: 'Strong',
  60: 'Moderate',
  50: 'Weak',
  40: 'Poor',
  0: 'Very Poor',
};

/**
 * Get score label for a given score
 */
export function getScoreLabel(score) {
  for (const [threshold, label] of Object.entries(SCORE_LABELS).sort((a, b) => b[0] - a[0])) {
    if (score >= parseInt(threshold, 10)) {
      return label;
    }
  }
  return 'Very Poor';
}
