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

// Pull pending updates. Telegram replays the same updates on every call until
// they're acknowledged via `offset` — see acknowledgeUpdates below. Without
// acknowledging, a message like "pickup VTP-1234" gets re-matched and
// re-processed on every single poll (confirmed live: this caused the watcher
// to re-claim and re-launch a new window for the same issue every tick once
// polling was tightened to 1 minute).
export async function getUpdates({ limit = 100, offset } = {}) {
  const body = { limit, allowed_updates: ["message"] };
  if (offset !== undefined) body.offset = offset;
  return api("getUpdates", body);
}

// Permanently clear `updates` from Telegram's pending queue so they never come
// back from getUpdates again — no local state needed, Telegram remembers the
// offset server-side per bot. Call this once per tick, right after fetching,
// before acting on the messages: claim/approve are themselves idempotent at
// the Atoll level, so an ack-then-crash is far safer than the alternative
// (an unacknowledged message reprocessing forever).
export async function acknowledgeUpdates(updates) {
  if (!updates.length) return;
  const maxId = Math.max(...updates.map((u) => u.update_id));
  await getUpdates({ limit: 1, offset: maxId + 1 }).catch(() => {});
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
