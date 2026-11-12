import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { localDateISO } from '../lib/helpers';

const blank = () => ({
  full_name: '', company_node: '', job_title: '', email: '', phone: '',
  linkedin_url: '', instagram_handle: '', website: '',
  location_met: '', encounter_date: localDateISO(), memory: '', tier: '4',
});

const clean = (v) => (v || '').trim();

export default function ManualAdd({ open, onClose, onSaved, onOpenExisting }) {
  const [f, setF] = useState(blank());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [dupes, setDupes] = useState([]);

  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }));

  function close() { setErr(''); setDupes([]); onClose(); }

  async function save(force) {
    const name = clean(f.full_name);
    const email = clean(f.email).toLowerCase();
    if (!name && !email) { setErr('Enter a name or an email.'); return; }
    setBusy(true);
    setErr('');
    try {
      if (!force) {
        const { data: found, error: dupErr } = await supabase.rpc('find_similar_contacts', { p_name: name, p_email: email });
        if (dupErr) throw dupErr;
        if (found && found.length) { setDupes(found); setBusy(false); return; }
      }
      const now = new Date().toISOString();
      const where = clean(f.location_met);
      const { data, error } = await supabase.from('platform_contacts').insert({
        full_name: name || email,
        company_node: clean(f.company_node) || null,
        job_title: clean(f.job_title) || null,
        email: email || null,
        phone: clean(f.phone) || null,
        linkedin_url: clean(f.linkedin_url) || null,
        instagram_handle: clean(f.instagram_handle) || null,
        website: clean(f.website) || null,
        location_met: where || null,
        encounter_date: f.encounter_date || localDateISO(),
        connection_rationale: clean(f.memory) || null,
        ecosystem_target: 'NMC',
        ingestion_source: 'manual_entry',
        validation_status: 'APPROVED',
        relationship_status: 'active',
        contact_tier: parseInt(f.tier),
        notes_thread: [{ type: 'manual_add', note: `Added manually${where ? ' · ' + where : ''}.`, author: 'charles', timestamp: now }],
        metadata: { source: 'manual_add' },
        updated_at: now,
      }).select('id').single();
      if (error) throw error;
      setF(blank());
      setDupes([]);
      onSaved(data.id);
    } catch (e) {
      setErr(e.message || String(e));
    }
    setBusy(false);
  }

  return (
    <div className={`overlay${open ? ' open' : ''}`}>
      <div className="sheet" style={{ maxWidth: 460 }}>
        <div className="sheet-handle" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--accent-silver)', letterSpacing: '2px', textTransform: 'uppercase' }}>
            Add Contact
          </div>
          <button className="btn btn-ghost btn-sm" onClick={close}>✕</button>
        </div>

        <div className="input-group"><label>Full Name *</label>
          <input className="hud-in" value={f.full_name} onChange={set('full_name')} /></div>
        <div className="input-group"><label>Company</label>
          <input className="hud-in" value={f.company_node} onChange={set('company_node')} /></div>
        <div className="input-group"><label>Job Title</label>
          <input className="hud-in" value={f.job_title} onChange={set('job_title')} /></div>
        <div className="grid-2">
          <div className="input-group"><label>Email</label>
            <input className="hud-in" type="email" value={f.email} onChange={set('email')} /></div>
          <div className="input-group"><label>Phone</label>
            <input className="hud-in" type="tel" value={f.phone} onChange={set('phone')} /></div>
        </div>
        <div className="input-group"><label>LinkedIn URL</label>
          <input className="hud-in" value={f.linkedin_url} onChange={set('linkedin_url')} /></div>
        <div className="grid-2">
          <div className="input-group"><label>Instagram</label>
            <input className="hud-in" value={f.instagram_handle} onChange={set('instagram_handle')} placeholder="@handle" /></div>
          <div className="input-group"><label>Website</label>
            <input className="hud-in" value={f.website} onChange={set('website')} /></div>
        </div>
        <div className="grid-2">
          <div className="input-group"><label>Where we met</label>
            <input className="hud-in" value={f.location_met} onChange={set('location_met')} placeholder="NYFW, email…" /></div>
          <div className="input-group"><label>Date</label>
            <input className="hud-in" type="date" value={f.encounter_date} onChange={set('encounter_date')} /></div>
        </div>
        <div className="input-group"><label>What do you want to remember about them?</label>
          <textarea className="hud-in" value={f.memory} onChange={set('memory')} /></div>
        <div className="input-group"><label>Tier</label>
          <select className="hud-in" value={f.tier} onChange={set('tier')}>
            <option value="1">T1 — Primary Target</option>
            <option value="2">T2 — High Value</option>
            <option value="3">T3 — Maintenance</option>
            <option value="4">T4 — Unqualified</option>
          </select></div>

        {dupes.length > 0 && (
          <div style={{ padding: 10, marginBottom: 12, background: 'rgba(255,183,77,.1)', border: '1px solid rgba(255,183,77,.35)', borderRadius: 6 }}>
            <div style={{ fontSize: '.62rem', fontWeight: 700, color: '#FFB74D', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 8 }}>
              Possible match already in the CRM
            </div>
            {dupes.map(d => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ fontSize: '.72rem', lineHeight: 1.4 }}>
                  <div style={{ fontWeight: 700 }}>{d.full_name}</div>
                  <div style={{ color: 'var(--text-muted)' }}>{[d.company_node, d.job_title, d.email].filter(Boolean).join(' · ')}</div>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => { close(); onOpenExisting(d.id); }}>Open</button>
              </div>
            ))}
            <button className="btn btn-outline btn-sm" style={{ width: '100%', marginTop: 4 }} disabled={busy} onClick={() => save(true)}>
              Not the same person: add anyway
            </button>
          </div>
        )}

        {err && (
          <div style={{ padding: '10px 12px', marginBottom: 12, background: 'rgba(207,102,121,.12)', border: '1px solid rgba(207,102,121,.3)', borderRadius: 6, color: '#CF6679', fontSize: '.7rem', lineHeight: 1.5 }}>
            Could not save: {err}
          </div>
        )}

        <button className="btn btn-silver" style={{ marginBottom: 8 }} disabled={busy} onClick={() => save(false)}>
          {busy ? 'Saving…' : 'Save Contact'}
        </button>
        <button className="btn btn-ghost" style={{ width: '100%' }} onClick={close}>Cancel</button>
      </div>
    </div>
  );
}
