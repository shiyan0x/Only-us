import React, { useState, useEffect } from 'react';
import './index.css';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import { getMe } from './services/api';
import { connectSocket, disconnectSocket } from './services/socket';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const token = localStorage.getItem('onlyus_token');
    if (token) {
      getMe()
        .then((data) => {
          setUser(data.user);
          connectSocket(token);
        })
        .catch(() => {
          localStorage.removeItem('onlyus_token');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleAuth = (userData, token) => {
    setUser(userData);
    connectSocket(token);
  };

  const handleLogout = () => {
    localStorage.removeItem('onlyus_token');
    disconnectSocket();
    setUser(null);
  };

  if (loading) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary)',
        }}
      >
        <div className="spinner" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage onAuth={handleAuth} />;
  }

  return <Dashboard user={user} onLogout={handleLogout} />;
}
