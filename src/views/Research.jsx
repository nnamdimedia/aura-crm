import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { tempColor, tierLabel, relativeDate, formatDate, fetchContactExtras, tempInfo } from '../lib/helpers';
import ContactCard from '../components/ContactCard';

const SIGNAL_META = {
  NEVER_RESEARCHED:     { label: 'Never Researched',      color: '#EF5350', icon: '🔴' },
  NEEDS_REFRESH_URGENT: { label: 'Refresh Urgent',         color: '#FFB74D', icon: '🟡' },
  TRIGGER_HUNT:         { label: 'News Trigger Needed',    color: '#03DAC6', icon: '⚡' },
  REVIEW_DUE:           { label: 'Review Due',             color: '#81C784', icon: '🟢' },
  CURRENT:              { label: 'Current',                color: '#444',    icon: '✓'  },
};

const RESEARCH_TYPES = [
  { value:'company',          label:'Company Intelligence' },
  { value:'person',           label:'Personal Background'  },
  { value:'industry',         label:'Industry Context'     },
  { value:'outreach_angle',   label:'Outreach Angle'       },
  { value:'pitch_content',    label:'Pitch Content'        },
  { value:'mutual_connections',label:'Mutual Connections'  },
  { value:'news_trigger',     label:'News Trigger'         },
  { value:'enrichment',       label:'Enrichment Data'      },
];

export default function Research() {
  const [queue,      setQueue]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [err,        setErr]        = useState('');
  const [selected,   setSelected]   = useState(null);
  const [research,   setResearch]   = useState([]);
  const [writing,    setWriting]    = useState(false);
  const [newEntry,   setNewEntry]   = useState({ research_type:'company', content:'', sources:'' });
  const [filter,     setFilter]     = useState('ALL');
  const navigate = useNavigate();

  useEffect(() => { fetchQueue(); }, []);

  async function fetchQueue() {
    const { data, error } = await supabase.from('v_research_queue').select('*');
    if (error) setErr(error.message);
    const base = data || [];
    const extras = await fetchContactExtras(base.map(x => x.id));
    setQueue(base.map(x => {
      const e = extras[x.id] || {};
      const info = tempInfo({ ...e, current_temp: x.current_temp });
      return { ...x, encounter_date: e.encounter_date, created_at: e.created_at, live_temp: info.temp, trend: info.trend };
    }));
    setLoading(false);
  }

  async function loadResearch(contactId) {
    const { data } = await supabase
      .from('contact_research')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });
    setResearch(data || []);
  }

  async function selectContact(row) {
    setSelected(row);
    await loadResearch(row.id);
  }

  async function submitResearch() {
    if (!newEntry.content.trim() || !selected) return;

    let sources = [];
    try {
      sources = newEntry.sources.trim()
        ? newEntry.sources.split('\n').filter(Boolean).map(s => ({ url: s.trim() }))
        : [];
    } catch {}

    await supabase.from('contact_research').insert({
      contact_id:    selected.id,
      research_type: newEntry.research_type,
      content:       newEntry.content.trim(),
      sources:       sources,
      author:        'sloane',
      is_current:    true,
    });

    // If news_trigger, set outreach window on contact
    if (newEntry.research_type === 'news_trigger') {
      const expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
      await supabase.from('platform_contacts').update({
        outreach_window_active:     true,
        outreach_window_expires_at: expiresAt,
      }).eq('id', selected.id);
    }

    setNewEntry({ research_type:'company', content:'', sources:'' });
    setWriting(false);
    await loadResearch(selected.id);
    fetchQueue();
  }

  async function markSuperseded(researchId) {
    await supabase.from('contact_research').update({ is_current: false }).eq('id', researchId);
    await loadResearch(selected.id);
  }

  const filtered = filter === 'ALL' ? queue : queue.filter(r => r.research_signal === filter);

  if (selected) {
    const sig = SIGNAL_META[selected.research_signal] || SIGNAL_META.CURRENT;
    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
          <button className="btn btn-ghost" onClick={() => setSelected(null)}>← Queue</button>
          <div>
            <div style={{ fontWeight:800, fontSize:'.9rem' }}>{selected.full_name}</div>
            {selected.company_node && <div style={{ fontSize:'.72rem', color:'var(--accent-silver)', marginTop:2 }}>{selected.company_node}</div>}
            {selected.job_title && <div style={{ fontSize:'.65rem', color:'var(--text-muted)', marginTop:2 }}>{selected.job_title}</div>}
          </div>
        </div>

        {/* Status row */}
        <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
          <span style={{ fontSize:'.6rem', fontWeight:700, color: sig.color, padding:'3px 8px', background:`${sig.color}15`, border:`1px solid ${sig.color}33`, borderRadius:4 }}>
            {sig.icon} {sig.label}
          </span>
          <span style={{ fontSize:'.6rem', color: tempColor(selected.live_temp ?? selected.current_temp), fontWeight:700, padding:'3px 8px', background:`${tempColor(selected.live_temp ?? selected.current_temp)}15`, border:`1px solid ${tempColor(selected.live_temp ?? selected.current_temp)}33`, borderRadius:4 }}>
            {({ up:'↗', down:'↘', flat:'→' }[selected.trend] || '→')} {Number(selected.live_temp ?? selected.current_temp ?? 0).toFixed(1)}°
          </span>
          <span style={{ fontSize:'.6rem', color:'var(--text-muted)', padding:'3px 8px', background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:4 }}>
            {tierLabel(selected.contact_tier)}
          </span>
        </div>

        <div style={{ display:'flex', gap:8, marginBottom:14 }}>
          <button className="btn btn-outline-green btn-sm" onClick={() => setWriting(!writing)} style={{ flex:1, padding:'9px' }}>
            {writing ? 'Cancel' : '+ Add Research Entry'}
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => navigate(`/contact/${selected.id}`)} style={{ flex:1, padding:'9px' }}>
            Open Contact
          </button>
        </div>

        {writing && (
          <div className="panel" style={{ borderColor:'rgba(3,218,198,.3)' }}>
            <div className="panel-title" style={{ color:'var(--accent-green)' }}>New Research Entry</div>
            <div className="input-group">
              <label>Research Type</label>
              <select className="hud-in" value={newEntry.research_type} onChange={e => setNewEntry(p=>({...p,research_type:e.target.value}))}>
                {RESEARCH_TYPES.map(rt => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label>Content</label>
              <textarea className="hud-in" style={{ minHeight:120 }} value={newEntry.content} onChange={e => setNewEntry(p=>({...p,content:e.target.value}))} placeholder="Research notes, pitch angles, intel…" />
            </div>
            <div className="input-group">
              <label>Sources (one URL per line, optional)</label>
              <textarea className="hud-in" style={{ minHeight:60 }} value={newEntry.sources} onChange={e => setNewEntry(p=>({...p,sources:e.target.value}))} placeholder="https://..." />
            </div>
            <button className="btn btn-silver" onClick={submitResearch} disabled={!newEntry.content.trim()}>
              Submit Research Entry
            </button>
          </div>
        )}

        {research.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">🔬</div><div>No research entries yet.</div></div>
        ) : research.map(r => (
          <div key={r.id} className="panel" style={{ borderColor: r.is_current ? 'var(--border)' : 'var(--border-light)', opacity: r.is_current ? 1 : .5 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
              <div>
                <span style={{ fontSize:'.6rem', fontWeight:700, color:'var(--accent-silver)', letterSpacing:'.8px', textTransform:'uppercase' }}>
                  {RESEARCH_TYPES.find(t=>t.value===r.research_type)?.label || r.research_type}
                </span>
                {r.research_type === 'news_trigger' && r.is_current && (
                  <span style={{ marginLeft:6, fontSize:'.55rem', color:'#EF5350', fontWeight:700 }}>⚡ ACTIVE TRIGGER</span>
                )}
              </div>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <span style={{ fontSize:'.58rem', color:'var(--text-muted)' }}>{r.author} · {relativeDate(r.created_at)}</span>
                {r.is_current && (
                  <button className="btn btn-ghost" style={{ fontSize:'.55rem', padding:'2px 6px', color:'var(--text-muted)' }} onClick={() => markSuperseded(r.id)}>
                    Supersede
                  </button>
                )}
              </div>
            </div>
            <div style={{ fontSize:'.78rem', color: r.is_current ? 'var(--accent-silver)' : 'var(--text-muted)', lineHeight:1.6, whiteSpace:'pre-wrap' }}>
              {r.content}
            </div>
            {r.sources?.length > 0 && (
              <div style={{ marginTop:8 }}>
                {r.sources.map((s,i) => (
                  <a key={i} href={s.url} target="_blank" rel="noreferrer" style={{ display:'block', fontSize:'.62rem', color:'var(--accent-green)', marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    🔗 {s.url}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Queue view
  const filterBtns = ['ALL','NEVER_RESEARCHED','TRIGGER_HUNT','NEEDS_REFRESH_URGENT','REVIEW_DUE'];

  return (
    <div>
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:'.6rem', color:'var(--text-muted)', letterSpacing:'2px', textTransform:'uppercase', marginBottom:2 }}>Research Queue</div>
        <div style={{ fontSize:'1.05rem', fontWeight:700 }}>Sloane + August</div>
      </div>

      <div className="input-group" style={{ marginBottom:12 }}>
        <select className="hud-in" value={filter} onChange={e => setFilter(e.target.value)}>
          {filterBtns.map(f => {
            const meta = SIGNAL_META[f];
            const count = f === 'ALL' ? queue.length : queue.filter(row => row.research_signal === f).length;
            return <option key={f} value={f}>{meta ? `${meta.label} (${count})` : `All (${count})`}</option>;
          })}
        </select>
      </div>

      {err && (
        <div style={{ padding:'10px 12px', marginBottom:12, background:'rgba(207,102,121,.12)', border:'1px solid rgba(207,102,121,.3)', borderRadius:6, color:'#CF6679', fontSize:'.7rem', lineHeight:1.5 }}>
          Could not load: {err}
        </div>
      )}

      {loading ? <div className="spinner" /> : filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">✅</div><div>Research queue clear.</div></div>
      ) : filtered.map(row => (
        <ContactCard
          key={row.id}
          contact={row}
          signal={SIGNAL_META[row.research_signal] || SIGNAL_META.CURRENT}
          extraChips={row.research_updated_at ? [`Researched ${relativeDate(row.research_updated_at)}`] : []}
          onClick={() => selectContact(row)}
        />
      ))}
    </div>
  );
}
