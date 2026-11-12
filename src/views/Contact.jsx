import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  tempColor, tempLabel, tempInfo, tierLabel, tierFullLabel,
  relativeDate, formatDate, parseDate, daysSince,
  appendNote, must, parseThread, EVENT_META,
  AFFINITY_LABELS, PIPELINE_STAGES, stageLabel, localDateISO,
  INGESTION_LABELS, getTouchNumber,
} from '../lib/helpers';

// ── Toast ──────────────────────────────────────────────────
function useToast() {
  const [msg, setMsg] = useState('');
  const [visible, setVisible] = useState(false);
  const t = useRef(null);
  const show = useCallback((m) => {
    setMsg(m); setVisible(true);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setVisible(false), 3000);
  }, []);
  return { msg, visible, show };
}

const COMM_OPTIONS = [
  { key:'phone',    icon:'📞', label:'Call',      href:(c) => c.phone            ? `tel:${c.phone}`              : null, noteType:'phone_call'    },
  { key:'sms',      icon:'💬', label:'Text',      href:(c) => c.phone            ? `sms:${c.phone}`              : null, noteType:'text_exchange' },
  { key:'email',    icon:'📧', label:'Email',     href:(c) => c.email            ? `mailto:${c.email}`           : null, noteType:'email_received'},
  { key:'whatsapp', icon:'🟢', label:'WhatsApp',  href:(c) => (c.whatsapp_number||c.phone) ? `https://wa.me/${(c.whatsapp_number||c.phone).replace(/\D/g,'')}` : null, noteType:'text_exchange'},
  { key:'facetime', icon:'📱', label:'FaceTime',  href:(c) => c.phone            ? `facetime:${c.phone}`         : null, noteType:'video_call'    },
  { key:'linkedin', icon:'💼', label:'LinkedIn',  href:(c) => c.linkedin_url     ? (c.linkedin_url.startsWith('http')?c.linkedin_url:`https://${c.linkedin_url}`) : null, noteType:'outreach'},
  { key:'instagram',icon:'📸', label:'Instagram', href:(c) => c.instagram_handle ? `https://ig.me/m/${c.instagram_handle.replace('@','')}` : null, noteType:'outreach'},
  { key:'booking',  icon:'📅', label:'Book',      href:(c) => c.booking_url      ? c.booking_url                 : null, noteType:'meeting_set'   },
];

const OUTCOMES = [
  { key:'meeting',         label:'Great Meeting',     icon:'🤝', temp:'+15°' },
  { key:'phone_call',      label:'Good Conversation', icon:'📞', temp:'+12°' },
  { key:'positive_signal', label:'Positive Signal',   icon:'✅', temp:'+6°'  },
  { key:'voicemail_left',  label:'Left Voicemail',    icon:'📱', temp:'+2°'  },
  { key:'no_answer',       label:'No Answer',         icon:'📵', temp:'+1°'  },
];

const TOUCH_SCHEDULE = [
  { n:1, label:'Thank-You',          days:1,  ch:'email' },
  { n:2, label:'Who We Are',         days:5,  ch:'email' },
  { n:3, label:'Researched Value',   days:14, ch:'email' },
  { n:4, label:'Check-In',           days:30, ch:'email' },
  { n:5, label:'Invitation',         days:45, ch:'email' },
  { n:6, label:'The Ask',            days:75, ch:'email' },
  { n:7, label:'Follow-Through',     days:90, ch:'email' },
];

export default function Contact() {
  const { id } = useParams();
  const toast = useToast();

  const [contact,      setContact]      = useState(null);
  const [notes,        setNotes]        = useState([]);
  const [pipelines,    setPipelines]    = useState([]);
  const [releases,     setReleases]     = useState([]);
  const [research,     setResearch]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [editMode,     setEditMode]     = useState(false);
  const [editFields,   setEditFields]   = useState({});
  const [returnPrompt, setReturnPrompt] = useState(false);
  const [pendingComm,  setPendingComm]  = useState(null);
  const [outcomeSheet, setOutcomeSheet] = useState(false);
  const [sloaneRelay,  setSloaneRelay]  = useState(false);
  const [relayText,    setRelayText]    = useState('');
  const [addPipeSheet, setAddPipeSheet] = useState(false);
  const [newPipe,      setNewPipe]      = useState({ entity:'NMC', pitch_type:'brand_campaign' });
  const [newAssociate, setNewAssociate] = useState('');
  const [researchOpen,  setResearchOpen]  = useState(false);
  const [reresearching, setReresearching] = useState(false);
  const [newResearch,  setNewResearch]  = useState({ type:'person', content:'' });

  useEffect(() => {
    loadContact();
    const ch = supabase.channel(`contact-${id}`)
      .on('postgres_changes',{ event:'UPDATE', schema:'public', table:'platform_contacts', filter:`id=eq.${id}` }, loadContact)
      .on('postgres_changes',{ event:'INSERT', schema:'public', table:'contact_research',  filter:`contact_id=eq.${id}` }, loadContact)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [id]);

  useEffect(() => {
    const handler = () => { if (document.visibilityState==='visible' && pendingComm) setReturnPrompt(true); };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [pendingComm]);

  async function loadContact() {
    const [{ data:c }, { data:rel }, { data:res }] = await Promise.all([
      supabase.from('platform_contacts').select('*').eq('id',id).single(),
      supabase.from('model_releases').select('id,first_name,last_name,classification,signing_date,status,ai_addendum_signed,ai_rights_deferred,is_minor').eq('email', '').maybeSingle().then(() => ({data:[]})), // placeholder until email join below
      supabase.from('contact_research').select('*').eq('contact_id',id).order('created_at',{ascending:false}),
    ]);
    if (!c) { setLoading(false); return; }
    setContact(c);

    // Releases by email
    if (c.email) {
      const { data:relRows } = await supabase.from('model_releases')
        .select('id,first_name,last_name,classification,signing_date,status,ai_addendum_signed,ai_rights_deferred,is_minor,created_at')
        .eq('email', c.email).order('created_at',{ascending:false});
      setReleases(relRows||[]);
    }

    setResearch(res||[]);
    const thread = parseThread(c.notes_thread);
    setNotes(thread.slice().reverse());
    setEditFields({
      next_action:          c.next_action         || '',
      follow_up_at:         c.follow_up_at        || localDateISO(),
      relationship_status:  c.relationship_status || 'active',
      contact_tier:         c.contact_tier        || 4,
      connection_rationale: c.connection_rationale|| '',
    });

    const { data:p } = await supabase.from('pipeline').select('*').eq('contact_id',id).order('created_at',{ascending:false});
    setPipelines(p||[]);
    setLoading(false);
  }

  // ── Funnel next step ───────────────────────────────────────
  function getFunnelNext(c, thread) {
    if (!c) return null;
    if (c.outreach_window_active && c.outreach_window_expires_at && new Date(c.outreach_window_expires_at) > new Date()) {
      const hrs = ((new Date(c.outreach_window_expires_at)-new Date())/3600000).toFixed(0);
      return { label:`⚡ News trigger — act within ${hrs}h`, color:'#EF5350', urgent:true };
    }
    const touchesDone = getTouchNumber(thread);
    const next = TOUCH_SCHEDULE[touchesDone];
    if (!next) {
      if (c.follow_up_at) return { label:`180-day review · ${formatDate(c.follow_up_at)}`, color:'var(--text-muted)', urgent:false };
      return { label:'All 7 touches complete — schedule review', color:'var(--text-muted)', urgent:false };
    }
    const created = c.encounter_date ? parseDate(c.encounter_date) : new Date(c.created_at);
    const dueDate = new Date(created.getTime() + next.days*86400000);
    const daysLeft = Math.round((dueDate-new Date())/86400000);
    const urgent = daysLeft <= 0;
    return {
      label:`T${next.n} · ${next.label} · ${urgent ? `${Math.abs(daysLeft)}d overdue` : `due ${formatDate(dueDate)}`}`,
      color: urgent ? '#EF5350' : daysLeft <= 3 ? '#FFB74D' : 'var(--accent-green)',
      touch: next,
      daysLeft,
      urgent,
    };
  }

  async function attempt(label, fn) {
    try { await fn(); return true; }
    catch(e) { toast.show(`${label} failed: ${e.message||e}`); return false; }
  }

  async function initiateComm(opt) {
    const href = opt.href(contact);
    if (!href) { toast.show('No contact info for this channel'); return; }
    setPendingComm(opt);
    await attempt('Logging', async () => {
      await appendNote(id, { type:'initiated_outreach', note:`Initiated ${opt.label} via AuraCRM`, author:'charles' });
      await must(supabase.from('platform_contacts').update({ pending_log_confirmation:true }).eq('id',id));
    });
    window.location.href = href;
  }

  async function logOutcome(key) {
    setOutcomeSheet(false); setReturnPrompt(false);
    const label = OUTCOMES.find(o=>o.key===key)?.label||key;
    const ok = await attempt('Logging', async () => {
      await appendNote(id, { type:key, note:`${label} logged from AuraCRM.`, author:'charles' });
      await must(supabase.from('platform_contacts').update({ pending_log_confirmation:false }).eq('id',id));
    });
    setPendingComm(null);
    if (ok) { toast.show('Logged ✓'); loadContact(); }
  }

  async function logNoAnswer() {
    setReturnPrompt(false);
    const ok = await attempt('Logging', async () => {
      await appendNote(id, { type:'no_answer', note:'No answer.', author:'charles' });
      await must(supabase.from('platform_contacts').update({ pending_log_confirmation:false }).eq('id',id));
    });
    setPendingComm(null);
    if (ok) { toast.show('No answer logged'); loadContact(); }
  }

  async function submitRelay() {
    if (!relayText.trim()) return;
    const ok = await attempt('Sending', () => appendNote(id, { type:'pending_log', note:relayText.trim(), author:'charles', pending_sloane_review:true }));
    if (!ok) return;
    setRelayText(''); setSloaneRelay(false);
    toast.show('Sent to Sloane ✓'); loadContact();
  }

  async function saveEdits() {
    const ok = await attempt('Saving', () => must(supabase.from('platform_contacts').update({
      next_action:          editFields.next_action,
      follow_up_at:         editFields.follow_up_at,
      relationship_status:  editFields.relationship_status,
      contact_tier:         parseInt(editFields.contact_tier),
      connection_rationale: editFields.connection_rationale,
      updated_at:           new Date().toISOString(),
    }).eq('id',id)));
    if (!ok) return;
    setEditMode(false); toast.show('Saved ✓'); loadContact();
  }

  async function addAssociate() {
    const name = newAssociate.trim();
    if (!name) return;
    const existing = Array.isArray(contact.associates) ? contact.associates : [];
    if (existing.includes(name)) { setNewAssociate(''); return; }
    const ok = await attempt('Adding', () => must(supabase.from('platform_contacts').update({ associates:[...existing, name], updated_at:new Date().toISOString() }).eq('id',id)));
    if (!ok) return;
    setNewAssociate(''); toast.show('Added ✓'); loadContact();
  }

  async function removeAssociate(name) {
    const existing = Array.isArray(contact.associates) ? contact.associates : [];
    await attempt('Removing', () => must(supabase.from('platform_contacts').update({ associates:existing.filter(a=>a!==name), updated_at:new Date().toISOString() }).eq('id',id)));
    loadContact();
  }

  async function addPipeline() {
    const stages = PIPELINE_STAGES[newPipe.entity]?.[newPipe.pitch_type]||[];
    const ok = await attempt('Adding pipeline', () => must(supabase.from('pipeline').insert({
      contact_id:id, entity:newPipe.entity, pitch_type:newPipe.pitch_type,
      stage:stages[0]||'relationship', temp_at_stage_entry:contact?.current_temp, assigned_to:'charles',
    })));
    if (!ok) return;
    setAddPipeSheet(false); toast.show('Pipeline added ✓'); loadContact();
  }

  async function advanceStage(pipe) {
    const stages = PIPELINE_STAGES[pipe.entity]?.[pipe.pitch_type]||[];
    const idx = stages.indexOf(pipe.stage);
    if (idx<0||idx>=stages.length-1) { toast.show('Already at final stage'); return; }
    const ok = await attempt('Advancing', () => must(supabase.from('pipeline').update({
      stage:stages[idx+1], stage_entered_at:new Date().toISOString(),
      temp_at_stage_entry:contact?.current_temp, updated_at:new Date().toISOString(),
    }).eq('id',pipe.id)));
    if (ok) { toast.show(`Advanced → ${stageLabel(stages[idx+1])}`); loadContact(); }
  }

  async function runReresearch() {
    setReresearching(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        'https://vpqglsjocmqrsgsmetip.supabase.co/functions/v1/august-research',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({ contact_id: id, name: contact?.full_name, company: contact?.company_node, job_title: contact?.job_title, trigger: 'manual' })
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.show(`Research updated · ${data.entries} entries${data.news ? ' · ⚡ News found' : ''}`);
      loadContact();
    } catch (e) { toast.show(`Re-research failed: ${e.message}`); }
    setReresearching(false);
  }

  async function saveResearch() {
    if (!newResearch.content.trim()) return;
    const ok = await attempt('Saving', () => must(supabase.from('contact_research').insert({
      contact_id:id, research_type:newResearch.type, content:newResearch.content.trim(),
      sources:[], author:'sloane', is_current:true,
    })));
    if (!ok) return;
    setNewResearch({type:'person',content:''}); setResearchOpen(false);
    toast.show('Research saved ✓'); loadContact();
  }

  if (loading) return <div className="spinner" />;
  if (!contact) return <div className="empty-state"><div>Contact not found.</div></div>;

  const tInfo = tempInfo(contact);
  const liveTemp = tInfo.temp;
  const tr = { up:['↗','#03DAC6'], down:['↘','#CF6679'], flat:['→','#666'] }[tInfo.trend]||['→','#666'];
  const preferred = contact.preferred_comm_channel;
  const thread = parseThread(contact.notes_thread);
  const funnelNext = getFunnelNext(contact, thread);
  const touchesDone = getTouchNumber(thread);
  const ingestionLabel = INGESTION_LABELS[contact.ingestion_source] || contact.ingestion_source || 'Unknown';
  const associates = Array.isArray(contact.associates) ? contact.associates : [];

  const chip = { fontSize:'.55rem', color:'var(--text-muted)', background:'var(--bg-primary)', border:'1px solid var(--border)', padding:'2px 7px', borderRadius:3, fontWeight:700 };

  return (
    <div>
      {/* ── IDENTITY ─────────────────────────────────────── */}
      <div className="panel" style={{ marginBottom:10 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:800, fontSize:'1.05rem', marginBottom:3 }}>{contact.full_name}</div>
            {contact.company_node && <div style={{ fontSize:'.8rem', color:'var(--accent-silver)', marginBottom:2 }}>{contact.company_node}</div>}
            {contact.job_title && <div style={{ fontSize:'.72rem', color:'var(--text-muted)', marginBottom:6 }}>{contact.job_title}</div>}
            <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
              <span style={chip}>{tierFullLabel(contact.contact_tier)}</span>
              <span style={chip}>{ingestionLabel}</span>
              <span style={{ ...chip, textTransform:'capitalize' }}>{contact.relationship_status?.replace(/_/g,' ')}</span>
              {contact.encounter_date && <span style={chip}>Met {formatDate(contact.encounter_date)} · {daysSince(contact.encounter_date)}d</span>}
            </div>
          </div>
          <div style={{ textAlign:'right', flexShrink:0, marginLeft:12 }}>
            <div style={{ display:'flex', alignItems:'baseline', gap:4, justifyContent:'flex-end' }}>
              <span style={{ color:tr[1], fontWeight:800, fontSize:'1.1rem' }}>{tr[0]}</span>
              <span style={{ fontWeight:800, fontSize:'1.35rem', color:tempColor(liveTemp) }}>{liveTemp.toFixed(1)}°</span>
            </div>
            <div style={{ fontSize:'.55rem', color:tempColor(liveTemp), fontWeight:700, letterSpacing:'.8px', marginTop:2 }}>{tempLabel(liveTemp)}</div>
            <div style={{ fontSize:'.55rem', color:'var(--text-muted)', marginTop:4 }}>T{touchesDone} complete</div>
          </div>
        </div>
        {/* Contact info */}
        {[
          contact.email        && { icon:'📧', val:contact.email,              href:`mailto:${contact.email}` },
          contact.phone        && { icon:'📞', val:contact.phone,              href:`tel:${contact.phone}` },
          contact.website      && { icon:'🌐', val:contact.website,            href:contact.website.startsWith('http')?contact.website:`https://${contact.website}` },
          contact.linkedin_url && { icon:'💼', val:'LinkedIn',                 href:contact.linkedin_url.startsWith('http')?contact.linkedin_url:`https://${contact.linkedin_url}` },
          contact.instagram_handle && { icon:'📸', val:`@${contact.instagram_handle}`, href:`https://instagram.com/${contact.instagram_handle.replace('@','')}` },
        ].filter(Boolean).map((r,i) => (
          <a key={i} href={r.href} target="_blank" rel="noreferrer"
            style={{ display:'flex', alignItems:'center', gap:6, fontSize:'.68rem', color:'var(--text-muted)', textDecoration:'none', marginBottom:3 }}>
            <span>{r.icon}</span><span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.val}</span>
          </a>
        ))}
      </div>

      {/* ── FUNNEL NEXT STEP ─────────────────────────────── */}
      {funnelNext && (
        <div style={{ padding:'10px 14px', marginBottom:10, background:funnelNext.urgent?'rgba(239,83,80,.1)':'rgba(3,218,198,.07)', border:`1px solid ${funnelNext.urgent?'rgba(239,83,80,.4)':'rgba(3,218,198,.3)'}`, borderRadius:8 }}>
          <div style={{ fontSize:'.6rem', fontWeight:700, color:'var(--text-muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:4 }}>Next Step</div>
          <div style={{ fontSize:'.82rem', fontWeight:700, color:funnelNext.color }}>{funnelNext.label}</div>
          {contact.next_action && <div style={{ fontSize:'.7rem', color:'var(--text-muted)', marginTop:4, lineHeight:1.4 }}>{contact.next_action}</div>}
          {contact.follow_up_at && !funnelNext.urgent && <div style={{ fontSize:'.62rem', color:'#FFB74D', marginTop:3 }}>↩ {formatDate(contact.follow_up_at)}</div>}
        </div>
      )}

      {/* ── COMM BUTTONS ─────────────────────────────────── */}
      <div className="panel" style={{ marginBottom:10 }}>
        <div className="comm-row">
          {COMM_OPTIONS.filter(o=>!!o.href(contact)).map(opt => (
            <button key={opt.key} className={`comm-btn${preferred===opt.key?' preferred':''}`} onClick={()=>initiateComm(opt)}>
              <span className="comm-icon">{opt.icon}</span>{opt.label}
            </button>
          ))}
        </div>
        <button className="btn btn-outline btn-sm" style={{ width:'100%', marginTop:6 }} onClick={()=>setSloaneRelay(true)}>
          📋 Log for Sloane
        </button>
      </div>

      {/* ── RELEASES ─────────────────────────────────────── */}
      {releases.length > 0 && (
        <div className="panel" style={{ marginBottom:10 }}>
          <div className="panel-title">Model Releases ({releases.length})</div>
          {releases.map(r => (
            <div key={r.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid var(--border-light)' }}>
              <div>
                <div style={{ fontSize:'.75rem', fontWeight:700 }}>{r.first_name} {r.last_name}</div>
                <div style={{ fontSize:'.62rem', color:'var(--text-muted)' }}>
                  {r.classification} · {r.is_minor ? (r.ai_rights_deferred?'AI deferred':'') : (r.ai_addendum_signed?'AI addendum signed':'No addendum')}
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:'.6rem', color: r.status==='COMPLETED'?'#03DAC6':'#FFB74D', fontWeight:700 }}>{r.status}</div>
                <div style={{ fontSize:'.55rem', color:'var(--text-muted)' }}>{r.signing_date}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── RESEARCH & INTEL ─────────────────────────────── */}
      <div className="panel" style={{ marginBottom:10 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div className="panel-title" style={{ marginBottom:0 }}>Research & Intel</div>
          <button onClick={runReresearch} disabled={reresearching} className="btn btn-ghost btn-sm" style={{ color:'#FFB74D', marginRight:6 }}>
            {reresearching ? '…' : '🔄'}
          </button>
          <button className="btn btn-ghost btn-sm" style={{ color:'var(--accent-green)' }} onClick={()=>setResearchOpen(!researchOpen)}>
            {researchOpen ? 'Cancel' : '+ Add'}
          </button>
        </div>
        {researchOpen && (
          <div style={{ marginBottom:10, padding:10, background:'var(--bg-primary)', borderRadius:6 }}>
            <div className="input-group">
              <label>Type</label>
              <select className="hud-in" value={newResearch.type} onChange={e=>setNewResearch(p=>({...p,type:e.target.value}))}>
                {['company','person','industry','outreach_angle','pitch_content','mutual_connections','news_trigger','enrichment'].map(t=>(
                  <option key={t} value={t}>{t.replace(/_/g,' ')}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label>Notes</label>
              <textarea className="hud-in" style={{ minHeight:80 }} value={newResearch.content} onChange={e=>setNewResearch(p=>({...p,content:e.target.value}))} />
            </div>
            <button className="btn btn-outline-green btn-sm" style={{ width:'100%' }} onClick={saveResearch}>Save Research Entry</button>
          </div>
        )}
        {research.length===0 ? (
          <div style={{ fontSize:'.7rem', color:'var(--text-muted)', padding:'4px 0' }}>No research yet. August will add entries here.</div>
        ) : research.map(r => (
          <div key={r.id} style={{ padding:'8px 0', borderBottom:'1px solid var(--border-light)', opacity:r.is_current?1:.5 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
              <span style={{ fontSize:'.6rem', fontWeight:700, color: r.research_type==='news_trigger'?'#EF5350':'var(--accent-silver)', textTransform:'uppercase', letterSpacing:'.8px' }}>
                {r.research_type==='news_trigger'?'⚡ ':''}{r.research_type.replace(/_/g,' ')}
              </span>
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                {r.author === 'august_automated' && <span style={{ fontSize:'.5rem', background:'rgba(255,183,77,.15)', color:'#FFB74D', border:'1px solid rgba(255,183,77,.3)', padding:'1px 5px', borderRadius:3, fontWeight:700 }}>AUTO</span>}
                <span style={{ fontSize:'.55rem', color:'var(--text-muted)' }}>{r.author === 'august_automated' ? 'August' : r.author} · {relativeDate(r.created_at)}</span>
              </div>
            </div>
            <div style={{ fontSize:'.75rem', color:'var(--accent-silver)', lineHeight:1.5, whiteSpace:'pre-wrap' }}>{r.content}</div>
            {r.sources?.length>0 && r.sources.map((s,i)=>(
              <a key={i} href={s.url} target="_blank" rel="noreferrer" style={{ display:'block', fontSize:'.62rem', color:'var(--accent-green)', marginTop:2 }}>🔗 {s.url}</a>
            ))}
          </div>
        ))}
      </div>

      {/* ── ASSOCIATES ───────────────────────────────────── */}
      <div className="panel" style={{ marginBottom:10 }}>
        <div className="panel-title">Associates</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
          {associates.map(a=>(
            <span key={a} style={{ display:'inline-flex', alignItems:'center', gap:4, background:'var(--bg-primary)', border:'1px solid var(--border)', borderRadius:4, padding:'3px 8px', fontSize:'.68rem', color:'var(--accent-silver)' }}>
              {a}
              <button onClick={()=>removeAssociate(a)} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:'.7rem', padding:0, lineHeight:1 }}>✕</button>
            </span>
          ))}
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <input className="hud-in" style={{ flex:1 }} value={newAssociate} onChange={e=>setNewAssociate(e.target.value)} placeholder="Name or @handle" onKeyDown={e=>{ if(e.key==='Enter'){e.preventDefault();addAssociate();} }} />
          <button className="btn btn-outline btn-sm" onClick={addAssociate}>Add</button>
        </div>
        <div style={{ fontSize:'.55rem', color:'var(--text-muted)', marginTop:5 }}>Free-text. Linked CRM contacts coming in Phase 1.</div>
      </div>

      {/* ── CRM FIELDS ───────────────────────────────────── */}
      <div className="panel" style={{ marginBottom:10 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div className="panel-title" style={{ marginBottom:0 }}>CRM Fields</div>
          <button className="btn btn-ghost btn-sm" onClick={()=>setEditMode(!editMode)}>{editMode?'Cancel':'Edit'}</button>
        </div>
        {editMode ? (
          <>
            <div className="input-group"><label>Next Action</label><textarea className="hud-in" value={editFields.next_action} onChange={e=>setEditFields(p=>({...p,next_action:e.target.value}))} /></div>
            <div className="input-group"><label>Networking Notes</label><textarea className="hud-in" value={editFields.connection_rationale} onChange={e=>setEditFields(p=>({...p,connection_rationale:e.target.value}))} /></div>
            <div className="grid-2">
              <div className="input-group"><label>Follow-Up Date</label><input type="date" className="hud-in" value={editFields.follow_up_at} onChange={e=>setEditFields(p=>({...p,follow_up_at:e.target.value}))} /></div>
              <div className="input-group"><label>Tier</label>
                <select className="hud-in" value={editFields.contact_tier} onChange={e=>setEditFields(p=>({...p,contact_tier:e.target.value}))}>
                  <option value={1}>T1 — Primary</option><option value={2}>T2 — High Value</option>
                  <option value={3}>T3 — Maintenance</option><option value={4}>T4 — Unqualified</option>
                </select>
              </div>
            </div>
            <div className="input-group"><label>Relationship Status</label>
              <select className="hud-in" value={editFields.relationship_status} onChange={e=>setEditFields(p=>({...p,relationship_status:e.target.value}))}>
                {['active','nurture','paused','disqualified','do_not_contact','archived'].map(s=>(
                  <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>
                ))}
              </select>
            </div>
            <button className="btn btn-silver" onClick={saveEdits}>Save Changes</button>
          </>
        ) : (
          <>
            {contact.next_action && (
              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:'.58rem', color:'var(--text-muted)', letterSpacing:'1px', textTransform:'uppercase', marginBottom:3 }}>Next Action</div>
                <div style={{ fontSize:'.78rem', color:'var(--accent-silver)', lineHeight:1.5 }}>{contact.next_action}</div>
              </div>
            )}
            {contact.connection_rationale && (
              <div>
                <div style={{ fontSize:'.58rem', color:'var(--text-muted)', letterSpacing:'1px', textTransform:'uppercase', marginBottom:3 }}>Context</div>
                <div style={{ fontSize:'.75rem', color:'var(--text-muted)', lineHeight:1.5 }}>{contact.connection_rationale}</div>
              </div>
            )}
            {!contact.next_action && !contact.connection_rationale && (
              <div style={{ fontSize:'.72rem', color:'var(--text-muted)' }}>Tap Edit to add notes.</div>
            )}
          </>
        )}
      </div>

      {/* ── PIPELINE ─────────────────────────────────────── */}
      <div className="panel" style={{ marginBottom:10 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div className="panel-title" style={{ marginBottom:0 }}>Pipeline</div>
          <button className="btn btn-ghost btn-sm" onClick={()=>setAddPipeSheet(true)}>+ Add</button>
        </div>
        {pipelines.length===0 ? (
          <div style={{ fontSize:'.7rem', color:'var(--text-muted)' }}>No pipeline entries.</div>
        ) : pipelines.map(pipe=>{
          const stages=PIPELINE_STAGES[pipe.entity]?.[pipe.pitch_type]||[];
          const idx=stages.indexOf(pipe.stage);
          return (
            <div key={pipe.id} style={{ marginBottom:10, padding:10, background:'var(--bg-primary)', borderRadius:6, border:'1px solid var(--border-light)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <div>
                  <div style={{ fontSize:'.65rem', fontWeight:700, color:'var(--accent-silver)' }}>{pipe.entity} — {pipe.pitch_type.replace(/_/g,' ').toUpperCase()}</div>
                  <div style={{ fontSize:'.78rem', color:'var(--accent-green)', marginTop:1 }}>{stageLabel(pipe.stage)}</div>
                </div>
                <div style={{ fontSize:'.6rem', color:'var(--text-muted)', textAlign:'right' }}>{pipe.assigned_to}</div>
              </div>
              <div style={{ background:'var(--border)', borderRadius:2, height:3, marginBottom:5 }}>
                <div style={{ width:`${stages.length>1?(idx/(stages.length-1))*100:0}%`, background:'var(--accent-green)', height:'100%', borderRadius:2 }} />
              </div>
              {idx<stages.length-1 && (
                <button className="btn btn-ghost btn-sm" style={{ color:'var(--accent-green)', fontSize:'.6rem' }} onClick={()=>advanceStage(pipe)}>
                  Advance → {stageLabel(stages[idx+1])}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ── ACTIVITY THREAD ──────────────────────────────── */}
      <div className="panel" style={{ marginBottom:10 }}>
        <div className="panel-title">Activity · {notes.length} events</div>
        {notes.length===0 ? <div style={{ fontSize:'.72rem', color:'var(--text-muted)' }}>No activity yet.</div> :
          notes.map((n,i)=>{
            const meta=EVENT_META[n.type]||{emoji:'📝',label:n.type};
            return (
              <div key={i} className="note-event">
                <span className="note-emoji">{meta.emoji}</span>
                <div className="note-body">
                  <div className="note-type">{meta.label}</div>
                  {n.note && <div className="note-text">{n.note}</div>}
                  {n.pending_sloane_review && <div style={{ fontSize:'.58rem', color:'var(--accent-amber)', marginTop:2 }}>⏳ Pending Sloane</div>}
                  <div className="note-time">{n.author && <span style={{ color:'var(--text-muted)' }}>{n.author} · </span>}{relativeDate(n.timestamp)}</div>
                </div>
              </div>
            );
          })}
      </div>

      {/* ── TOAST ────────────────────────────────────────── */}
      <div className={`toast${toast.visible?' show':''}`}>{toast.msg}</div>

      {/* ── RETURN PROMPT ────────────────────────────────── */}
      <div className={`overlay${returnPrompt?' open':''}`}>
        <div className="sheet">
          <div className="sheet-handle" />
          <div style={{ textAlign:'center', marginBottom:16 }}>
            <div style={{ fontSize:'.78rem', fontWeight:700, color:'var(--accent-silver)', textTransform:'uppercase', letterSpacing:'1.5px', marginBottom:6 }}>Did you connect with</div>
            <div style={{ fontSize:'1.1rem', fontWeight:800 }}>{contact.full_name}?</div>
          </div>
          <button className="btn btn-outline-green" style={{ marginBottom:8 }} onClick={()=>{setReturnPrompt(false);setOutcomeSheet(true);}}>Yes — Log Outcome</button>
          <button className="btn btn-outline" style={{ width:'100%', marginBottom:8 }} onClick={logNoAnswer}>No Answer</button>
          <button className="btn btn-ghost" style={{ width:'100%' }} onClick={()=>{setReturnPrompt(false);setPendingComm(null);}}>Dismiss</button>
        </div>
      </div>

      {/* ── OUTCOME SHEET ────────────────────────────────── */}
      <div className={`overlay${outcomeSheet?' open':''}`}>
        <div className="sheet">
          <div className="sheet-handle" />
          <div style={{ fontSize:'.7rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', textAlign:'center', marginBottom:14 }}>Log Outcome</div>
          {OUTCOMES.map(o=>(
            <button key={o.key} onClick={()=>logOutcome(o.key)} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', marginBottom:8, background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:6, cursor:'pointer', fontFamily:'var(--font)', color:'var(--text-main)', fontSize:'.78rem', fontWeight:600 }}>
              <span>{o.icon} {o.label}</span>
              <span style={{ fontSize:'.62rem', color:'var(--accent-green)', fontWeight:700 }}>{o.temp}</span>
            </button>
          ))}
          <button className="btn btn-ghost" style={{ width:'100%' }} onClick={()=>setOutcomeSheet(false)}>Cancel</button>
        </div>
      </div>

      {/* ── SLOANE RELAY ─────────────────────────────────── */}
      <div className={`overlay${sloaneRelay?' open':''}`}>
        <div className="sheet">
          <div className="sheet-handle" />
          <div style={{ fontSize:'.7rem', fontWeight:700, color:'var(--accent-green)', textTransform:'uppercase', marginBottom:12 }}>Log for Sloane</div>
          <textarea className="hud-in" style={{ marginBottom:12, minHeight:90 }} placeholder="e.g. Just spoke with Sarah about Spring campaign pricing…" value={relayText} onChange={e=>setRelayText(e.target.value)} autoFocus />
          <button className="btn btn-outline-green" style={{ marginBottom:8 }} onClick={submitRelay} disabled={!relayText.trim()}>Send to Sloane</button>
          <button className="btn btn-ghost" style={{ width:'100%' }} onClick={()=>setSloaneRelay(false)}>Cancel</button>
        </div>
      </div>

      {/* ── ADD PIPELINE SHEET ───────────────────────────── */}
      <div className={`overlay${addPipeSheet?' open':''}`}>
        <div className="sheet">
          <div className="sheet-handle" />
          <div style={{ fontSize:'.7rem', fontWeight:700, color:'var(--accent-silver)', textTransform:'uppercase', marginBottom:14 }}>Add Pipeline Track</div>
          <div className="input-group"><label>Entity</label>
            <select className="hud-in" value={newPipe.entity} onChange={e=>setNewPipe(p=>({...p,entity:e.target.value,pitch_type:'brand_campaign'}))}>
              <option value="NMC">NMC — Creative Services</option>
              <option value="NFINITY">Nfinity — Studios</option>
            </select>
          </div>
          <div className="input-group"><label>Pitch Type</label>
            <select className="hud-in" value={newPipe.pitch_type} onChange={e=>setNewPipe(p=>({...p,pitch_type:e.target.value}))}>
              {Object.keys(PIPELINE_STAGES[newPipe.entity]||{}).map(pt=>(
                <option key={pt} value={pt}>{pt.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-outline-green" style={{ marginBottom:8 }} onClick={addPipeline}>Add Pipeline Track</button>
          <button className="btn btn-ghost" style={{ width:'100%' }} onClick={()=>setAddPipeSheet(false)}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
