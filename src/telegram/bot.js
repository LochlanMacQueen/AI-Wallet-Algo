/**
 * Telegram bot for alerts and commands
 */

import TelegramBot from 'node-telegram-bot-api';
import { createLogger } from '../utils/logger.js';
import {
  getToken,
  updateTokenStatus,
  getLatestScore,
  getLatestTokenMetrics,
  getLatestHolderSnapshot,
  getPoolsForToken,
  getTopScoredTokens,
  getOrCreateAlert,
  updateAlert,
  getTokensToEnrich,
} from '../supabase.js';
import {
  formatNewTokenAlert,
  formatUpdateAlert,
  formatTokenStatus,
  formatTopTokens,
  formatError,
  formatSuccess,
} from './format.js';
import { score } from '../scoring/score.js';

const log = createLogger('telegram');

let bot = null;
let chatId = null;

/**
 * Initialize the Telegram bot
 */
export function initBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token) {
    log.warn('TELEGRAM_BOT_TOKEN not configured, bot disabled');
    return null;
  }

  if (!chatId) {
    log.warn('TELEGRAM_CHAT_ID not configured, alerts disabled');
  }

  try {
    bot = new TelegramBot(token, { polling: true });
    log.info('Telegram bot initialized');

    // Register command handlers
    registerCommands();

    // Handle errors
    bot.on('polling_error', (error) => {
      log.error('Telegram polling error', { error: error.message });
    });

    bot.on('error', (error) => {
      log.error('Telegram error', { error: error.message });
    });

    return bot;
  } catch (err) {
    log.error('Failed to initialize Telegram bot', err);
    return null;
  }
}

/**
 * Register bot commands
 */
function registerCommands() {
  // /start command
  bot.onText(/\/start/, async (msg) => {
    const welcomeMessage = `
🚀 *Solana Meme-Coin Machine*

I monitor new token launches and alert you when promising opportunities arise.

*Commands:*
• /status <mint> - Get token status
• /ignore <mint> - Ignore a token
• /watch <mint> - Watch a token
• /top - Top scored tokens (30m)
• /help - Show this message

_Alerts are sent automatically when tokens score >= 70_
    `;
    await sendMessage(msg.chat.id, welcomeMessage);
  });

  // /help command
  bot.onText(/\/help/, async (msg) => {
    const helpMessage = `
📚 *Commands*

*/status <mint>*
Get detailed status for a token including score, metrics, and risk flags.

*/ignore <mint>*
Stop tracking a token. It won't be enriched or scored anymore.

*/watch <mint>*
Start tracking a token again. Forces immediate enrichment.

*/top*
List the top 5 scored tokens in the last 30 minutes.

*Score Thresholds:*
• >= 70: Alert sent (no hard risk flags)
• >= 80: Alert sent (even with flags)
• Score change >= 10: Update sent
    `;
    await sendMessage(msg.chat.id, helpMessage);
  });

  // /status <mint> command
  bot.onText(/\/status(?:\s+(.+))?/, async (msg, match) => {
    const mint = match[1]?.trim();

    if (!mint) {
      await sendMessage(msg.chat.id, formatError('Please provide a mint address: /status <mint>'));
      return;
    }

    try {
      const token = await getToken(mint);

      if (!token) {
        await sendMessage(msg.chat.id, formatError(`Token not found: ${mint}`));
        return;
      }

      const [scoreData, metrics, holders, pools] = await Promise.all([
        getLatestScore(mint),
        getLatestTokenMetrics(mint),
        getLatestHolderSnapshot(mint),
        getPoolsForToken(mint),
      ]);

      const pool = pools?.[0];

      // Compute current score if no stored score
      let scoreResult = scoreData;
      if (!scoreResult) {
        scoreResult = score({ token, metrics, holders, pool });
      }

      const message = formatTokenStatus(token, scoreResult, metrics, holders, pool);
      await sendMessage(msg.chat.id, message);
    } catch (err) {
      log.error('Error handling /status command', { mint, error: err.message });
      await sendMessage(msg.chat.id, formatError(`Failed to get status: ${err.message}`));
    }
  });

  // /ignore <mint> command
  bot.onText(/\/ignore(?:\s+(.+))?/, async (msg, match) => {
    const mint = match[1]?.trim();

    if (!mint) {
      await sendMessage(msg.chat.id, formatError('Please provide a mint address: /ignore <mint>'));
      return;
    }

    try {
      const token = await getToken(mint);

      if (!token) {
        await sendMessage(msg.chat.id, formatError(`Token not found: ${mint}`));
        return;
      }

      await updateTokenStatus(mint, 'ignored');
      await sendMessage(msg.chat.id, formatSuccess(`Token ${mint} is now ignored.`));
      log.info('Token ignored via command', { mint });
    } catch (err) {
      log.error('Error handling /ignore command', { mint, error: err.message });
      await sendMessage(msg.chat.id, formatError(`Failed to ignore: ${err.message}`));
    }
  });

  // /watch <mint> command
  bot.onText(/\/watch(?:\s+(.+))?/, async (msg, match) => {
    const mint = match[1]?.trim();

    if (!mint) {
      await sendMessage(msg.chat.id, formatError('Please provide a mint address: /watch <mint>'));
      return;
    }

    try {
      let token = await getToken(mint);

      if (!token) {
        await sendMessage(
          msg.chat.id,
          formatError(`Token not found. It will be tracked when first activity is detected.`)
        );
        return;
      }

      await updateTokenStatus(mint, 'active');
      await sendMessage(
        msg.chat.id,
        formatSuccess(`Token ${mint} is now being watched. Will enrich on next cycle.`)
      );
      log.info('Token watched via command', { mint });
    } catch (err) {
      log.error('Error handling /watch command', { mint, error: err.message });
      await sendMessage(msg.chat.id, formatError(`Failed to watch: ${err.message}`));
    }
  });

  // /top command
  bot.onText(/\/top/, async (msg) => {
    try {
      const topTokens = await getTopScoredTokens(30, 5);
      const message = formatTopTokens(topTokens);
      await sendMessage(msg.chat.id, message);
    } catch (err) {
      log.error('Error handling /top command', { error: err.message });
      await sendMessage(msg.chat.id, formatError(`Failed to get top tokens: ${err.message}`));
    }
  });

  log.info('Bot commands registered');
}

/**
 * Send a message to a chat
 */
export async function sendMessage(targetChatId, text, options = {}) {
  if (!bot) {
    log.warn('Bot not initialized, cannot send message');
    return null;
  }

  try {
    const result = await bot.sendMessage(targetChatId, text, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      ...options,
    });
    return result;
  } catch (err) {
    log.error('Failed to send message', { chatId: targetChatId, error: err.message });
    return null;
  }
}

/**
 * Edit an existing message
 */
export async function editMessage(targetChatId, messageId, text, options = {}) {
  if (!bot) {
    log.warn('Bot not initialized, cannot edit message');
    return null;
  }

  try {
    const result = await bot.editMessageText(text, {
      chat_id: targetChatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      ...options,
    });
    return result;
  } catch (err) {
    // Ignore "message not modified" errors
    if (!err.message.includes('message is not modified')) {
      log.error('Failed to edit message', { chatId: targetChatId, messageId, error: err.message });
    }
    return null;
  }
}

/**
 * Send an alert for a token
 */
export async function sendTokenAlert(token, scoreResult, metrics, holders) {
  if (!chatId) {
    log.warn('TELEGRAM_CHAT_ID not configured, skipping alert');
    return;
  }

  if (process.env.ENABLE_TELEGRAM_ALERTS === 'false') {
    log.debug('Telegram alerts disabled');
    return;
  }

  try {
    // Get or create alert record
    const alert = await getOrCreateAlert(token.mint);

    const previousScore = alert.last_score;
    const previousFlags = alert.last_risk_flags || [];

    // Check if this is a new alert or update
    const isUpdate = previousScore !== null && alert.telegram_message_id;

    let message;
    let result;

    if (isUpdate) {
      // Update existing message
      message = formatUpdateAlert(token, scoreResult, previousScore, metrics, holders);

      // Try to edit, fall back to new message if it fails
      result = await editMessage(chatId, alert.telegram_message_id, message);

      if (!result) {
        // Send new message if edit fails
        message = formatNewTokenAlert(token, scoreResult, metrics, holders);
        result = await sendMessage(chatId, message);
      }
    } else {
      // Send new alert
      message = formatNewTokenAlert(token, scoreResult, metrics, holders);
      result = await sendMessage(chatId, message);
    }

    // Update alert record
    if (result) {
      await updateAlert(token.mint, {
        last_score: scoreResult.score,
        last_sent_at: new Date().toISOString(),
        telegram_message_id: String(result.message_id),
        telegram_chat_id: String(chatId),
        alert_count: (alert.alert_count || 0) + 1,
        last_risk_flags: scoreResult.risk_flags,
      });

      log.info('Alert sent', {
        mint: token.mint,
        score: scoreResult.score,
        messageId: result.message_id,
        isUpdate,
      });
    }
  } catch (err) {
    log.error('Failed to send token alert', { mint: token.mint, error: err.message });
  }
}

/**
 * Get the bot instance
 */
export function getBot() {
  return bot;
}

/**
 * Get the configured chat ID
 */
export function getChatId() {
  return chatId;
}

/**
 * Stop the bot
 */
export function stopBot() {
  if (bot) {
    bot.stopPolling();
    log.info('Telegram bot stopped');
  }
}

export default { initBot, sendMessage, editMessage, sendTokenAlert, getBot, getChatId, stopBot };
