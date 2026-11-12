import { tempColor, tierLabel, formatDate, daysSince } from '../lib/helpers';

const SIGNALS = {
  ACT_NOW:            { label: 'ACT NOW',       color: '#EF5350', icon: '⚡' },
  FOLLOW_UP_DUE:      { label: 'FOLLOW UP DUE', color: '#FFB74D', icon: '🚩' },
  RELATIONSHIP_CHECK: { label: 'CHECK IN',      color: '#81C784', icon: '🔄' },
};

const TRENDS = {
  up:   { arrow: '↗', color: '#03DAC6', title: 'Warming vs 7 days ago' },
  down: { arrow: '↘', color: '#CF6679', title: 'Cooling vs 7 days ago' },
  flat: { arrow: '→', color: '#666666', title: 'Steady vs 7 days ago'  },
};

const chip = {
  fontSize: '.55rem', color: 'var(--text-muted)', background: 'var(--bg-primary)',
  border: '1px solid var(--border)', padding: '2px 6px', borderRadius: 3, fontWeight: 700,
};

function tally(days) {
  if (days === null || days === undefined) return '';
  if (days === 0) return 'today';
  return `${days} day${days === 1 ? '' : 's'}`;
}

// Shared entry style: row 1 name, row 2 company, row 3 title.
export default function ContactCard({ contact, signal, extraChips = [], showEntry = false, onClick }) {
  const c = contact;
  const sig = typeof signal === 'string' ? SIGNALS[signal] : (signal || null);
  const tr = TRENDS[c.trend] || TRENDS.flat;
  const temp = Number(c.live_temp ?? c.current_temp ?? 0);
  const entryDate = c.encounter_date || c.created_at;
  const hours = Number(c.window_hours_remaining);

  return (
    <div className="card" onClick={onClick}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '.88rem' }}>{c.full_name}</div>
          {c.company_node && (
            <div style={{ fontSize: '.72rem', color: 'var(--accent-silver)', marginTop: 2 }}>{c.company_node}</div>
          )}
          {c.job_title && (
            <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{c.job_title}</div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {sig && (
            <div style={{ fontSize: '.52rem', fontWeight: 700, letterSpacing: '.8px', color: sig.color, marginBottom: 4, textTransform: 'uppercase' }}>
              {sig.icon} {sig.label}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 4 }}>
            <span title={tr.title} style={{ color: tr.color, fontWeight: 800, fontSize: '1rem', lineHeight: 1 }}>{tr.arrow}</span>
            <span style={{ fontWeight: 800, fontSize: '1.05rem', color: tempColor(temp) }}>{temp.toFixed(1)}°</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        <span style={chip}>{tierLabel(c.contact_tier)}</span>
        {showEntry && c.relationship_status && (
          <span style={{ ...chip, fontWeight: 600, textTransform: 'capitalize' }}>{c.relationship_status.replace(/_/g, ' ')}</span>
        )}
        {c.follow_up_at && <span style={chip}>↩ {formatDate(c.follow_up_at)}</span>}
        {c.outreach_window_active && hours > 0 && (
          <span style={{ ...chip, color: '#EF5350', borderColor: 'rgba(239,83,80,.3)' }}>⏱ {hours.toFixed(0)}h window</span>
        )}
        {extraChips.map((t, i) => <span key={i} style={chip}>{t}</span>)}
        {showEntry && entryDate && (
          <span style={chip}>Entered {formatDate(entryDate)} · {tally(daysSince(entryDate))}</span>
        )}
      </div>
    </div>
  );
}
