import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  tempColor, tierLabel, formatDate, parseDate,
  parseThread, getTouchNumber, INGESTION_LABELS,
} from '../lib/helpers';

const TOUCH_LABELS = ['','Thank-You','Who We Are','Research Value','Check-In','Invitation','The Ask','Follow-Through'];
const TOUCH_DAYS   = [0, 1, 5, 14, 30, 45, 75, 90];

function taskForContact(c, researchMap) {
  if (c.outreach_window_active && c.outreach_window_expires_at && new Date(c.outreach_window_expires_at) > new Date()) {
    const hrs = Math.max(0, ((new Date(c.outreach_window_expires_at) - new Date()) / 3600000)).toFixed(0);
    return { text: `⚡ News trigger — act within ${hrs}h`, color: '#EF5350', urgent: true };
  }
  const done = getTouchNumber(parseThread(c.notes_thread));
  const n = done + 1;
  if (n > 7) return { text: '180-day review due', color: 'var(--text-muted)', urgent: false };
  const base = c.encounter_date ? parseDate(c.encounter_date) : new Date(c.created_at || Date.now());
  const dueMs = base.getTime() + TOUCH_DAYS[n] * 86400000;
  const daysLeft = Math.round((dueMs - Date.now()) / 86400000);
  const urgent = daysLeft <= 0;
  const color = urgent ? '#EF5350' : daysLeft <= 3 ? '#FFB74D' : '#66BB6A';
  const research = researchMap[c.id];
  return {
    text: `T${n} · ${TOUCH_LABELS[n]} · ${urgent ? `${Math.abs(daysLeft)}d overdue` : `due ${formatDate(new Date(dueMs))}`}`,
    color, urgent, n, research,
  };
}

function ActionCard({ c, task, isFish, onFishToggle, onDone, onClick }) {
  const tr = { up: ['↗','#03DAC6'], down: ['↘','#CF6679'], flat: ['→','#666'] }[c.trend] || ['→','#666'];
  const temp = Number(c.live_temp ?? c.current_temp ?? 0);
  const chip = { fontSize:'.52rem', color:'var(--text-muted)', background:'var(--bg-primary)', border:'1px solid var(--border)', padding:'2px 6px', borderRadius:3, fontWeight:700 };
  return (
    <div style={{ background: isFish ? 'rgba(3,218,198,.06)' : 'var(--bg-surface)', border: `1px solid ${isFish ? 'rgba(3,218,198,.35)' : 'var(--border)'}`, borderRadius:8, padding:12, marginBottom:8 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
            <button onClick={e=>{e.stopPropagation();onFishToggle(c.id,!isFish);}}
              title={isFish?'Remove from Three Fish':'Add to Three Fish'}
              style={{ background:'none', border:'none', fontSize:'1rem', cursor:'pointer', padding:0, lineHeight:1, opacity: isFish ? 1 : .3 }}>🐟</button>
            <span style={{ fontWeight:700, fontSize:'.88rem', cursor:'pointer' }} onClick={onClick}>{c.full_name}</span>
          </div>
          {c.company_node && <div style={{ fontSize:'.72rem', color:'var(--accent-silver)', marginBottom:1 }}>{c.company_node}</div>}
          {c.job_title    && <div style={{ fontSize:'.68rem', color:'var(--text-muted)', marginBottom:6 }}>{c.job_title}</div>}
          <div style={{ fontSize:'.76rem', fontWeight:700, color:task.color, marginBottom:5 }}>{task.text}</div>
          {task.research && (
            <div style={{ fontSize:'.68rem', color:'#03DAC6', background:'rgba(3,218,198,.08)', border:'1px solid rgba(3,218,198,.2)', borderRadius:4, padding:'4px 8px', marginBottom:6, lineHeight:1.4 }}>
              💡 {task.research}
            </div>
          )}
          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
            <span style={chip}>{tierLabel(c.contact_tier)}</span>
            <span style={chip}>{INGESTION_LABELS[c.ingestion_source] || 'CRM'}</span>
            {c.follow_up_at && <span style={chip}>↩ {formatDate(c.follow_up_at)}</span>}
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6, flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'baseline', gap:3 }}>
            <span style={{ color:tr[1], fontWeight:800, fontSize:'1rem' }}>{tr[0]}</span>
            <span style={{ fontWeight:800, fontSize:'1.1rem', color:tempColor(temp) }}>{temp.toFixed(1)}°</span>
          </div>
          <div style={{ display:'flex', gap:5 }}>
            {c.email && (
              <a href={`mailto:${c.email}`} style={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:5, padding:'5px 9px', fontSize:'.65rem', color:'var(--accent-silver)', textDecoration:'none', fontWeight:700 }} onClick={e=>e.stopPropagation()}>📧</a>
            )}
            {c.phone && (
              <a href={`tel:${c.phone}`} style={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:5, padding:'5px 9px', fontSize:'.65rem', color:'var(--accent-silver)', textDecoration:'none', fontWeight:700 }} onClick={e=>e.stopPropagation()}>📞</a>
            )}
            {c.phone && (
              <a href={`sms:${c.phone}`} style={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:5, padding:'5px 9px', fontSize:'.65rem', color:'var(--accent-silver)', textDecoration:'none', fontWeight:700 }} onClick={e=>e.stopPropagation()}>💬</a>
            )}
          </div>
          <button onClick={e=>{e.stopPropagation();onDone(c.id);}}
            style={{ background:'rgba(102,187,106,.12)', border:'1px solid rgba(102,187,106,.35)', color:'#66BB6A', borderRadius:5, padding:'4px 10px', fontSize:'.6rem', fontWeight:700, cursor:'pointer', letterSpacing:'.8px', textTransform:'uppercase', fontFamily:'var(--font)' }}>
            Done ✓
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [plan,        setPlan]        = useState([]);
  const [extras,      setExtras]      = useState({});
  const [researchMap, setResearchMap] = useState({});
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState('');

  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';

  const loadAll = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().slice(0,10);

    // 1. Today's plan
    const { data: planRows, error: planErr } = await supabase
      .from('daily_plan')
      .select('id, rank, is_fish, done, contact_id')
      .eq('plan_date', today)
      .eq('done', false)
      .order('rank');

    if (planErr) { setErr(planErr.message); setLoading(false); return; }

    // If plan is empty, run the scorer and reload
    if (!planRows || planRows.length === 0) {
      await supabase.rpc('score_contacts_for_today');
      const { data: planRows2 } = await supabase.from('daily_plan')
        .select('id, rank, is_fish, done, contact_id').eq('plan_date', today).eq('done', false).order('rank');
      setPlan(planRows2 || []);
      if (!planRows2?.length) { setLoading(false); return; }
      await fetchExtrasAndResearch(planRows2);
      return;
    }

    setPlan(planRows);
    await fetchExtrasAndResearch(planRows);
  }, []);

  async function fetchExtrasAndResearch(planRows) {
    const ids = planRows.map(r => r.contact_id);

    // 2. Contact details
    const { data: contacts } = await supabase
      .from('platform_contacts')
      .select('id, full_name, company_node, job_title, email, phone, current_temp, contact_tier, follow_up_at, outreach_window_active, outreach_window_expires_at, notes_thread, ingestion_source, encounter_date, created_at, relationship_status, linkedin_url, instagram_handle')
      .in('id', ids);

    // 3. Live temperature trend (simple: compare current_temp to 7 days ago from notes)
    const extrasMap = {};
    (contacts || []).forEach(c => {
      const thread = parseThread(c.notes_thread);
      const now = Date.now(); const week = 7*86400000;
      let recentWeight = 0;
      thread.forEach(e => {
        if (new Date(e.timestamp).getTime() > now - week) recentWeight += 1;
      });
      extrasMap[c.id] = { ...c, trend: recentWeight > 0 ? 'up' : 'flat', live_temp: Number(c.current_temp || 0) };
    });
    setExtras(extrasMap);

    // 4. Research snippets (most recent news_trigger or outreach_angle per contact)
    const { data: researchRows } = await supabase
      .from('contact_research')
      .select('contact_id, content, research_type, created_at')
      .in('contact_id', ids)
      .in('research_type', ['news_trigger', 'outreach_angle'])
      .eq('is_current', true)
      .order('created_at', { ascending: false });

    const rMap = {};
    (researchRows || []).forEach(r => {
      if (!rMap[r.contact_id]) rMap[r.contact_id] = r.content.slice(0, 100) + (r.content.length > 100 ? '…' : '');
    });
    setResearchMap(rMap);
    setErr('');
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, [loadAll]);

  async function toggleFish(contactId, makeFish) {
    // Can only have 3 fish
    const fishCount = plan.filter(r => r.is_fish).length;
    if (makeFish && fishCount >= 3) return;
    const row = plan.find(r => r.contact_id === contactId);
    if (!row) return;
    await supabase.from('daily_plan').update({ is_fish: makeFish }).eq('id', row.id);
    setPlan(prev => prev.map(r => r.contact_id === contactId ? { ...r, is_fish: makeFish } : r));
  }

  async function markDone(contactId) {
    const row = plan.find(r => r.contact_id === contactId);
    if (!row) return;
    await supabase.from('daily_plan').update({ done: true }).eq('id', row.id);
    setPlan(prev => prev.filter(r => r.contact_id !== contactId));
  }

  async function refreshPlan() {
    await supabase.rpc('score_contacts_for_today');
    loadAll();
  }

  if (loading) return <div className="spinner" />;

  const fish  = plan.filter(r => r.is_fish);
  const ten   = plan.filter(r => !r.is_fish);
  const fishNeeded = 3 - fish.length;

  const renderCard = (row) => {
    const c = extras[row.contact_id];
    if (!c) return null;
    const task = taskForContact(c, researchMap);
    return (
      <ActionCard
        key={row.id}
        c={c}
        task={task}
        isFish={row.is_fish}
        onFishToggle={toggleFish}
        onDone={markDone}
        onClick={() => navigate(`/contact/${c.id}`)}
      />
    );
  };

  return (
    <div>
      {/* ── HEADER ─────────────────────────────────────── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
        <div>
          <div style={{ fontSize:'.6rem', color:'var(--text-muted)', letterSpacing:'2px', textTransform:'uppercase', marginBottom:2 }}>Command Center</div>
          <div style={{ fontSize:'1.05rem', fontWeight:700 }}>{greeting}, Charles.</div>
        </div>
        <button onClick={refreshPlan} style={{ background:'none', border:'1px solid var(--border)', borderRadius:6, padding:'6px 10px', cursor:'pointer', fontSize:'.6rem', color:'var(--text-muted)', fontFamily:'var(--font)', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase' }}>
          Refresh
        </button>
      </div>

      {err && (
        <div style={{ padding:'10px 12px', marginBottom:12, background:'rgba(207,102,121,.12)', border:'1px solid rgba(207,102,121,.3)', borderRadius:6, color:'#CF6679', fontSize:'.7rem' }}>
          {err}
        </div>
      )}

      {/* ── ZONE 1: THREE FISH ─────────────────────────── */}
      <div style={{ marginBottom:4 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div style={{ fontSize:'.62rem', fontWeight:700, color:'#03DAC6', letterSpacing:'2px', textTransform:'uppercase' }}>
            🐟 Three Fish {fish.length > 0 ? `(${fish.length}/3)` : ''}
          </div>
          {fishNeeded > 0 && (
            <div style={{ fontSize:'.58rem', color:'var(--text-muted)' }}>
              Tap 🐟 on {fishNeeded} card{fishNeeded>1?'s':''} below to designate
            </div>
          )}
        </div>
        {fish.length === 0 ? (
          <div style={{ padding:'10px 14px', background:'rgba(3,218,198,.05)', border:'1px dashed rgba(3,218,198,.25)', borderRadius:8, fontSize:'.72rem', color:'var(--text-muted)', marginBottom:8 }}>
            Tap the 🐟 icon on any card to make it one of today's Three Fish.
          </div>
        ) : (
          fish.map(row => renderCard(row))
        )}
      </div>

      {/* ── ZONE 2: REPLIES OWED ───────────────────────── */}
      {plan.some(r => extras[r.contact_id]?.pending_log_confirmation) && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:'.62rem', fontWeight:700, color:'#EF5350', letterSpacing:'2px', textTransform:'uppercase', marginBottom:8 }}>
            💬 Replies Owed
          </div>
          {plan.filter(r => extras[r.contact_id]?.pending_log_confirmation).map(row => renderCard(row))}
        </div>
      )}

      {/* ── ZONE 3-4: TOP TEN ──────────────────────────── */}
      {ten.length > 0 && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:'.62rem', fontWeight:700, color:'var(--accent-silver)', letterSpacing:'2px', textTransform:'uppercase', marginBottom:8 }}>
            Today's Ten
          </div>
          {ten.map(row => renderCard(row))}
        </div>
      )}

      {plan.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <div>All clear. Tap Refresh to re-score.</div>
        </div>
      )}
    </div>
  );
}
