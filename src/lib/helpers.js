import { supabase } from './supabase';
import { parseThread } from './temperature';
export { tempColor, tempAt, tempInfo, parseThread } from './temperature';

// ── Temperature ───────────────────────────────────────────
export function tempLabel(temp) {
  if (temp >= 40) return 'HOT';
  if (temp >= 30) return 'WARM';
  if (temp >= 20) return 'COOL';
  if (temp >= 10) return 'COLD';
  return 'DORMANT';
}

// ── Tier ──────────────────────────────────────────────────
export function tierLabel(tier) {
  const map = { 1: 'T1', 2: 'T2', 3: 'T3', 4: 'T4' };
  return map[tier] || 'T4';
}

export function tierFullLabel(tier) {
  const map = {
    1: 'T1 — Primary Target',
    2: 'T2 — High Value',
    3: 'T3 — Maintenance',
    4: 'T4 — Unqualified',
  };
  return map[tier] || 'T4 — Unqualified';
}

// ── Dates ─────────────────────────────────────────────────
export function localDateISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function relativeDate(iso) {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7)  return `${diff}d ago`;
  if (diff < 30) return `${Math.floor(diff/7)}w ago`;
  if (diff < 365) return `${Math.floor(diff/30)}mo ago`;
  return `${Math.floor(diff/365)}y ago`;
}

export function formatDate(iso) {
  if (!iso) return '—';
  return parseDate(iso).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

// ── Notes thread ──────────────────────────────────────────
// Throw on any database error so failures are never silent
export async function must(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// notes_thread is a jsonb ARRAY: send arrays/objects as-is, never JSON.stringify
export async function appendNote(contactId, event) {
  const { data, error } = await supabase
    .from('platform_contacts')
    .select('notes_thread')
    .eq('id', contactId)
    .single();
  if (error) throw error;

  const thread = parseThread(data.notes_thread).slice();
  thread.push({ ...event, timestamp: new Date().toISOString() });

  const { error: updateError } = await supabase
    .from('platform_contacts')
    .update({ notes_thread: thread, updated_at: new Date().toISOString() })
    .eq('id', contactId);
  if (updateError) throw updateError;
  return thread;
}

// ── Event type metadata ───────────────────────────────────
export const EVENT_META = {
  meeting:           { label: 'Meeting',          emoji: '🤝', weight: 12 },
  video_call:        { label: 'Video Call',        emoji: '🎥', weight: 10 },
  phone_call:        { label: 'Phone Call',        emoji: '📞', weight: 10 },
  response:          { label: 'Response',          emoji: '💬', weight: 10 },
  email_received:    { label: 'Email Received',    emoji: '📧', weight: 10 },
  text_exchange:     { label: 'Text Exchange',     emoji: '💬', weight: 6  },
  positive_signal:   { label: 'Positive Signal',   emoji: '✅', weight: 6  },
  meeting_set:       { label: 'Meeting Set',       emoji: '📅', weight: 5  },
  follow_up_flagged: { label: 'Follow-Up Flagged', emoji: '🚩', weight: 3  },
  outreach:          { label: 'Outreach',          emoji: '📤', weight: 3  },
  initiated_outreach:{ label: 'Initiated Outreach',emoji: '📤', weight: 3  },
  voicemail_left:    { label: 'Voicemail Left',    emoji: '📱', weight: 2  },
  news_trigger:      { label: 'News Trigger',      emoji: '⚡', weight: 2  },
  job_change:        { label: 'Job Change',        emoji: '🔄', weight: 1  },
  no_answer:         { label: 'No Answer',         emoji: '📵', weight: 1  },
  no_response:       { label: 'No Response',       emoji: '🔇', weight: -3 },
  negative_signal:   { label: 'Negative Signal',   emoji: '❌', weight: -5 },
  scan:              { label: 'Card Scanned',      emoji: '📇', weight: 0  },
  re_scan:           { label: 'Re-Scanned',        emoji: '🔁', weight: 0  },
  pending_log:       { label: 'Pending Review',    emoji: '⏳', weight: 0  },
  manual_warmth_correction: { label: 'Manual Warmth Set', emoji: '🌡', weight: 0 },
  brief_prepared:    { label: 'Brief Prepared',    emoji: '📋', weight: 0  },
};

// ── Pitch affinity labels ─────────────────────────────────
export const AFFINITY_LABELS = {
  editorial:          'Editorial',
  brand_campaign:     'Brand Campaign',
  personal_marketing: 'Personal Marketing',
  studio_rental:      'Studio Rental',
  corporate_retainer: 'Corp Retainer',
};

// ── Pipeline stage labels ─────────────────────────────────
export const PIPELINE_STAGES = {
  NMC: {
    editorial:          ['relationship','story_concept_alignment','editorial_pitch','submitted','published'],
    brand_campaign:     ['relationship','portfolio_introduction','capability_presentation','brief_response','awarded'],
    personal_marketing: ['relationship','trust_established','informal_exploration','formal_proposal','retained'],
  },
  NFINITY: {
    studio_rental:      ['awareness','facility_introduction','trial_booking','recurring_client'],
    corporate_retainer: ['awareness','facility_introduction','trial_booking','trial_complete','retainer_proposal','contracted'],
  },
};

export function stageLabel(stage) {
  const map = {
    relationship:             'Relationship',
    story_concept_alignment:  'Concept Alignment',
    editorial_pitch:          'Editorial Pitch',
    submitted:                'Submitted',
    published:                'Published',
    portfolio_introduction:   'Portfolio Intro',
    capability_presentation:  'Capability Pres.',
    brief_response:           'Brief Response',
    awarded:                  'Awarded',
    trust_established:        'Trust Established',
    informal_exploration:     'Exploration',
    formal_proposal:          'Formal Proposal',
    retained:                 'Retained',
    awareness:                'Awareness',
    facility_introduction:    'Facility Intro',
    trial_booking:            'Trial Booking',
    trial_complete:           'Trial Complete',
    recurring_client:         'Recurring Client',
    retainer_proposal:        'Retainer Proposal',
    contracted:               'Contracted',
  };
  return map[stage] || stage;
}


// ── Date-only strings (YYYY-MM-DD) must be read as LOCAL dates, not UTC ──
export function parseDate(iso) {
  if (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(iso);
}

export function daysSince(iso) {
  if (!iso) return null;
  const d = parseDate(iso);
  const n = new Date();
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

// Fields the dashboard view does not carry (needed for live temperature + trend)
export async function fetchContactExtras(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const { data } = await supabase
      .from('platform_contacts')
      .select('id, notes_thread, ingestion_source, created_at, encounter_date')
      .in('id', ids.slice(i, i + 50));
    (data || []).forEach(m => { out[m.id] = m; });
  }
  return out;
}

export const INGESTION_LABELS = {
  auralens_scan:  'Card Capture',
  phone_import:   'Phone Import',
  email_import:   'Email Import',
  manual_entry:   'Manual Entry',
  research_entry: 'Research Entry',
  bulk_import:    'Bulk Import',
  triage_entry:   'Triage',
  system:         'System',
};

const TOUCH_TYPES = new Set(['outreach','initiated_outreach','phone_call','video_call',
  'email_received','text_exchange','meeting','voicemail_left','no_answer','response']);

export function getTouchNumber(thread) {
  return parseThread(thread).filter(e => TOUCH_TYPES.has(e.type)).length;
}
