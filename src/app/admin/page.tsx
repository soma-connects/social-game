'use client';

import React, { useCallback, useEffect, useState } from 'react';
import AdminLogin from '@/components/admin/AdminLogin';
import AdminDashboard from '@/components/admin/AdminDashboard';
import { INK } from '@/components/admin/vizTokens';

/**
 * The admin dashboard.
 *
 * Gated on a shared token held in an httpOnly cookie — see lib/server/adminAuth
 * for why the game's anonymous player identity cannot be the thing that decides
 * who is staff. The gate here is only a convenience: it decides what to render,
 * not what the caller may read. Every figure on the next screen comes from an
 * API route that re-checks the cookie server-side, because a client-side check
 * protects nothing.
 */
export default function AdminPage() {
  const [state, setState] = useState<'checking' | 'locked' | 'open' | 'unconfigured'>('checking');

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/session', { cache: 'no-store' });
      const data = await response.json();
      if (!data.configured) return setState('unconfigured');
      setState(data.authenticated ? 'open' : 'locked');
    } catch {
      setState('locked');
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const signOut = useCallback(async () => {
    await fetch('/api/admin/session', { method: 'DELETE' });
    setState('locked');
  }, []);

  return (
    /* `relative` with a z-index is load-bearing: the root layout paints a
       fixed starfield canvas at z-index 0, and a positioned element beats a
       static one regardless of DOM order. Without it the stars sit on top of
       the charts, competing with the marks — fine for the game, wrong for a
       surface whose whole job is reading small differences accurately. */
    <main
      className="relative z-10 min-h-screen p-4 sm:p-8"
      style={{ backgroundColor: INK.page }}
    >
      <div className="max-w-6xl mx-auto">
        {state === 'checking' && (
          <p className="text-sm py-20 text-center" style={{ color: INK.muted }}>
            Checking access…
          </p>
        )}

        {state === 'unconfigured' && (
          <div
            className="rounded-2xl p-6 border max-w-lg mx-auto mt-20 space-y-3"
            style={{ backgroundColor: INK.surface, borderColor: INK.border }}
          >
            <h1 className="text-lg font-bold" style={{ color: INK.primary }}>
              Dashboard not configured
            </h1>
            <p className="text-sm" style={{ color: INK.secondary }}>
              Set <code className="font-mono text-xs">ADMIN_DASHBOARD_TOKEN</code> in the server
              environment to switch this on. It must be at least 16 characters — a short secret is
              worse than none, because it advertises a door that can be guessed.
            </p>
          </div>
        )}

        {state === 'locked' && <AdminLogin onAuthenticated={() => setState('open')} />}
        {state === 'open' && <AdminDashboard onSignOut={signOut} />}
      </div>
    </main>
  );
}
