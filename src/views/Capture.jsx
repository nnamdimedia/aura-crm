import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { localDateISO, parseThread } from '../lib/helpers';

const CLOUD_FUNCTION_URL = 'https://vpqglsjocmqrsgsmetip.supabase.co/functions/v1/auralens-processor';
const SUPABASE_ANON_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwcWdsc2pvY21xcnNnc21ldGlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNDkyNTMsImV4cCI6MjA5NzgyNTI1M30.zPnr72oc9aOsfomeFY7M8KqBSy68onvhfBxhBtrzwZs';

const CANONICAL_SCHEMA = [
  { key:'name',      label:'Full Name'       },
  { key:'title',     label:'Job Title'       },
  { key:'company',   label:'Company'         },
  { key:'email',     label:'Email Address'   },
  { key:'phone',     label:'Phone Number'    },
  { key:'website',   label:'Website URL'     },
  { key:'address',   label:'Physical Address'},
  { key:'instagram', label:'Instagram'       },
  { key:'linkedin',  label:'LinkedIn'        },
];

const PITCH_OPTIONS = [
  { value:'editorial',          label:'Editorial'          },
  { value:'brand_campaign',     label:'Brand Campaign'     },
  { value:'personal_marketing', label:'Personal Marketing' },
  { value:'studio_rental',      label:'Studio Rental'      },
  { value:'corporate_retainer', label:'Corp Retainer'      },
];

function fmt(str) {
  if (!str || typeof str !== 'string') return str || '';
  if (str.includes('@')) return str.toLowerCase().trim();
  return str.toLowerCase().split(' ').map(w => {
    if (!w) return '';
    if (['nyc','oh','llc','inc','f500','nmc'].includes(w)) return w.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

function preprocessForOCR(srcCanvas) {
  const out = document.createElement('canvas');
  out.width = srcCanvas.width; out.height = srcCanvas.height;
  const ctx = out.getContext('2d');
  ctx.drawImage(srcCanvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, out.width, out.height);
  const d = imgData.data;
  let minL=255,maxL=0,sumL=0;
  const lum = new Uint8Array(out.width * out.height);
  for (let i=0,j=0; i<d.length; i+=4,j++) {
    const L = Math.round(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]);
    lum[j]=L; if(L<minL)minL=L; if(L>maxL)maxL=L; sumL+=L;
  }
  const isDark = (sumL/(out.width*out.height)) < 128;
  const range  = (maxL-minL)||1;
  for (let i=0,j=0; i<d.length; i+=4,j++) {
    let v = Math.round((lum[j]-minL)*255/range);
    if (isDark) v=255-v;
    d[i]=d[i+1]=d[i+2]=v; d[i+3]=255;
  }
  ctx.putImageData(imgData,0,0);
  return out;
}

function rotateCanvas90(src) {
  const out = document.createElement('canvas');
  out.width=src.height; out.height=src.width;
  const ctx=out.getContext('2d');
  ctx.translate(out.width/2,out.height/2);
  ctx.rotate(Math.PI/2);
  ctx.drawImage(src,-src.width/2,-src.height/2);
  return out;
}

export default function Capture() {
  const navigate     = useNavigate();
  const videoRef     = useRef(null);
  const analyzerRef  = useRef(null);
  const streamRef    = useRef(null);
  const workerRef    = useRef(null);
  const bufferRef    = useRef([]);
  const timerRef     = useRef(null);
  const lastPixRef   = useRef(null);
  const pendingCommRef = useRef(false);

  const [cameraOn,     setCameraOn]     = useState(false);
  const [scanning,     setScanning]     = useState(false);
  const [status,       setStatus]       = useState('');
  const [profile,      setProfile]      = useState(null);
  const [duplicate,    setDuplicate]    = useState(null);
  const [sessionLog,   setSessionLog]   = useState([]);

  // CRM fields (review overlay)
  const [reviewFields, setReviewFields] = useState({});
  const [keywords,     setKeywords]     = useState('');
  const [tier,         setTier]         = useState(4);
  const [relStatus,    setRelStatus]    = useState('active');
  const [affinities,   setAffinities]   = useState([]);
  const [prefComm,     setPrefComm]     = useState('');
  const [nextAction,   setNextAction]   = useState('');
  const [followUpAt,   setFollowUpAt]   = useState('');
  const [rationale,    setRationale]    = useState('');
  const [locationMet,  setLocationMet]  = useState('');
  const [encDate,      setEncDate]      = useState(localDateISO());
  const [ecosystem,    setEcosystem]    = useState('NMC');
  const [cachedImg,    setCachedImg]    = useState('');

  useEffect(() => {
    // Preload Tesseract worker
    if (window.Tesseract) initWorker();
    return () => {
      killCamera();
      if (workerRef.current) workerRef.current.terminate().catch(()=>{});
    };
  }, []);

  async function initWorker() {
    try {
      if (workerRef.current) { try { await workerRef.current.terminate(); } catch {} }
      workerRef.current = await window.Tesseract.createWorker('eng');
    } catch { workerRef.current = null; }
  }

  const scanningRef = useRef(false);

  // Attach the camera stream to the <video> AFTER it has rendered.
  // The video element only exists once cameraOn is true, so it cannot be set earlier.
  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOn]);

  async function toggleCamera() {
    if (cameraOn) { killCamera(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 1280, height: 720 },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
      setStatus('Camera ready — tap Engage Scan Mode');
    } catch (e) {
      setStatus(`Camera error: ${e.message}`);
    }
  }

  function killCamera() {
    scanningRef.current = false;
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    streamRef.current = null;
    clearTimeout(timerRef.current);
    setCameraOn(false);
    setScanning(false);
    setStatus('');
  }

  function toggleScan() {
    if (!cameraOn) { setStatus('Activate camera first'); return; }
    if (scanningRef.current) {
      scanningRef.current = false;
      clearTimeout(timerRef.current);
      setScanning(false);
      setStatus('Scan paused');
      return;
    }
    bufferRef.current = [];
    lastPixRef.current = null;
    scanningRef.current = true;
    setScanning(true);
    setStatus('Scanning…');
    scanLoop();
    timerRef.current = setTimeout(() => { if (scanningRef.current) capture(); }, 1500);
  }

  function scanLoop() {
    if (!scanningRef.current) return;
    const actx = analyzerRef.current?.getContext('2d', { willReadFrequently: true });
    if (!actx || !videoRef.current) return;
    actx.drawImage(videoRef.current, 0, 0, 40, 30);
    const fd = actx.getImageData(0, 0, 40, 30).data;
    if (lastPixRef.current) {
      let delta = 0;
      for (let i = 0; i < fd.length; i += 4) delta += Math.abs(fd[i] - lastPixRef.current[i]);
      if (delta / 1200 < 32) {
        const rc = document.createElement('canvas');
        rc.width = 800;
        rc.height = Math.round((videoRef.current.videoHeight || 720) * (800 / (videoRef.current.videoWidth || 1280)));
        rc.getContext('2d').drawImage(videoRef.current, 0, 0, rc.width, rc.height);
        bufferRef.current.push({ canvas: rc, uri: rc.toDataURL('image/jpeg', .68), score: delta / 1200 });
        setStatus(`Locking… (${bufferRef.current.length}/2)`);
        if (bufferRef.current.length >= 2) { capture(); return; }
      }
    }
    lastPixRef.current = fd;
    setTimeout(scanLoop, 70);
  }

  async function capture() {
    scanningRef.current = false;
    clearTimeout(timerRef.current);
    setScanning(false);
    let canvas, uri;
    if (bufferRef.current.length === 0) {
      const rc = document.createElement('canvas'); rc.width = 800; rc.height = 450;
      rc.getContext('2d').drawImage(videoRef.current, 0, 0, 800, 450);
      canvas = rc; uri = rc.toDataURL('image/jpeg', .68);
    } else {
      bufferRef.current.sort((a, b) => a.score - b.score);
      canvas = bufferRef.current[0].canvas; uri = bufferRef.current[0].uri;
    }
    setCachedImg(uri);
    await runPipeline(canvas, uri);
  }

  async function runPipeline(canvas, uri) {
    setStatus('Running local OCR…');
    let rawText='', confidence=0;

    // Tesseract pass
    if (window.Tesseract) {
      try {
        if (!workerRef.current) await initWorker();
        const pre = preprocessForOCR(canvas);
        let res = workerRef.current
          ? await workerRef.current.recognize(pre)
          : await window.Tesseract.recognize(pre,'eng',{logger:()=>{}});
        const d = res.data;
        const avg = d.words?.length ? d.words.reduce((s,w)=>s+w.confidence,0)/d.words.length : 0;
        if (avg >= 40 && d.text?.length > 60) {
          rawText=d.text.trim(); confidence=avg;
        } else {
          const rot = rotateCanvas90(pre);
          const res2 = workerRef.current
            ? await workerRef.current.recognize(rot)
            : await window.Tesseract.recognize(rot,'eng',{logger:()=>{}});
          const d2=res2.data;
          const avg2=d2.words?.length ? d2.words.reduce((s,w)=>s+w.confidence,0)/d2.words.length : 0;
          if (avg2>avg) { rawText=d2.text?.trim()||''; confidence=avg2; }
          else { rawText=d.text?.trim()||''; confidence=avg; }
        }
      } catch {}
    }

    setStatus(rawText.length>60 ? `OCR ✓ (${Math.round(confidence)}%) — Structuring…` : 'OCR low — Vision mode…');

    // Edge function
    try {
      const { data:{ session } } = await supabase.auth.getSession();
      const res = await fetch(CLOUD_FUNCTION_URL, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'apikey':SUPABASE_ANON_KEY, 'Authorization':`Bearer ${session?.access_token}` },
        body:JSON.stringify({
          rawText: rawText.length>60 ? rawText : '',
          imagesBase64: rawText.length>60 ? [] : [uri],
        })
      });
      const fd = await res.json();
      if (!fd.success) throw new Error(fd.error);

      const p = fd.profile || {};
      setStatus('Checking duplicates…');

      // Duplicate check
      if (p.email || p.name) {
        const { data: dupes } = await supabase.rpc('find_similar_contacts',{
          p_name: p.name||'', p_email: p.email||''
        });
        if (dupes?.length > 0) {
          setDuplicate({ matches:dupes, profile:p });
          setStatus('');
          return;
        }
      }

      openReview(p);
    } catch(err) {
      setStatus(`Error: ${err.message}`);
    }
  }

  function openReview(p) {
    const fields = {};
    CANONICAL_SCHEMA.forEach(f => { fields[f.key] = fmt(p[f.key]||''); });
    setReviewFields(fields);
    setProfile(p);
    setStatus('');
    const d = new Date();
    setFollowUpAt(new Date(d.setDate(d.getDate()+3)).toISOString().split('T')[0]);
  }

  async function commit() {
    const email = reviewFields.email?.toLowerCase().trim()||null;
    const fullName = reviewFields.name?.trim()||'';
    if (!fullName && !email) { setStatus('Name or email required'); return; }

    const kws = keywords.trim() ? keywords.split(/[,\s]+/).filter(Boolean).map(t=>{
      t=t.replace(/\s+/g,''); if(!t.startsWith('#'))t='#'+t;
      return '#'+t.slice(1).charAt(0).toUpperCase()+t.slice(2);
    }) : [];
    if (locationMet) {
      const loc='#'+locationMet.trim().replace(/\s+/g,'').slice(0,18);
      if (!kws.includes(loc)) kws.unshift(loc);
    }

    const payload = {
      email, full_name:fullName,
      job_title:reviewFields.title||null,
      company_node:reviewFields.company||null,
      phone:reviewFields.phone||null,
      website:reviewFields.website||null,
      address:reviewFields.address||null,
      instagram_handle:reviewFields.instagram||null,
      linkedin_url:reviewFields.linkedin||null,
      ecosystem_target:ecosystem,
      location_met:locationMet||null,
      encounter_date:encDate||localDateISO(),
      custom_keywords:kws.length?kws:null,
      contact_tier:parseInt(tier),
      relationship_status:relStatus,
      pitch_affinity:affinities,
      preferred_comm_channel:prefComm||null,
      connection_rationale:rationale||null,
      next_action:nextAction||null,
      follow_up_at:followUpAt||null,
      ingestion_source:'auralens_scan',
      validation_status:'APPROVED',
      updated_at:new Date().toISOString(),
      notes_thread:[{
        type:'scan', note:`Scanned at ${locationMet||'location not set'}.`,
        author:'OPERATOR_AURALENS', timestamp:new Date().toISOString()
      }],
      metadata:{ kernel_version:'8.0', scan_mode:'SINGLE_SIDED', extraction_engine:'tesseract+claude' }
    };

    const { error } = await supabase.from('platform_contacts').upsert(payload,{onConflict:'email'});
    if (error) { setStatus(`Commit error: ${error.message}`); return; }

    setSessionLog(prev => [{ name:fullName, title:reviewFields.title, company:reviewFields.company, email, time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) }, ...prev]);
    setProfile(null); setDuplicate(null);
    setReviewFields({}); setAffinities([]); setRationale(''); setNextAction(''); setKeywords('');
    setStatus(`✓ ${fullName}`);
    setTimeout(()=>setStatus(''),3000);
  }

  // Duplicate merge
  async function mergeCommit(existingId) {
    const p   = duplicate.profile;
    const top = duplicate.matches[0];
    const { data:ex } = await supabase.from('platform_contacts').select('notes_thread,company_node,job_title').eq('id',existingId).single();
    const thread = parseThread(ex?.notes_thread).slice();
    const isJobChange = p.company && ex?.company_node && ex.company_node.toLowerCase()!==p.company.toLowerCase();
    thread.push(isJobChange ? {
      type:'job_change', previous_title:ex?.job_title||'', previous_company:ex?.company_node||'',
      new_title:p.title||'', new_company:p.company||'', author:'AURALENS_MERGE', timestamp:new Date().toISOString()
    } : {
      type:'re_scan', note:'Re-scanned at '+locationMet, author:'AURALENS_MERGE', timestamp:new Date().toISOString()
    });
    await supabase.from('platform_contacts').update({
      full_name:fmt(p.name||''), job_title:fmt(p.title||''), company_node:fmt(p.company||''),
      email:(p.email||'').toLowerCase().trim(), phone:p.phone||null,
      notes_thread:thread, updated_at:new Date().toISOString()
    }).eq('id',existingId);
    setDuplicate(null); setProfile(null);
    setStatus(`Merged: ${fmt(p.name||'')}`);
    setTimeout(()=>setStatus(''),3000);
  }

  // ── Review overlay ─────────────────────────────────────
  if (profile) return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <div style={{ fontWeight:700 }}>Review Card</div>
        <button className="btn btn-ghost btn-sm" onClick={()=>{setProfile(null);setStatus('')}}>✕ Discard</button>
      </div>
      {cachedImg && <img src={cachedImg} alt="" style={{ width:'100%', borderRadius:6, marginBottom:12, border:'1px solid var(--border)', objectFit:'contain', maxHeight:200 }} />}

      <div className="panel">
        <div className="panel-title">1. Branch</div>
        <div className="input-group" style={{ marginBottom:0 }}>
          <label>Ecosystem</label>
          <select className="hud-in" value={ecosystem} onChange={e=>setEcosystem(e.target.value)}>
            <option value="NMC">NMC — Creative Services</option>
            <option value="NFINITY">Nfinity — Studios</option>
          </select>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">2. Extracted Profile</div>
        {CANONICAL_SCHEMA.map(f=>(
          <div key={f.key} className="input-group">
            <label>{f.label}</label>
            <input type="text" className="hud-in" value={reviewFields[f.key]||''} onChange={e=>setReviewFields(p=>({...p,[f.key]:e.target.value}))} />
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-title">3. CRM Classification</div>
        <div className="grid-2" style={{ marginBottom:10 }}>
          <div className="input-group" style={{ marginBottom:0 }}>
            <label>Tier
              <span style={{ display:'block', fontSize:'.5rem', color:'var(--text-muted)', fontWeight:400, marginTop:2, lineHeight:1.4 }}>
                T1=Masthead/CMO/HNWI · T2=Brand mgr/press · T3=Collaborators · T4=Unqualified
              </span>
            </label>
            <select className="hud-in" value={tier} onChange={e=>setTier(e.target.value)}>
              <option value={1}>T1 — Primary Target</option>
              <option value={2}>T2 — High Value</option>
              <option value={3}>T3 — Maintenance</option>
              <option value={4}>T4 — Unqualified</option>
            </select>
          </div>
          <div className="input-group" style={{ marginBottom:0 }}>
            <label>Status</label>
            <select className="hud-in" value={relStatus} onChange={e=>setRelStatus(e.target.value)}>
              <option value="active">Active</option>
              <option value="nurture">Nurture</option>
            </select>
          </div>
        </div>
        <div className="input-group">
          <label>Pitch Affinity</label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
            {PITCH_OPTIONS.map(o=>(
              <button key={o.value} onClick={()=>setAffinities(prev=>prev.includes(o.value)?prev.filter(v=>v!==o.value):[...prev,o.value])}
                style={{ background:affinities.includes(o.value)?'rgba(3,218,198,.12)':'var(--bg-primary)', border:`1px solid ${affinities.includes(o.value)?'var(--accent-green)':'var(--border)'}`, color:affinities.includes(o.value)?'var(--accent-green)':'var(--text-muted)', padding:'7px', borderRadius:5, fontSize:'.6rem', fontWeight:700, cursor:'pointer', fontFamily:'var(--font)', textTransform:'uppercase', letterSpacing:'.5px' }}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="input-group" style={{ marginBottom:0 }}>
          <label>Preferred Comm Channel</label>
          <select className="hud-in" value={prefComm} onChange={e=>setPrefComm(e.target.value)}>
            <option value="">— Unknown —</option>
            {['email','phone','text','whatsapp','video','in_person'].map(c=><option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1).replace('_',' ')}</option>)}
          </select>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">4. Session + Notes</div>
        <div className="grid-2">
          <div className="input-group">
            <label>Location / Event</label>
            <input type="text" className="hud-in" value={locationMet} onChange={e=>setLocationMet(e.target.value)} placeholder="NYFW, conference…" />
          </div>
          <div className="input-group">
            <label>Encounter Date</label>
            <input type="date" className="hud-in" value={encDate} onChange={e=>setEncDate(e.target.value)} />
          </div>
        </div>
        <div className="input-group">
          <label>Keywords</label>
          <input type="text" className="hud-in" value={keywords} onChange={e=>setKeywords(e.target.value)} placeholder="#NYFW2026, #BrandCampaign" />
        </div>
        <div className="input-group">
          <label>Networking Notes</label>
          <textarea className="hud-in" value={rationale} onChange={e=>setRationale(e.target.value)} />
        </div>
        <div className="input-group">
          <label>Next Action</label>
          <textarea className="hud-in" value={nextAction} onChange={e=>setNextAction(e.target.value)} />
        </div>
        <div className="input-group" style={{ marginBottom:0 }}>
          <label>Follow-Up Date</label>
          <input type="date" className="hud-in" value={followUpAt} onChange={e=>setFollowUpAt(e.target.value)} />
        </div>
      </div>

      {status && <div style={{ fontSize:'.7rem', color:'var(--accent-red)', marginBottom:8, textAlign:'center' }}>{status}</div>}
      <button className="btn btn-silver" onClick={commit} style={{ marginBottom:8 }}>Confirm &amp; Commit</button>
      <button className="btn btn-outline-red" onClick={()=>{setProfile(null);setStatus('')}}>Discard</button>
    </div>
  );

  // Duplicate overlay
  if (duplicate) {
    const top = duplicate.matches[0];
    return (
      <div>
        <div style={{ fontWeight:700, marginBottom:14, fontSize:'.9rem' }}>Existing Record Detected</div>
        <div style={{ padding:'10px 12px', marginBottom:12, background:'rgba(239,83,80,.1)', border:'1px solid rgba(239,83,80,.3)', borderRadius:6, fontSize:'.68rem', color:'#EF5350', fontWeight:700, textTransform:'uppercase', letterSpacing:'.8px' }}>
          {top.match_type?.replace('_',' ')} — {top.full_name}
        </div>
        <div className="grid-2" style={{ marginBottom:14 }}>
          <div className="panel">
            <div style={{ fontSize:'.58rem', color:'var(--text-muted)', fontWeight:700, letterSpacing:'1px', marginBottom:6 }}>EXISTING</div>
            <div style={{ fontSize:'.72rem', color:'var(--accent-muted)', lineHeight:1.6 }}>
              <div>{top.full_name}</div>
              <div>{top.job_title}</div>
              <div>{top.company_node}</div>
              <div style={{ color:tempColor(top.current_temp), fontWeight:700 }}>{top.current_temp?.toFixed(1)}°</div>
            </div>
          </div>
          <div className="panel" style={{ borderColor:'var(--accent-green)' }}>
            <div style={{ fontSize:'.58rem', color:'var(--accent-green)', fontWeight:700, letterSpacing:'1px', marginBottom:6 }}>NEW SCAN</div>
            <div style={{ fontSize:'.72rem', color:'var(--accent-silver)', lineHeight:1.6 }}>
              <div>{duplicate.profile.name}</div>
              <div>{duplicate.profile.title}</div>
              <div>{duplicate.profile.company}</div>
            </div>
          </div>
        </div>
        <button className="btn btn-silver" style={{ marginBottom:8 }} onClick={()=>mergeCommit(top.id)}>Update Record</button>
        <button className="btn btn-outline" style={{ width:'100%', marginBottom:8 }} onClick={()=>{setDuplicate(null);openReview(duplicate.profile)}}>Not Same Person — New Contact</button>
        <button className="btn btn-outline-red" onClick={()=>{setDuplicate(null);setProfile(null);setStatus('')}}>Discard Scan</button>
      </div>
    );
  }

  // Main scan view
  return (
    <div>
      <div style={{ marginBottom:12 }}>
        <div style={{ fontSize:'.6rem', color:'var(--text-muted)', letterSpacing:'2px', textTransform:'uppercase', marginBottom:2 }}>Card Capture</div>
        <div style={{ fontSize:'1.05rem', fontWeight:700 }}>ΛURΛ Ingestion</div>
      </div>

      <button className="btn" style={{ width:'100%', marginBottom:10, padding:13, background: cameraOn ? 'rgba(207,102,121,.1)' : 'var(--silver-shimmer)', border: cameraOn ? '1px solid var(--accent-red)' : 'none', color: cameraOn ? 'var(--accent-red)' : '#0A0A0A', fontWeight:800, fontFamily:'var(--font)', textTransform:'uppercase', letterSpacing:'1px', borderRadius:6, cursor:'pointer' }} onClick={toggleCamera}>
        {cameraOn ? 'Deactivate Camera' : 'Activate Camera'}
      </button>

      {cameraOn && (
        <>
          <div style={{ position:'relative', width:'100%', aspectRatio:'4/3', background:'#000', borderRadius:8, overflow:'hidden', border:'1px solid var(--border)', marginBottom:10, cursor:'pointer' }} onClick={()=>{ if(scanning) capture(); }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            <div style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
              <div style={{ width:'85%', height:'65%', border:`1px solid ${scanning?'var(--accent-green)':'rgba(255,255,255,.2)'}`, borderRadius:6, background:scanning?'rgba(3,218,198,.04)':undefined, transition:'all .3s' }} />
            </div>
            {status && (
              <div style={{ position:'absolute', bottom:10, left:0, width:'100%', textAlign:'center', fontSize:'.62rem', fontWeight:700, color:status.startsWith('Error')?'var(--accent-red)':'var(--accent-silver)', letterSpacing:'1.5px', textTransform:'uppercase', background:'rgba(0,0,0,.6)', padding:'6px 0' }}>
                {status}
              </div>
            )}
          </div>

          <button className="btn" style={{ width:'100%', marginBottom:10, padding:13, background:scanning?'var(--bg-elevated)':'rgba(255,255,255,.02)', border:`1px solid ${scanning?'var(--accent-green)':'rgba(255,255,255,.3)'}`, color:scanning?'var(--accent-green)':'#FFF', fontWeight:800, fontFamily:'var(--font)', textTransform:'uppercase', letterSpacing:'1px', borderRadius:6, cursor:'pointer' }} onClick={toggleScan}>
            {scanning ? '⏸ Pause Scanning' : '▶ Engage Scan Mode'}
          </button>
        </>
      )}

      <canvas ref={analyzerRef} width={40} height={30} style={{ display:'none' }} />

      {/* Session log */}
      {sessionLog.length > 0 && (
        <div className="panel" style={{ marginTop:16 }}>
          <div className="panel-title">Session Log</div>
          {sessionLog.map((s,i) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border-light)', cursor:'pointer' }} onClick={async ()=>{
              const {data} = await supabase.from('platform_contacts').select('id').eq('email',s.email).maybeSingle();
              if(data?.id) navigate(`/contact/${data.id}`);
            }}>
              <div>
                <div style={{ fontSize:'.75rem', fontWeight:700 }}>{s.name}</div>
                <div style={{ fontSize:'.62rem', color:'var(--text-muted)' }}>{[s.title,s.company].filter(Boolean).join(' · ')}</div>
              </div>
              <div style={{ fontSize:'.6rem', color:'var(--text-muted)', flexShrink:0, marginLeft:8 }}>{s.time}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
