// Minimal Telegram Bot API client using global fetch (Node 18+).
// Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from the environment.
// No dependencies, so it runs unchanged on Windows, macOS, and the cloud.

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function api(method, body) {
  if (!TOKEN) throw new Error("TELEGRAM_BOT_TOKEN not set");
  return fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (r) => {
    const j = await r.json();
    if (!j.ok) throw new Error(`Telegram ${method} failed: ${JSON.stringify(j)}`);
    return j.result;
  });
}

export function sendMessage(text, { chatId = CHAT_ID, parseMode = "HTML", ...opts } = {}) {
  if (!chatId) throw new Error("TELEGRAM_CHAT_ID not set");
  return api("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
    disable_web_page_preview: true,
    ...opts,
  });
}

// Pull recent updates. Telegram retains ~24h of updates when no offset is confirmed,
// which is exactly what we want: the watcher is stateless and re-reads the window
// each tick, acting idempotently.
export async function getUpdates({ limit = 100 } = {}) {
  return api("getUpdates", { limit, allowed_updates: ["message"] });
}

// Extract text messages from this chat within the last `hours`.
export function recentTextMessages(updates, hours = 24) {
  const cutoff = Date.now() / 1000 - hours * 3600;
  const out = [];
  for (const u of updates) {
    const m = u.message;
    if (!m || !m.text) continue;
    if (m.date < cutoff) continue;
    if (CHAT_ID && String(m.chat?.id) !== String(CHAT_ID)) continue;
    out.push({ text: m.text.trim(), date: m.date, from: m.from?.username || m.from?.id });
  }
  return out;
}

export const configured = Boolean(TOKEN && CHAT_ID);
