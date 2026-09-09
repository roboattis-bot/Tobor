import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Bell,
  BookOpen,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Command,
  FileCheck2,
  FileText,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import type { AuthState, DashboardData, Page } from '../shared/types';
import { api, getAuth, getDashboard } from './api';
import Auth, { Brand } from './Auth';
import Dashboard from './Dashboard';
import { WorkspacePage } from './WorkspacePages';
import { CaseDetailModal, NewCaseModal } from './CaseDialogs';
import Modal from './Modal';

const navigation = [
  { page: 'overview', label: 'Overview', icon: LayoutDashboard },
  { page: 'cases', label: 'Cases & requests', icon: LayersIcon },
  { page: 'production', label: 'Production', icon: Box },
  { page: 'quotes', label: 'Quotes & approvals', icon: FileText },
  { page: 'quality', label: 'Quality control', icon: ShieldCheck },
  { page: 'library', label: 'Part library', icon: BookOpen },
  { page: 'insights', label: 'Insights', icon: Activity },
] as const;
function LayersIcon({ size = 18 }: { size?: number }) {
  return <FileCheck2 size={size} />;
}
function initialPage(): Page {
  const key = location.hash.slice(1);
  return [
    'overview',
    'cases',
    'production',
    'quotes',
    'quality',
    'library',
    'insights',
    'settings',
  ].includes(key)
    ? (key as Page)
    : 'overview';
}
export default function App() {
  const [auth, setAuth] = useState<AuthState | null>(null),
    [data, setData] = useState<DashboardData | null>(null),
    [error, setError] = useState('');
  const [page, setPage] = useState<Page>(initialPage),
    [mobileOpen, setMobileOpen] = useState(false),
    [newCase, setNewCase] = useState(false),
    [caseId, setCaseId] = useState<number | null>(null);
  const [search, setSearch] = useState(''),
    [searchFocused, setSearchFocused] = useState(false),
    [notifications, setNotifications] = useState(false),
    [help, setHelp] = useState(false),
    [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; message: string; kind: string }[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string, kind: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5500);
  }, []);
  const refresh = useCallback(async () => {
    const next = await getDashboard();
    setData(next);
    setError('');
  }, []);
  const navigate = useCallback((next: Page) => {
    setPage(next);
    location.hash = next;
    setMobileOpen(false);
    window.scrollTo({ top: 0 });
  }, []);
  const openCase = useCallback((id: number) => {
    setCaseId(id);
    setSearch('');
    setSearchFocused(false);
    setNotifications(false);
  }, []);
  useEffect(() => {
    getAuth()
      .then(setAuth)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    const expireSession = () => {
      setAuth((previous) => ({
        user: null,
        needsSetup: false,
        testLoginEnabled: previous?.testLoginEnabled ?? false,
      }));
      setData(null);
      setCaseId(null);
      setNewCase(false);
      setNotifications(false);
      setSearch('');
      setError('');
    };
    window.addEventListener('tobor:session-expired', expireSession);
    return () => window.removeEventListener('tobor:session-expired', expireSession);
  }, []);
  useEffect(() => {
    const hash = () => setPage(initialPage());
    window.addEventListener('hashchange', hash);
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setSearchFocused(false);
        setNotifications(false);
        setMobileOpen(false);
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('hashchange', hash);
      window.removeEventListener('keydown', key);
    };
  }, []);
  useEffect(() => {
    if (!auth?.user) return;
    refresh().catch((e) => setError(e.message));
    const stream = new EventSource('/api/events');
    stream.onopen = () => {
      setConnected(true);
      refresh().catch(() => {});
    };
    stream.onerror = () => {
      setConnected(false);
      getAuth()
        .then((session) => {
          if (!session.user) window.dispatchEvent(new Event('tobor:session-expired'));
        })
        .catch(() => {});
    };
    const update = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => refresh().catch(() => {}), 120);
    };
    stream.addEventListener('update', update);
    stream.onmessage = update;
    return () => {
      stream.close();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      setConnected(false);
    };
  }, [auth?.user, refresh]);
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
      setAuth((previous) => ({
        user: null,
        needsSetup: false,
        testLoginEnabled: previous?.testLoginEnabled ?? false,
      }));
      setData(null);
      setCaseId(null);
      setNewCase(false);
      setNotifications(false);
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }
  if (!auth) {
    return (
      <div className="app-loading">
        <Brand />
        <div className="loading-orbit">
          <LoaderCircle className="spin" size={24} />
        </div>
        <p>{error || 'Opening your workshop…'}</p>
        {error && (
          <button className="button secondary" onClick={() => location.reload()}>
            Try again
          </button>
        )}
      </div>
    );
  }
  if (!auth.user)
    return (
      <Auth
        needsSetup={auth.needsSetup}
        testLoginEnabled={auth.testLoginEnabled}
        onLogin={(user) => setAuth({ ...auth, user, needsSetup: false })}
      />
    );
  const currentNav = navigation.find((n) => n.page === page);
  const matches =
    data?.cases
      .filter((c) =>
        `${c.reference} ${c.title} ${c.customer} ${c.asset}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      )
      .slice(0, 6) || [];
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {mobileOpen && <div className="sidebar-scrim" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? 'is-open' : ''}`}>
        <div className="sidebar-brand">
          <Brand />
          <span className="os-label">WORKSHOP OS</span>
          <button
            className="mobile-close icon-button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-switch">
          <div className="workspace-avatar">
            {(data?.settings.workspaceName || 'Tobor').charAt(0)}
          </div>
          <div>
            <strong>{data?.settings.workspaceName || 'Tobor Workshop'}</strong>
            <span>
              <i />
              {data?.settings.city || 'Local workshop'}
            </span>
          </div>
          <button
            className="icon-button"
            aria-label="Workspace settings"
            onClick={() => navigate('settings')}
          >
            <ChevronDown size={15} />
          </button>
        </div>
        <div className="nav-section-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ page: p, label, icon: Icon }) => (
            <button
              key={p}
              className={`nav-item ${page === p ? 'active' : ''}`}
              onClick={() => navigate(p)}
              aria-current={page === p ? 'page' : undefined}
            >
              <Icon size={18} />
              <span>{label}</span>
              {p === 'cases' && !!data?.cases.filter((c) => c.status === 'intake').length && (
                <span className="nav-count">
                  {data.cases.filter((c) => c.status === 'intake').length}
                </span>
              )}
              {p === 'quotes' && !!data?.quotes.filter((q) => q.status === 'sent').length && (
                <span className="nav-alert" />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-icon">
              <Sparkles size={18} />
            </span>
            <h3>A little better, every batch.</h3>
            <p>Turn a verified part into your next effortless reorder.</p>
            <button onClick={() => navigate('library')}>
              Explore your part library <ArrowRight size={14} />
            </button>
          </div>
          <button
            className={`nav-item ${page === 'settings' ? 'active' : ''}`}
            onClick={() => navigate('settings')}
          >
            <Settings2 size={18} />
            <span>Workspace settings</span>
          </button>
          <button className="nav-item" onClick={() => setHelp(true)}>
            <CircleHelp size={18} />
            <span>How Tobor works</span>
            <ArrowRight size={14} />
          </button>
          <div className="user-block">
            <span className="user-avatar">
              {auth.user.name
                .split(' ')
                .slice(0, 2)
                .map((n) => n[0])
                .join('')}
            </span>
            <div>
              <strong>{auth.user.name}</strong>
              <span>Workspace administrator</span>
            </div>
            <button className="icon-button" onClick={logout} aria-label="Sign out" title="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button menu-button"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{currentNav?.label || 'Settings'}</strong>
          </div>
          <div className="topbar-actions">
            <div className="global-search">
              <Search size={16} />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                placeholder="Search anything…"
                aria-label="Search cases, customers or assets"
              />
              <kbd>⌘ K</kbd>
              {searchFocused && search && (
                <div className="search-results">
                  <div className="search-label">CASES & ASSETS</div>
                  {matches.length ? (
                    matches.map((c) => (
                      <button
                        key={c.id}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => openCase(c.id)}
                      >
                        <Box size={17} />
                        <span>
                          <strong>{c.title}</strong>
                          <small>
                            {c.reference} · {c.customer}
                          </small>
                        </span>
                        <ArrowRight size={14} />
                      </button>
                    ))
                  ) : (
                    <p>No cases match “{search}”.</p>
                  )}
                </div>
              )}
            </div>
            <div className="topbar-divider" />
            <div className="notification-wrap">
              <button
                className={`icon-button notification-button ${notifications ? 'selected' : ''}`}
                aria-label="View notifications"
                aria-expanded={notifications}
                onClick={() => setNotifications(!notifications)}
              >
                <Bell size={19} />
                {!!data?.cases.filter((c) => c.status === 'approval' || c.status === 'blocked')
                  .length && <span />}
              </button>
              {notifications && (
                <div className="notification-panel">
                  <h3>Needs a little attention</h3>
                  {data?.cases.filter((c) => c.status === 'approval' || c.status === 'blocked')
                    .length ? (
                    data.cases
                      .filter((c) => c.status === 'approval' || c.status === 'blocked')
                      .map((c) => (
                        <button key={c.id} onClick={() => openCase(c.id)}>
                          <span className={`notification-dot ${c.status}`} />
                          <span>
                            <strong>{c.title}</strong>
                            <small>
                              {c.status === 'blocked'
                                ? c.blockedReason || 'On hold — review next steps'
                                : 'Waiting for design or quote approval'}
                            </small>
                          </span>
                          <ChevronRight size={14} />
                        </button>
                      ))
                  ) : (
                    <p>You’re all caught up.</p>
                  )}
                </div>
              )}
            </div>
            <span className="top-avatar">{auth.user.name.charAt(0)}</span>
          </div>
        </header>
        <main id="main-content">
          {auth.testLoginEnabled && (
            <div className="test-access-banner" role="status">
              <strong>Test access enabled</strong>
              <span>The designated test account accepts any password.</span>
            </div>
          )}
          <div className="workspace-status">
            <span>
              <span className={`live-dot ${connected ? '' : 'disconnected'}`} />
              {connected ? 'Workspace connected' : 'Reconnecting…'}
            </span>
            <div>
              {data?.settings.demoMode && <span className="demo-label">SAMPLE WORKSPACE</span>}
              <span className="today-label">
                {new Date().toLocaleDateString('en-IN', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </div>
          </div>
          {error && (
            <div className="form-error app-error" role="alert">
              {error}
              <button
                className="text-button"
                onClick={() => refresh().catch((e) => setError(e.message))}
              >
                Retry
              </button>
              <button className="text-button" onClick={logout}>
                Sign in again
              </button>
            </div>
          )}
          {!data ? (
            <div className="content-loading">
              <LoaderCircle className="spin" />
              <p>Bringing your workspace together…</p>
            </div>
          ) : page === 'overview' ? (
            <Dashboard
              data={data}
              user={auth.user}
              navigate={navigate}
              onOpenCase={openCase}
              onNewCase={() => setNewCase(true)}
            />
          ) : (
            <WorkspacePage
              page={page}
              data={data}
              user={auth.user}
              refresh={refresh}
              notify={notify}
              onOpenCase={openCase}
              onNewCase={() => setNewCase(true)}
            />
          )}
        </main>
      </div>
      {newCase && (
        <NewCaseModal
          notify={notify}
          onClose={() => setNewCase(false)}
          onCreated={async (id) => {
            await refresh();
            setNewCase(false);
            setCaseId(id);
          }}
        />
      )}
      {caseId && data?.cases.find((c) => c.id === caseId) && (
        <CaseDetailModal
          record={data.cases.find((c) => c.id === caseId)!}
          data={data}
          refresh={refresh}
          notify={notify}
          onClose={() => setCaseId(null)}
        />
      )}{' '}
      {help && (
        <Modal
          title="One service. From problem to proven part."
          subtitle="Built from your Tobor Product & Factory Blueprint · September 2026"
          onClose={() => setHelp(false)}
        >
          <div className="modal-body help-body">
            <p>
              Tobor turns a broken part, a new idea, or a supported device fault into a verified
              working solution. A case owner keeps engineering, the customer, and the workshop
              connected.
            </p>
            {[
              {
                n: '01',
                title: 'Understand the request',
                text: 'Collect intended use, photos, dimensions, and the consequences of failure. Decide whether to source, make, repair, use a partner, or decline.',
              },
              {
                n: '02',
                title: 'Agree on the exact solution',
                text: 'An engineer verifies the specification and releases a design revision. Record approval of the itemized quote before production.',
              },
              {
                n: '03',
                title: 'Make it. Measure it. Release it.',
                text: 'Use a qualified process. Required dimensional and functional checks must pass before dispatch.',
              },
              {
                n: '04',
                title: 'Make the next one easier',
                text: 'Keep verified parts and their revisions in a private library. Reorders confirm that interfaces, use, and design rights are unchanged.',
              },
            ].map((s) => (
              <div className="help-step" key={s.n}>
                <span>{s.n}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              </div>
            ))}
            <div className="info-callout">
              <Sparkles size={20} />
              <p>
                Improve measurement and engineering capacity first. The plan’s illustrative CAD
                workload nearly fills its available hours. More printers alone won’t solve that
                bottleneck.
              </p>
            </div>
            <p className="form-hint">
              This pilot includes local records and sample equipment. Payment collection, courier
              booking, physical printer telemetry, and automated CAD processing need separate
              integrations. Read README.md and docs/TOBOR_GUIDE.md in this folder for setup and the
              full improvement plan.
            </p>
          </div>
          <div className="modal-footer">
            <button className="button primary" onClick={() => setHelp(false)}>
              Got it <Check size={16} />
            </button>
          </div>
        </Modal>
      )}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div className={`toast ${t.kind}`} key={t.id}>
            {t.kind === 'success' ? <Check size={17} /> : <CircleHelp size={17} />}
            <span>{t.message}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() => setToasts((a) => a.filter((x) => x.id !== t.id))}
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
