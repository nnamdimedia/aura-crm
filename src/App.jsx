import { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { supabase } from './lib/supabase';

import Login      from './views/Login';
import Dashboard  from './views/Dashboard';
import Contacts   from './views/Contacts';
import Contact    from './views/Contact';
import Capture    from './views/Capture';
import Release    from './views/Release';
import Research   from './views/Research';

const BUILD = '1107-A';

function NavBar() {
  const loc = useLocation();
  const isContact = loc.pathname.startsWith('/contact/');

  if (isContact) return null; // contact detail has its own back nav

  const items = [
    { to: '/dashboard', icon: '⚡', label: 'Dashboard' },
    { to: '/contacts',  icon: '👥', label: 'Contacts'  },
    { to: '/capture',   icon: '📷', label: 'Capture'   },
    { to: '/release',   icon: '📄', label: 'Release'   },
    { to: '/research',  icon: '🔬', label: 'Research'  },
  ];

  return (
    <nav className="bottom-nav">
      {items.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <span className="nav-icon">{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function AppHeader({ user, onSignOut }) {
  const loc = useLocation();
  const isContact = loc.pathname.startsWith('/contact/');

  return (
    <header className="app-header">
      {isContact
        ? <button className="btn btn-ghost" onClick={() => window.history.back()}>← Back</button>
        : <span className="brand">ΛURΛ</span>
      }
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ fontSize:'.5rem', color:'#555', letterSpacing:'1px', fontWeight:700 }}>BUILD {BUILD}</span>
        <span style={{ fontSize:'.6rem', color:'var(--text-muted)', fontWeight:700, letterSpacing:'1px' }}>
          {user?.email?.split('@')[0]?.toUpperCase()}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={onSignOut}>EXIT</button>
      </div>
    </header>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', background:'#0A0A0A' }}>
      <div className="spinner" />
    </div>
  );

  if (!session) return <Login />;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <Router>
      <AppHeader user={session.user} onSignOut={handleSignOut} />
      <main className="app-content">
        <Routes>
          <Route path="/"           element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard"  element={<Dashboard />} />
          <Route path="/contacts"   element={<Contacts />} />
          <Route path="/contact/:id" element={<Contact />} />
          <Route path="/capture"    element={<Capture />} />
          <Route path="/release"    element={<Release />} />
          <Route path="/research"   element={<Research />} />
          <Route path="*"           element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
      <NavBar />
    </Router>
  );
}
