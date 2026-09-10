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
  Pause,
  Play,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import type { AuthState, DashboardData, Page, ServiceType } from '../shared/types';
import { api, getAuth, getDashboard } from './api';
import Auth, { Brand } from './Auth';
import Dashboard from './Dashboard';
import { WorkspacePage } from './WorkspacePages';
import { CaseDetailModal, NewCaseModal } from './CaseDialogs';
import Modal from './Modal';
import { useModelMotion } from './ModelScene';
import { journey } from './workflow';

const navigation = [
  { page: 'overview', label: 'Home', icon: LayoutDashboard },
  { page: 'cases', label: 'Requests', icon: LayersIcon },
  { page: 'quotes', label: 'Prices & approvals', icon: FileText },
  { page: 'production', label: 'Make & repair', icon: Box },
  { page: 'quality', label: 'Final checks', icon: ShieldCheck },
  { page: 'library', label: 'Saved parts', icon: BookOpen },
  { page: 'insights', label: 'Reports', icon: Activity },
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
  const { motion, toggleMotion } = useModelMotion();
  const [newService, setNewService] = useState<ServiceType>('custom');
  const [auth, setAuth] = useState<AuthState | null>(null),
    [data, setData] = useState<DashboardData | null>(null),
    [error, setError] = useState('');
  const [page, setPage] = useState<Page>(initialPage),
    [mobileOpen, setMobileOpen] = useState(false),
    [newCase, setNewCase] = useState(false),
    [caseId, setCaseId] = useState<number | null>(null);
  const [search, setSearch] = useState(''),
    [mobileSearch, setMobileSearch] = useState(false),
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
  const startNewRequest = (service: ServiceType = 'custom') => {
    setNewService(service);
    setNewCase(true);
  };
  const navigate = useCallback((next: Page) => {
    setPage(next);
    location.hash = next;
    setMobileOpen(false);
    setMobileSearch(false);
    window.scrollTo({ top: 0 });
  }, []);
  const openCase = useCallback((id: number) => {
    setCaseId(id);
    setSearch('');
    setSearchFocused(false);
    setMobileSearch(false);
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
        setMobileSearch(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      }
      if (e.key === 'Escape') {
        setSearchFocused(false);
        setMobileSearch(false);
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
          <button
            className={`nav-item ${page === 'settings' ? 'active' : ''}`}
            onClick={() => navigate('settings')}
          >
            <Settings2 size={18} />
            <span>Settings</span>
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
            <button
              className="motion-toggle"
              onClick={toggleMotion}
              aria-label={motion ? 'Pause 3D animation' : 'Play 3D animation'}
              aria-pressed={!motion}
            >
              {motion ? <Pause size={16} /> : <Play size={16} />}
              <span>{motion ? 'Pause 3D' : 'Play 3D'}</span>
            </button>
            <button
              className="icon-button mobile-search-toggle"
              aria-label="Search requests"
              aria-expanded={mobileSearch}
              aria-controls="workspace-search"
              onClick={() => {
                setMobileSearch(!mobileSearch);
                if (!mobileSearch) requestAnimationFrame(() => searchRef.current?.focus());
              }}
            >
              <Search size={19} />
            </button>
            <div id="workspace-search" className={`global-search ${mobileSearch ? 'is-open' : ''}`}>
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
                  <div className="search-label">REQUESTS</div>
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
                    <p>No requests match “{search}”.</p>
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
              onNewCase={startNewRequest}
            />
          ) : (
            <WorkspacePage
              page={page}
              data={data}
              user={auth.user}
              refresh={refresh}
              notify={notify}
              onOpenCase={openCase}
              onNewCase={() => startNewRequest()}
            />
          )}
        </main>
      </div>
      {newCase && (
        <NewCaseModal
          initialService={newService}
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
          title="How Tobor works"
          subtitle="From a broken part or a new idea to something ready to use."
          onClose={() => setHelp(false)}
        >
          <div className="modal-body help-body">
            <p>
              Tobor helps you make a new part, replace a broken one, or repair a supported device.
              One request keeps the plan, price, progress, and checks together.
            </p>
            {journey.map((step, index) => (
              <div className="help-step" key={step.title}>
                <span>{index + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </div>
            ))}
            <div className="info-callout">
              <CircleHelp size={20} />
              <p>
                Start with what you know. The team can help confirm the size, material, and best
                solution before the job starts.
              </p>
            </div>
            <p className="form-hint">
              Sample records are marked on screen. Equipment status is updated by your team. The 3D
              models explain the work; they do not control a machine.
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
