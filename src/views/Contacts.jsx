import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { tempInfo } from '../lib/helpers';
import ContactCard from '../components/ContactCard';
import ManualAdd from '../components/ManualAdd';

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState('');
  const [query,    setQuery]    = useState('');
  const [tier,     setTier]     = useState('ALL');
  const [status,   setStatus]   = useState('active');
  const [addOpen,  setAddOpen]  = useState(false);
  const navigate = useNavigate();

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('platform_contacts')
      .select('id, full_name, company_node, job_title, current_temp, contact_tier, relationship_status, follow_up_at, email, created_at, encounter_date, notes_thread, ingestion_source')
      .neq('email', 'system_heartbeat@nmc.internal')
      .order('current_temp', { ascending: false })
      .limit(200);

    if (status !== 'ALL') q = q.eq('relationship_status', status);
    if (tier   !== 'ALL') q = q.eq('contact_tier', parseInt(tier));

    const { data, error } = await q;
    if (error) { setErr(error.message); setContacts([]); setLoading(false); return; }
    setErr('');

    const needle = query.trim().toLowerCase();
    const rows = (data || [])
      .filter(c => !needle || [c.full_name, c.company_node, c.job_title, c.email]
        .some(v => (v || '').toLowerCase().includes(needle)))
      .map(c => { const info = tempInfo(c); return { ...c, live_temp: info.temp, trend: info.trend }; })
      .sort((a, b) => b.live_temp - a.live_temp);

    setContacts(rows);
    setLoading(false);
  }, [query, tier, status]);

  useEffect(() => {
    const t = setTimeout(fetchContacts, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchContacts]);

  return (
    <div>
      <div className="search-bar">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          placeholder="Search name, company, title, email…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <div className="grid-2" style={{ marginBottom: 12 }}>
        <select className="hud-in" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="active">Active</option>
          <option value="nurture">Nurture</option>
          <option value="paused">Paused</option>
          <option value="disqualified">Disqualified</option>
          <option value="do_not_contact">Do Not Contact</option>
          <option value="archived">Archived</option>
          <option value="ALL">All Statuses</option>
        </select>
        <select className="hud-in" value={tier} onChange={e => setTier(e.target.value)}>
          <option value="ALL">All Tiers</option>
          <option value="1">Tier 1 — Primary</option>
          <option value="2">Tier 2 — High Value</option>
          <option value="3">Tier 3 — Maintenance</option>
          <option value="4">Tier 4 — Unqualified</option>
        </select>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', letterSpacing: '1px' }}>
          {contacts.length} {contacts.length === 1 ? 'contact' : 'contacts'}
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => setAddOpen(true)}>+ Add contact</button>
      </div>

      {err && (
        <div style={{ padding: '10px 12px', marginBottom: 12, background: 'rgba(207,102,121,.12)', border: '1px solid rgba(207,102,121,.3)', borderRadius: 6, color: '#CF6679', fontSize: '.7rem', lineHeight: 1.5 }}>
          Could not load: {err}
        </div>
      )}

      {loading ? (
        <div className="spinner" />
      ) : contacts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">👥</div>
          <div>No contacts found.</div>
        </div>
      ) : (
        contacts.map(c => (
          <ContactCard key={c.id} contact={c} showEntry onClick={() => navigate(`/contact/${c.id}`)} />
        ))
      )}
      <ManualAdd
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={(newId) => { setAddOpen(false); navigate(`/contact/${newId}`); }}
        onOpenExisting={(existingId) => navigate(`/contact/${existingId}`)}
      />
    </div>
  );
}
