import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { tempColor, tempLabel, tierLabel, relativeDate, formatDate, parseThread, getTouchNumber, INGESTION_LABELS, fetchContactExtras, tempInfo } from '../lib/helpers';
import ContactCard from '../components/ContactCard';

export default function Dashboard() {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState('');
  const [filter,  setFilter]  = useState('ALL');
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboard();
    const channel = supabase
      .channel('dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_contacts' }, fetchDashboard)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  async function fetchDashboard() {
    const { data, error } = await supabase.from('v_charles_dashboard').select('*');
    if (error) { setErr(error.message); setLoading(false); return; }
    const base = data || [];
    const extras = await fetchContactExtras(base.map(r => r.id));
    setErr('');
    setRows(base.map(r => {
      const x = extras[r.id] || {};
      const info = tempInfo({ ...x, current_temp: r.current_temp });
      return { ...r, encounter_date: x.encounter_date, created_at: x.created_at, live_temp: info.temp, trend: info.trend };
    }));
    setLoading(false);
  }

  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';

  const count = (k) => rows.filter(r => r.priority_signal === k).length;
  const options = [
    { key: 'ALL',                label: `All (${rows.length})` },
    { key: 'ACT_NOW',            label: `⚡ Act Now (${count('ACT_NOW')})` },
    { key: 'FOLLOW_UP_DUE',      label: `🚩 Follow-Up Due (${count('FOLLOW_UP_DUE')})` },
    { key: 'RELATIONSHIP_CHECK', label: `🔄 Check In (${count('RELATIONSHIP_CHECK')})` },
  ];

  const filtered = filter === 'ALL' ? rows : rows.filter(r => r.priority_signal === filter);

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 2 }}>
          Action Queue
        </div>
        <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{greeting}, Charles.</div>
      </div>

      <div className="input-group" style={{ marginBottom: 14 }}>
        <select className="hud-in" value={filter} onChange={e => setFilter(e.target.value)}>
          {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>

      {err && (
        <div style={{ padding: '10px 12px', marginBottom: 12, background: 'rgba(207,102,121,.12)', border: '1px solid rgba(207,102,121,.3)', borderRadius: 6, color: '#CF6679', fontSize: '.7rem', lineHeight: 1.5 }}>
          Could not load: {err}
        </div>
      )}

      {loading ? (
        <div className="spinner" />
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <div>Queue clear.</div>
        </div>
      ) : (
        filtered.map(r => (
          <ContactCard
            key={r.id}
            contact={r}
            signal={r.priority_signal}
            onClick={() => navigate(`/contact/${r.id}`)}
          />
        ))
      )}
    </div>
  );
}
