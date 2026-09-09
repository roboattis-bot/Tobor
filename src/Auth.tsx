import { lazy, Suspense, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Eye,
  EyeOff,
  Hexagon,
  LoaderCircle,
  LockKeyhole,
} from 'lucide-react';
import { api } from './api';
import type { User } from '../shared/types';
const PrinterScene = lazy(() => import('./PrinterScene'));
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className={`brand ${light ? 'brand-light' : ''}`}>
      <span className="brand-mark">
        <Hexagon size={23} strokeWidth={2.6} />
        <span />
      </span>
      <span>
        tobor<span className="brand-period">.</span>
      </span>
    </div>
  );
}
export default function Auth({
  needsSetup,
  onLogin,
}: {
  needsSetup: boolean;
  onLogin: (user: User) => void;
}) {
  const [showPassword, setShowPassword] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ user: User }>(needsSetup ? '/auth/setup' : '/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          ...(needsSetup ? { name: form.get('name') } : {}),
          email: form.get('email'),
          password: form.get('password'),
        }),
      });
      onLogin(result.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <Brand light />
        <div className="auth-intro">
          <div className="auth-kicker">
            <span className="live-dot" /> THE WORKSHOP, CONNECTED
          </div>
          <h1>
            Good ideas.
            <br />
            Made real.
          </h1>
          <p>
            From the first request to the final quality check.
            <br className="desktop-only" /> One calm place to make it all happen.
          </p>
        </div>
        <div className="auth-model">
          <div className="orbit-label orbit-one">
            <span className="live-dot" /> Built around your workflow
          </div>
          <Suspense fallback={<div className="scene-loading" />}>
            <PrinterScene large />
          </Suspense>
          <div className="orbit-label orbit-two">
            <Check size={13} /> Every detail accounted for
          </div>
        </div>
        <div className="auth-story-bottom">
          <span>Parts. Repairs. Possibilities.</span>
          <ArrowUpRight size={19} />
        </div>
      </section>
      <section className="auth-form-side">
        <div className="auth-top">
          <span>WORKSHOP OS</span>
          <span className="pill">Pilot workspace</span>
        </div>
        <div className="auth-form-content">
          <div className="auth-icon">
            <LockKeyhole size={22} />
          </div>
          <div className="eyebrow">LET’S GET TO WORK</div>
          <h2>{needsSetup ? 'Your workshop starts here.' : 'Welcome back.'}</h2>
          <p className="auth-description">
            {needsSetup
              ? 'Create your account to bring your workshop into focus.'
              : 'Sign in to see what’s moving, what needs you, and what’s next.'}
          </p>
          <form onSubmit={submit}>
            {needsSetup && (
              <label className="field">
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  placeholder="Prakash"
                  required
                  minLength={2}
                  maxLength={100}
                />
              </label>
            )}
            <label className="field">
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@yourworkshop.com"
                required
                maxLength={254}
              />
            </label>
            <label className="field">
              Password
              <div className="password-input">
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={needsSetup ? 'new-password' : 'current-password'}
                  placeholder={
                    needsSetup ? 'Create a password (12+ characters)' : 'Enter your password'
                  }
                  required
                  minLength={needsSetup ? 12 : 1}
                  maxLength={128}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {needsSetup && (
              <p className="form-hint">
                Use at least 12 characters. This account will manage your workspace.
              </p>
            )}
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button className="button primary auth-submit" disabled={busy}>
              {busy ? <LoaderCircle size={17} className="spin" /> : null}
              {needsSetup ? 'Create workspace' : 'Sign in'}
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="auth-note">
            <span className="note-icon">
              <Check size={15} />
            </span>
            <p>
              {needsSetup
                ? 'Start with clearly labeled sample cases and equipment. Your changes are saved to your local database.'
                : 'Your cases, approvals, and workshop records are kept together in your private workspace.'}
            </p>
          </div>
        </div>
        <footer className="auth-footer">
          <span>© {new Date().getFullYear()} Tobor</span>
          <span>
            <LockKeyhole size={12} /> Private by design
          </span>
        </footer>
      </section>
    </div>
  );
}
