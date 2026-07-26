import { useState } from 'react';
import { auth } from '../services/api';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await auth.login(username, password);
      onLogin(data.user, data.token);
    } catch (err) {
      const msg = err.message || '';
      if (msg.toLowerCase().includes('invalid')) {
        setError('Invalid username or password. Please try again.');
      } else if (msg.toLowerCase().includes('deactivated')) {
        setError('Your account has been deactivated. Contact your administrator.');
      } else if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('fetch')) {
        setError('Unable to connect to the server. Please try again.');
      } else {
        setError(msg || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand-icon">KSP</div>
          <h1>Crime Intelligence Platform</h1>
          <p>Karnataka State Police — Secure Access</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input className="form-input" type="text" value={username}
              onChange={e => setUsername(e.target.value)} placeholder="Enter username" required autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" value={password}
              onChange={e => setPassword(e.target.value)} placeholder="Enter password" required />
          </div>
          <button className="btn btn-primary login-btn" type="submit" disabled={loading}>
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div className="login-credentials">
          <p>Demo Credentials:</p>
          <p><code>admin / admin123</code> — Super Admin</p>
          <p><code>officer1 / officer123</code> — Police Officer</p>
          <p><code>analyst1 / analyst123</code> — Analyst</p>
        </div>
      </div>
    </div>
  );
}
