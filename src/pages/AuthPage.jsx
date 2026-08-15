import React, { useState } from 'react';
import { Shield, Eye, EyeOff, User, Lock, AtSign } from 'lucide-react';
import { signup, signin } from '../services/api';

export default function AuthPage({ onAuth }) {
  const [mode, setMode] = useState('signin'); // 'signin' or 'signup'
  const [form, setForm] = useState({
    username: '',
    displayName: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'signup') {
        if (!form.username || !form.displayName || !form.password) {
          throw new Error('All fields are required.');
        }
        if (form.password !== form.confirmPassword) {
          throw new Error('Passwords do not match.');
        }
        if (form.password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }
        if (!/^[a-zA-Z0-9_]+$/.test(form.username)) {
          throw new Error('Username can only contain letters, numbers, and underscores.');
        }

        const data = await signup(form.username, form.displayName, form.password);
        localStorage.setItem('onlyus_token', data.token);
        onAuth(data.user, data.token);
      } else {
        if (!form.username || !form.password) {
          throw new Error('Username and password are required.');
        }

        const data = await signin(form.username, form.password);
        localStorage.setItem('onlyus_token', data.token);
        onAuth(data.user, data.token);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setForm({ username: '', displayName: '', password: '', confirmPassword: '' });
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-brand">
          <div className="auth-brand-icon">
            <Shield size={28} color="white" />
          </div>
          <h1>OnlyUs</h1>
          <p>No email. No phone. Just you.</p>
        </div>

        <div className="auth-card">
          <div className="auth-tabs">
            <button
              className={`auth-tab ${mode === 'signin' ? 'active' : ''}`}
              onClick={() => switchMode('signin')}
            >
              Sign In
            </button>
            <button
              className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
              onClick={() => switchMode('signup')}
            >
              Sign Up
            </button>
          </div>

          {error && <div className="alert-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <div className="relative">
                <input
                  id="input-username"
                  type="text"
                  name="username"
                  className="form-input"
                  placeholder="your_unique_username"
                  value={form.username}
                  onChange={handleChange}
                  autoComplete="off"
                  maxLength={20}
                />
              </div>
              {mode === 'signup' && (
                <div className="form-hint">3-20 characters, letters, numbers, underscores only</div>
              )}
            </div>

            {mode === 'signup' && (
              <div className="form-group">
                <label className="form-label">Display Name</label>
                <input
                  id="input-displayname"
                  type="text"
                  name="displayName"
                  className="form-input"
                  placeholder="How others see you"
                  value={form.displayName}
                  onChange={handleChange}
                  maxLength={30}
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Password</label>
              <div className="relative" style={{ position: 'relative' }}>
                <input
                  id="input-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={handleChange}
                  style={{ paddingRight: '44px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-tertiary)',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {mode === 'signup' && (
              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <input
                  id="input-confirm-password"
                  type="password"
                  name="confirmPassword"
                  className="form-input"
                  placeholder="••••••••"
                  value={form.confirmPassword}
                  onChange={handleChange}
                />
              </div>
            )}

            <button
              id="btn-auth-submit"
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading
                ? mode === 'signup'
                  ? 'Creating Account...'
                  : 'Signing In...'
                : mode === 'signup'
                ? 'Create Account'
                : 'Sign In'}
            </button>
          </form>

          <div
            style={{
              textAlign: 'center',
              marginTop: 'var(--space-xl)',
              color: 'var(--text-tertiary)',
              fontSize: 'var(--font-xs)',
            }}
          >
            {mode === 'signin' ? (
              <>
                Don't have an account?{' '}
                <button
                  onClick={() => switchMode('signup')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-violet-light)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-family)',
                    fontSize: 'inherit',
                    fontWeight: 600,
                  }}
                >
                  Sign Up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  onClick={() => switchMode('signin')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-violet-light)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-family)',
                    fontSize: 'inherit',
                    fontWeight: 600,
                  }}
                >
                  Sign In
                </button>
              </>
            )}
          </div>
        </div>

        <div
          style={{
            textAlign: 'center',
            marginTop: 'var(--space-xl)',
            color: 'var(--text-muted)',
            fontSize: 'var(--font-xs)',
          }}
        >
          🔒 Your privacy is sacred. We store nothing but your username.
        </div>
      </div>
    </div>
  );
}
