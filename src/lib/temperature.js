// Mirrors calculate_contact_temperature() in Postgres so the UI can show a live
// temperature and a 7-day trend. If the SQL formula changes, change this too.

const BASELINE = {
  auralens_scan: 30, manual_entry: 20, email_import: 15, phone_import: 15,
  photo_import: 12, pdf_import: 12, bulk_import: 8, system: 0,
};

const WEIGHTS = {
  meeting: 12, video_call: 10, phone_call: 10, response: 10, email_received: 10,
  text_exchange: 6, positive_signal: 6, meeting_set: 5, follow_up_flagged: 3,
  outreach: 3, voicemail_left: 2, news_trigger: 2, job_change: 1, no_answer: 1,
  no_response: -3, negative_signal: -5,
};

const RESETS_CLOCK = new Set([
  'meeting', 'video_call', 'phone_call', 'response', 'email_received',
  'text_exchange', 'positive_signal', 'meeting_set', 'outreach',
  'voicemail_left', 'no_answer', 'job_change', 'follow_up_flagged',
]);

const WEEK_MS = 7 * 24 * 3600 * 1000;

// white = 0° / dormant, blue < 10, light blue < 20, green < 25,
// yellow < 30, orange < 40, red up to 50
export function tempColor(temp) {
  const t = Number(temp);
  if (!isFinite(t) || t <= 0) return '#FFFFFF';
  if (t < 10) return '#2979FF';
  if (t < 20) return '#4FC3F7';
  if (t < 25) return '#66BB6A';
  if (t < 30) return '#FFEE58';
  if (t < 40) return '#FFA726';
  return '#EF5350';
}

export function parseThread(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  }
  return [];
}

export function tempAt(source, thread, createdAt, at) {
  const atMs = at.getTime();
  let temp = BASELINE[source || 'bulk_import'];
  if (temp === undefined) temp = 8;
  let last = createdAt ? new Date(createdAt).getTime() : atMs;

  const events = (Array.isArray(thread) ? thread : [])
    .filter(e => e && e.timestamp && new Date(e.timestamp).getTime() <= atMs)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  for (const e of events) {
    const ts = new Date(e.timestamp).getTime();
    if (e.type === 'manual_warmth_correction') {
      if (e.new_anchor !== undefined && e.new_anchor !== null) temp = Number(e.new_anchor);
      last = ts;
      continue;
    }
    temp += WEIGHTS[e.type] || 0;
    if (RESETS_CLOCK.has(e.type)) last = ts;
  }

  const weeks = Math.max(0, (atMs - last) / WEEK_MS);
  return Math.round(Math.max(0, Math.min(50, temp - weeks)) * 10) / 10;
}

// Returns today's temperature and whether it is warming/cooling versus 7 days ago.
export function tempInfo(row) {
  const fallback = Number(row?.current_temp ?? 0);
  if (!row || !row.created_at) return { temp: fallback, trend: 'flat' };
  const thread = parseThread(row.notes_thread);
  const now = new Date();
  const past = new Date(now.getTime() - WEEK_MS);
  const nowT = tempAt(row.ingestion_source, thread, row.created_at, now);
  const pastT = tempAt(row.ingestion_source, thread, row.created_at, past);
  const diff = nowT - pastT;
  return { temp: nowT, trend: diff >= 0.5 ? 'up' : diff <= -0.5 ? 'down' : 'flat' };
}
