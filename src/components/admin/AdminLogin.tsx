'use client';

import React, { useState } from 'react';
import { INK } from './vizTokens';

export default function AdminLogin({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        // Never held in component state or storage — the cookie the server just
        // set is the credential from here on, and it is httpOnly.
        setPassword('');
        onAuthenticated();
        return;
      }

      const data = await response.json().catch(() => ({}));
      setError(data.error ?? 'That token was not accepted.');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl p-6 border max-w-sm mx-auto mt-24 space-y-4"
      style={{ backgroundColor: INK.surface, borderColor: INK.border }}
    >
      <div>
        <h1 className="text-lg font-bold" style={{ color: INK.primary }}>
          Admin dashboard
        </h1>
        <p className="text-xs mt-1" style={{ color: INK.muted }}>
          Enter the admin token to see how the game is being played.
        </p>
      </div>

      <input
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Admin token"
        autoComplete="current-password"
        autoFocus
        className="w-full rounded-xl px-4 py-2.5 text-sm outline-none border"
        style={{ backgroundColor: INK.page, borderColor: INK.axis, color: INK.primary }}
      />

      {error && (
        <p className="text-xs" style={{ color: '#d03b3b' }} role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || password.length === 0}
        className="w-full rounded-xl py-2.5 text-sm font-bold disabled:opacity-50 transition-opacity"
        style={{ backgroundColor: '#3987e5', color: '#ffffff' }}
      >
        {busy ? 'Checking…' : 'Sign in'}
      </button>
    </form>
  );
}
