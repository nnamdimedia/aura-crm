import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0A0A0A',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            fontSize: '2rem',
            fontWeight: 800,
            letterSpacing: '.45em',
            background: 'linear-gradient(135deg,#4A4A4A 0%,#9A9A9A 25%,#E5E5E5 45%,#FFF 50%,#E5E5E5 55%,#9A9A9A 75%,#4A4A4A 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '6px',
            fontFamily: "'Montserrat', sans-serif",
          }}>ΛURΛ</div>
          <div style={{ fontSize: '.55rem', color: '#444', letterSpacing: '.3em', textTransform: 'uppercase', fontFamily: "'Montserrat', sans-serif" }}>
            NNΛMDI MEDIΛ LΛBS
          </div>
        </div>

        <form onSubmit={handleLogin}>
          <div className="panel">
            <div className="input-group">
              <label>NMC Identity</label>
              <input
                type="email"
                className="hud-in"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="email@charlesnnamdi.com"
                required
              />
            </div>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label>Passphrase</label>
              <input
                type="password"
                className="hud-in"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          {error && (
            <div style={{
              padding: '10px 12px',
              background: 'rgba(207,102,121,.12)',
              border: '1px solid rgba(207,102,121,.3)',
              borderRadius: '6px',
              color: '#CF6679',
              fontSize: '.72rem',
              marginBottom: '12px',
              fontFamily: "'Montserrat', sans-serif",
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-silver"
            disabled={loading}
          >
            {loading ? 'Authorizing…' : 'Authorize Terminal Interface'}
          </button>
        </form>
      </div>
    </div>
  );
}
