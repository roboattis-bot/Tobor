import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Box,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  FileText,
  Filter,
  FolderLock,
  Layers3,
  LoaderCircle,
  Package,
  Plus,
  Printer,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Wrench,
  X,
} from 'lucide-react';
import type {
  CaseRecord,
  DashboardData,
  Page,
  Part,
  QualityCheck,
  Quote,
  Settings,
  User,
} from '../shared/types';
import { api, dateLabel, money, statusLabels } from './api';
import Modal from './Modal';
import './pages.css';

type Notice = (message: string, kind?: 'success' | 'error') => void;
interface Props {
  page: Page;
  data: DashboardData;
  refresh: () => Promise<void>;
  notify: Notice;
  onOpenCase: (id: number) => void;
  onNewCase: () => void;
  user: User;
}
const services: Record<string, string> = {
  custom: 'Custom part',
  replacement: 'Replacement',
  repair: 'Robot & device repair',
  repeat: 'Repeat order',
};
const openStatuses = [
  'intake',
  'assessment',
  'approval',
  'production',
  'quality',
  'ready',
  'blocked',
];
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Could not save this change. Please try again.';

function PageTitle({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">Your workshop, connected</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty-state page-empty">
      <Box size={30} strokeWidth={1.5} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

function Status({ value }: { value: string }) {
  return (
    <span className={`badge ${value}`}>
      <span className="status-dot" />
      {statusLabels[value] || value}
    </span>
  );
}

function InlineError({ text }: { text: string }) {
  return text ? (
    <p className="page-form-error" role="alert">
      {text}
    </p>
  ) : null;
}

function CasesPage({ data, onNewCase, onOpenCase }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [service, setService] = useState('all');
  const [sort, setSort] = useState('recent');
  const filtered = useMemo(
    () =>
      data.cases
        .filter((item) => {
          const matches = `${item.reference} ${item.title} ${item.customer} ${item.material}`
            .toLowerCase()
            .includes(query.toLowerCase());
          return (
            matches &&
            (filter === 'all' ||
              (filter === 'open' ? openStatuses.includes(item.status) : item.status === filter)) &&
            (service === 'all' || item.service === service)
          );
        })
        .sort((a, b) =>
          sort === 'due'
            ? (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
            : sort === 'value'
              ? b.amount - a.amount
              : b.createdAt.localeCompare(a.createdAt),
        ),
    [data.cases, query, filter, service, sort],
  );
  const tabs = [
    { id: 'all', label: 'All cases', count: data.cases.length },
    {
      id: 'open',
      label: 'Active',
      count: data.cases.filter((item) => openStatuses.includes(item.status)).length,
    },
    {
      id: 'approval',
      label: 'Needs approval',
      count: data.cases.filter((item) => item.status === 'approval').length,
    },
    {
      id: 'delivered',
      label: 'Delivered',
      count: data.cases.filter((item) => item.status === 'delivered').length,
    },
  ];
  return (
    <>
      <PageTitle
        title="Every part has a story."
        description="Keep every request, decision, and delivery in one place."
        action={
          <button className="button primary" onClick={onNewCase}>
            <Plus size={17} />
            New case
          </button>
        }
      />
      <div className="card cases-panel">
        <div className="business-tabs" role="tablist" aria-label="Case status">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={filter === tab.id}
              className={filter === tab.id ? 'active' : ''}
              onClick={() => setFilter(tab.id)}
            >
              {tab.label}
              <span>{tab.count}</span>
            </button>
          ))}
        </div>
        <div className="business-toolbar">
          <label className="page-search">
            <Search size={17} />
            <input
              aria-label="Search cases"
              placeholder="Search by case, customer, or material…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Clear case search">
                <X size={14} />
              </button>
            )}
          </label>
          <div className="toolbar-select">
            <Filter size={15} />
            <select
              aria-label="Filter by service"
              value={service}
              onChange={(event) => setService(event.target.value)}
            >
              <option value="all">All services</option>
              {Object.entries(services).map(([id, label]) => (
                <option value={id} key={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="toolbar-select">
            <SlidersHorizontal size={15} />
            <select
              aria-label="Sort cases"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="recent">Newest first</option>
              <option value="due">Due date</option>
              <option value="value">Highest value</option>
            </select>
          </div>
        </div>
        {filtered.length ? (
          <div className="business-table-wrap">
            <table className="business-table">
              <thead>
                <tr>
                  <th>Case / project</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Due date</th>
                  <th>Value</th>
                  <th>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <button className="case-name-button" onClick={() => onOpenCase(item.id)}>
                        <span className={`mini-part-icon ${item.service}`}>
                          <Box size={20} />
                        </span>
                        <span>
                          <strong>{item.title}</strong>
                          <small>
                            {item.reference}
                            <span className="text-separator">·</span>
                            {services[item.service]}
                          </small>
                        </span>
                      </button>
                    </td>
                    <td>
                      <span className="table-customer">{item.customer}</span>
                      <small className="table-secondary">{item.owner || 'Unassigned'}</small>
                    </td>
                    <td>
                      <Status value={item.status} />
                    </td>
                    <td>
                      <span
                        className={
                          item.dueDate &&
                          new Date(item.dueDate).getTime() < Date.now() &&
                          item.status !== 'delivered'
                            ? 'date-overdue'
                            : ''
                        }
                      >
                        {dateLabel(item.dueDate)}
                      </span>
                      {item.priority !== 'normal' && (
                        <small className={`priority-label ${item.priority}`}>
                          {item.priority === 'urgent' ? 'Urgent' : 'High priority'}
                        </small>
                      )}
                    </td>
                    <td className="money-cell">{money(item.amount)}</td>
                    <td>
                      <button
                        className="table-arrow"
                        onClick={() => onOpenCase(item.id)}
                        aria-label={`Open ${item.reference}`}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No cases found"
            text="Try a different search or create your first request."
            action={
              <button className="button secondary" onClick={onNewCase}>
                <Plus size={16} />
                Create a case
              </button>
            }
          />
        )}
        <div className="table-bottom">
          <span>
            Showing {filtered.length} of {data.cases.length} cases
          </span>
          <span>
            <ShieldCheck size={14} />
            Every decision stays with its case
          </span>
        </div>
      </div>
      <div className="page-note">
        <CircleHelp size={17} />
        <p>
          Start with the problem. Assess the safest, most practical route: source, repair, make
          in-house, partner, or decline.
        </p>
      </div>
    </>
  );
}

function ProductionPage({ data, refresh, notify, onOpenCase }: Props) {
  const [pending, setPending] = useState<number | null>(null);
  const [machinePending, setMachinePending] = useState<number | null>(null);
  const queue = data.cases.filter((item) => item.status === 'production');
  const waiting = data.cases.filter((item) => item.status === 'approval');
  const onStatus = async (id: number, status: string) => {
    setMachinePending(id);
    try {
      await api(`/machines/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await refresh();
      notify('Equipment status updated.');
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setMachinePending(null);
    }
  };
  const complete = async (id: number) => {
    setPending(id);
    try {
      await api(`/cases/${id}/transition`, {
        method: 'POST',
        body: JSON.stringify({ status: 'quality' }),
      });
      await refresh();
      notify('Production complete. This case is ready for quality checks.');
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setPending(null);
    }
  };
  return (
    <>
      <PageTitle
        title="Good work, in motion."
        description="A focused view of production and the equipment behind it."
      />
      <div className="page-stat-grid">
        <div className="card small-stat">
          <span className="stat-symbol green">
            <Layers3 size={19} />
          </span>
          <div>
            <p>In production</p>
            <strong>
              {queue.length}
              <small>cases</small>
            </strong>
          </div>
        </div>
        <div className="card small-stat">
          <span className="stat-symbol amber">
            <Clock3 size={19} />
          </span>
          <div>
            <p>Awaiting approval</p>
            <strong>
              {waiting.length}
              <small>cases</small>
            </strong>
          </div>
        </div>
        <div className="card small-stat">
          <span className="stat-symbol blue">
            <Printer size={19} />
          </span>
          <div>
            <p>Marked available</p>
            <strong>
              {data.machines.filter((item) => item.status === 'idle').length}
              <small>of {data.machines.length} machines</small>
            </strong>
          </div>
        </div>
      </div>
      <div className="section-heading">
        <div>
          <h2>The production queue</h2>
          <p>Complete the job, then verify the result.</p>
        </div>
        <span className="subtle-pill">
          {queue.reduce((sum, item) => sum + item.quantity, 0)} parts in queue
        </span>
      </div>
      <div className="production-grid">
        {queue.length ? (
          queue.map((item, index) => (
            <article className="card production-job" key={item.id}>
              <div className="job-top">
                <span className="job-position">{String(index + 1).padStart(2, '0')}</span>
                <Status value={item.status} />
              </div>
              <button className="plain-title-button" onClick={() => onOpenCase(item.id)}>
                {item.title}
                <ArrowUpRight size={17} />
              </button>
              <p className="muted">
                {item.reference}
                <span className="text-separator">·</span>
                {item.customer}
              </p>
              <div className="job-meta">
                <div>
                  <span>Material</span>
                  <strong>{item.material || 'To be defined'}</strong>
                </div>
                <div>
                  <span>Quantity</span>
                  <strong>
                    {item.quantity} {item.quantity === 1 ? 'part' : 'parts'}
                  </strong>
                </div>
                <div>
                  <span>Assigned to</span>
                  <strong>{item.owner || 'Unassigned'}</strong>
                </div>
                <div>
                  <span>Due</span>
                  <strong>{dateLabel(item.dueDate)}</strong>
                </div>
              </div>
              <div className="job-footer">
                <span>
                  <ShieldCheck size={15} />
                  Revision {item.revision}
                </span>
                <button
                  className="button secondary small"
                  onClick={() => complete(item.id)}
                  disabled={pending === item.id}
                >
                  {pending === item.id ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : (
                    <Check size={15} />
                  )}
                  Send to quality
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="card full-grid">
            <Empty
              title="The queue is clear"
              text="Cases appear here once the design and quote are approved and production is started."
            />
          </div>
        )}
      </div>
      <div className="section-heading">
        <div>
          <h2>Workshop equipment</h2>
          <p>Manual status. Confirm process qualification before assigning work.</p>
        </div>
        <span className="subtle-pill">
          <span className="status-dot" />
          {data.settings.demoMode ? 'Sample equipment' : 'Equipment register'}
        </span>
      </div>
      <div className="machine-grid">
        {data.machines.map((machine) => (
          <article className="card machine-card" key={machine.id}>
            <div className="machine-card-top">
              <span className="equipment-icon">
                <Printer size={29} strokeWidth={1.5} />
              </span>
              <Status value={machine.status} />
            </div>
            <h3>{machine.name}</h3>
            <p>{machine.model}</p>
            <div className="machine-qualification">
              <ShieldCheck size={14} />
              {machine.qualified ? 'Qualification recorded' : 'Qualification needed'}
            </div>
            <div className="machine-manual">
              <label htmlFor={`machine-${machine.id}`}>Set workshop status</label>
              <select
                id={`machine-${machine.id}`}
                value={machine.status}
                disabled={machinePending === machine.id}
                onChange={(event) => onStatus(machine.id, event.target.value)}
              >
                <option value="idle">Available</option>
                <option value="printing">Printing</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
            <span className="manual-note">Updated by your team · No live telemetry</span>
          </article>
        ))}
      </div>
      <div className="page-note">
        <CircleHelp size={17} />
        <p>
          Printer count is not qualified capacity. Track material, process, dimensional accuracy,
          and repeatability before committing delivery dates.
        </p>
      </div>
    </>
  );
}

type QuoteDraft = {
  caseId: string;
  engineering: string;
  manufacturing: string;
  testing: string;
  shipping: string;
  taxRate: string;
  expiresAt: string;
};
function QuoteCreator({
  data,
  refresh,
  notify,
  onClose,
}: Pick<Props, 'data' | 'refresh' | 'notify'> & { onClose: () => void }) {
  const defaultExpiry = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const [draft, setDraft] = useState<QuoteDraft>({
    caseId: '',
    engineering: '0',
    manufacturing: '0',
    testing: '0',
    shipping: '0',
    taxRate: '18',
    expiresAt: defaultExpiry,
  });
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const selected = data.cases.find((item) => String(item.id) === draft.caseId);
  const subtotal = ['engineering', 'manufacturing', 'testing', 'shipping'].reduce(
    (sum, key) => sum + (Number(draft[key as keyof QuoteDraft]) || 0),
    0,
  );
  const tax = (subtotal * (Number(draft.taxRate) || 0)) / 100;
  const update = (key: keyof QuoteDraft, value: string) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      await api('/quotes', {
        method: 'POST',
        body: JSON.stringify({
          caseId: Number(draft.caseId),
          engineering: Number(draft.engineering),
          manufacturing: Number(draft.manufacturing),
          testing: Number(draft.testing),
          shipping: Number(draft.shipping),
          taxRate: Number(draft.taxRate),
          expiresAt: draft.expiresAt,
        }),
      });
      await refresh();
      notify('Quote draft created.');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      className="business-modal"
      title="Build a clear quote"
      subtitle="Separate the work, agree the scope, and leave no surprises."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          <label className="field">
            <span>Case</span>
            <select
              required
              value={draft.caseId}
              onChange={(event) => update('caseId', event.target.value)}
            >
              <option value="">Choose a case</option>
              {data.cases
                .filter((item) => !['delivered', 'ready'].includes(item.status))
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.reference} — {item.title}
                  </option>
                ))}
            </select>
          </label>
          {selected && (
            <div className="quote-customer">
              <Box size={18} />
              <div>
                <strong>{selected.customer}</strong>
                <span>
                  {selected.quantity} {selected.quantity === 1 ? 'part' : 'parts'} ·{' '}
                  {selected.material || 'Material pending'} · Revision {selected.revision}
                </span>
              </div>
            </div>
          )}
          <div className="form-columns quote-fields">
            {(
              [
                { key: 'engineering', label: 'Engineering & diagnosis' },
                { key: 'manufacturing', label: 'Manufacturing & materials' },
                { key: 'testing', label: 'Inspection & testing' },
                { key: 'shipping', label: 'Packing & shipping' },
              ] as const
            ).map((item) => (
              <label className="field" key={item.key}>
                <span>{item.label} (₹)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={draft[item.key]}
                  onChange={(event) => update(item.key, event.target.value)}
                />
              </label>
            ))}
            <label className="field">
              <span>Tax (%)</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                value={draft.taxRate}
                onChange={(event) => update('taxRate', event.target.value)}
              />
            </label>
            <label className="field">
              <span>Valid through</span>
              <input
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                required
                value={draft.expiresAt}
                onChange={(event) => update('expiresAt', event.target.value)}
              />
            </label>
          </div>
          <div className="quote-preview">
            <div>
              <span>Subtotal</span>
              <strong>{money(subtotal)}</strong>
            </div>
            <div>
              <span>Tax ({draft.taxRate || 0}%)</span>
              <strong>{money(tax)}</strong>
            </div>
            <div className="quote-total">
              <span>Quote total</span>
              <strong>{money(subtotal + tax)}</strong>
            </div>
          </div>
          <p className="fine-print">
            Amounts are for the full case quantity. Review the applicable tax and agreed scope
            before sharing with your customer.
          </p>
          <InlineError text={error} />
        </div>
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={pending || !draft.caseId}>
            {pending ? <LoaderCircle size={16} className="spin" /> : <FileText size={16} />}Save
            quote draft
          </button>
        </div>
      </form>
    </Modal>
  );
}

function QuoteApproval({
  quote,
  refresh,
  notify,
  onClose,
}: {
  quote: Quote;
  refresh: Props['refresh'];
  notify: Notice;
  onClose: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const approve = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await api(`/quotes/${quote.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ confirmed: true }),
      });
      await refresh();
      notify('Customer approval recorded by your team.');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      className="business-modal"
      title="Record customer approval"
      subtitle={`${quote.reference} · ${quote.customer}`}
      onClose={onClose}
    >
      <form onSubmit={approve}>
        <div className="modal-body">
          <div className="approval-summary">
            <FileText size={27} />
            <div>
              <h3>{quote.caseTitle}</h3>
              <p>
                Version {quote.version} · Valid through {dateLabel(quote.expiresAt)}
              </p>
            </div>
            <strong>{money(quote.total)}</strong>
          </div>
          <p className="dialog-explainer">
            Use this after receiving the customer's approval outside this workspace. This records
            the decision against your staff account.
          </p>
          <label className="checkbox-field">
            <input
              type="checkbox"
              required
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              I have received customer approval for this quote version, amount, and scope.
            </span>
          </label>
          <InlineError text={error} />
        </div>
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={!confirmed || pending}>
            {pending ? <LoaderCircle size={16} className="spin" /> : <CheckCircle2 size={16} />}
            Record approval
          </button>
        </div>
      </form>
    </Modal>
  );
}

function QuotesPage(props: Props) {
  const { data, refresh, notify, onOpenCase } = props;
  const [creating, setCreating] = useState(false);
  const [approving, setApproving] = useState<Quote | null>(null);
  const [filter, setFilter] = useState('all');
  const [pending, setPending] = useState<number | null>(null);
  const filtered = data.quotes.filter((item) => filter === 'all' || item.status === filter);
  const currentQuotes = data.quotes.filter(
    (item) =>
      !data.quotes.some((other) => other.caseId === item.caseId && other.version > item.version),
  );
  const total = (status: string) =>
    currentQuotes
      .filter((item) => item.status === status)
      .reduce((sum, item) => sum + item.total, 0);
  const send = async (quote: Quote) => {
    setPending(quote.id);
    try {
      await api(`/quotes/${quote.id}/send`, { method: 'POST' });
      await refresh();
      notify('Quote marked as shared. No email was sent by the workspace.');
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setPending(null);
    }
  };
  return (
    <>
      <PageTitle
        title="Clarity before commitment."
        description="Price the engineering, the making, and the confidence that comes with it."
        action={
          <button className="button primary" onClick={() => setCreating(true)}>
            <Plus size={17} />
            Create quote
          </button>
        }
      />
      <div className="page-stat-grid">
        <div className="card small-stat">
          <span className="stat-symbol blue">
            <FileText size={19} />
          </span>
          <div>
            <p>Current draft value</p>
            <strong>{money(total('draft'))}</strong>
          </div>
        </div>
        <div className="card small-stat">
          <span className="stat-symbol amber">
            <Clock3 size={19} />
          </span>
          <div>
            <p>Awaiting approval</p>
            <strong>{money(total('sent'))}</strong>
          </div>
        </div>
        <div className="card small-stat">
          <span className="stat-symbol green">
            <CheckCircle2 size={19} />
          </span>
          <div>
            <p>Current approved value</p>
            <strong>{money(total('approved'))}</strong>
          </div>
        </div>
      </div>
      <div className="card quotes-panel">
        <div className="business-tabs" role="tablist" aria-label="Quote status">
          {[
            { id: 'all', label: 'All quotes' },
            { id: 'draft', label: 'Drafts' },
            { id: 'sent', label: 'Awaiting approval' },
            { id: 'approved', label: 'Approved' },
          ].map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={filter === tab.id}
              className={filter === tab.id ? 'active' : ''}
              onClick={() => setFilter(tab.id)}
            >
              {tab.label}
              <span>
                {data.quotes.filter((item) => tab.id === 'all' || item.status === tab.id).length}
              </span>
            </button>
          ))}
        </div>
        {filtered.length ? (
          <div className="quote-list">
            {filtered.map((quote) => (
              <article className="quote-row" key={quote.id}>
                <div className="quote-row-leading">
                  <span className="quote-document">
                    <FileText size={23} />
                  </span>
                  <div>
                    <button className="text-link" onClick={() => onOpenCase(quote.caseId)}>
                      {quote.caseTitle}
                      <ArrowUpRight size={14} />
                    </button>
                    <p>
                      {quote.reference} · v{quote.version} · {quote.customer}
                    </p>
                  </div>
                </div>
                <div className="quote-row-value">
                  <strong>{money(quote.total)}</strong>
                  <span>Valid through {dateLabel(quote.expiresAt)}</span>
                </div>
                <Status value={quote.status} />
                <div className="quote-actions">
                  {!currentQuotes.some((item) => item.id === quote.id) && (
                    <span className="approved-caption">Superseded version</span>
                  )}
                  {currentQuotes.some((item) => item.id === quote.id) &&
                    quote.status === 'draft' && (
                      <button
                        className="button secondary small"
                        disabled={pending === quote.id}
                        onClick={() => send(quote)}
                      >
                        {pending === quote.id ? (
                          <LoaderCircle size={15} className="spin" />
                        ) : (
                          <ArrowUpRight size={15} />
                        )}
                        Mark as shared
                      </button>
                    )}
                  {currentQuotes.some((item) => item.id === quote.id) &&
                    quote.status === 'sent' && (
                      <button
                        className="button secondary small"
                        onClick={() => setApproving(quote)}
                      >
                        <Check size={15} />
                        Record approval
                      </button>
                    )}
                  {currentQuotes.some((item) => item.id === quote.id) &&
                    quote.status === 'approved' && (
                      <span className="approved-caption">
                        <ShieldCheck size={15} />
                        Approval recorded
                      </span>
                    )}
                </div>
                <details className="quote-breakdown">
                  <summary>View cost breakdown</summary>
                  <div>
                    <span>
                      Engineering<strong>{money(quote.engineering)}</strong>
                    </span>
                    <span>
                      Manufacturing<strong>{money(quote.manufacturing)}</strong>
                    </span>
                    <span>
                      Testing<strong>{money(quote.testing)}</strong>
                    </span>
                    <span>
                      Shipping<strong>{money(quote.shipping)}</strong>
                    </span>
                    <span>
                      Tax<strong>{quote.taxRate}%</strong>
                    </span>
                  </div>
                </details>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="No quotes here yet"
            text="Create an itemized quote after you understand the scope."
            action={
              <button className="button secondary" onClick={() => setCreating(true)}>
                <Plus size={16} />
                Create a quote
              </button>
            }
          />
        )}
      </div>
      <div className="page-note">
        <CircleHelp size={17} />
        <p>
          Sharing and customer approval are recorded by staff. Send the quote using your usual
          channel first; this workspace does not send email or collect payments.
        </p>
      </div>
      {creating && (
        <QuoteCreator
          data={data}
          refresh={refresh}
          notify={notify}
          onClose={() => setCreating(false)}
        />
      )}{' '}
      {approving && (
        <QuoteApproval
          quote={approving}
          refresh={refresh}
          notify={notify}
          onClose={() => setApproving(null)}
        />
      )}
    </>
  );
}

function QualityRow({
  check,
  refresh,
  notify,
  onDirty,
}: {
  check: QualityCheck;
  refresh: Props['refresh'];
  notify: Notice;
  onDirty: (id: number, dirty: boolean) => void;
}) {
  const [actual, setActual] = useState(check.actual);
  const [result, setResult] = useState(check.passed === null ? '' : check.passed ? 'pass' : 'fail');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setActual(check.actual);
    setResult(check.passed === null ? '' : check.passed ? 'pass' : 'fail');
  }, [check.actual, check.passed]);
  const dirty =
    actual !== check.actual ||
    result !== (check.passed === null ? '' : check.passed ? 'pass' : 'fail');
  useEffect(() => {
    onDirty(check.id, dirty);
    return () => onDirty(check.id, false);
  }, [check.id, dirty, onDirty]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      await api(`/quality/${check.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ actual, passed: result === 'pass' }),
      });
      await refresh();
      notify('Inspection result saved.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <form className="quality-check-row" onSubmit={submit}>
      <div className="quality-check-heading">
        <span
          className={`check-indicator ${check.passed === true ? 'passed' : check.passed === false ? 'failed' : ''}`}
        >
          {check.passed === true ? (
            <Check size={17} />
          ) : check.passed === false ? (
            <X size={17} />
          ) : (
            <span />
          )}
        </span>
        <div>
          <h4>
            {check.label}
            {check.required && <span>Required</span>}
          </h4>
          <p>Acceptance: {check.expected}</p>
          {check.checkedBy && <small>Last recorded by {check.checkedBy}</small>}
        </div>
      </div>
      <div className="quality-check-inputs">
        <label className="field">
          <span>Measured result / observation</span>
          <input
            aria-label={`${check.label}: measured result`}
            required
            value={actual}
            onChange={(event) => setActual(event.target.value)}
            placeholder="Record what you verified"
          />
        </label>
        <label className="field result-field">
          <span>Outcome</span>
          <select
            aria-label={`${check.label}: outcome`}
            required
            value={result}
            onChange={(event) => setResult(event.target.value)}
          >
            <option value="">Select</option>
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
          </select>
        </label>
        <button
          className="button secondary small"
          disabled={pending || !dirty || !actual.trim() || !result}
          type="submit"
        >
          {pending ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}Save
        </button>
      </div>
      <InlineError text={error} />
    </form>
  );
}

function QualityPage({ data, refresh, notify, onOpenCase }: Props) {
  const qualityCases = data.cases.filter((item) => item.status === 'quality');
  const [selectedId, setSelectedId] = useState<number | null>(qualityCases[0]?.id || null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const selected = qualityCases.find((item) => item.id === selectedId) || qualityCases[0];
  const [dirtyIds, setDirtyIds] = useState<number[]>([]);
  const onDirty = useCallback(
    (id: number, dirty: boolean) =>
      setDirtyIds((previous) =>
        dirty
          ? previous.includes(id)
            ? previous
            : [...previous, id]
          : previous.includes(id)
            ? previous.filter((item) => item !== id)
            : previous,
      ),
    [],
  );
  const checks = data.qualityChecks.filter((check) => check.caseId === selected?.id);
  const completed = checks.filter((check) => check.passed === true).length;
  const requiredChecks = checks.filter((check) => check.required);
  const canRelease =
    requiredChecks.length > 0 &&
    requiredChecks.every((check) => check.passed === true) &&
    dirtyIds.length === 0;
  const release = async () => {
    if (!selected) return;
    setPending(true);
    setError('');
    try {
      await api(`/cases/${selected.id}/transition`, {
        method: 'POST',
        body: JSON.stringify({ status: 'ready' }),
      });
      await refresh();
      notify(`${selected.reference} passed quality and is ready to dispatch.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <PageTitle
        title="Confidence, checked."
        description="A working outcome is earned at inspection. Keep the evidence with the part."
      />
      <div className="quality-banner">
        <div className="quality-banner-icon">
          <ShieldCheck size={26} />
        </div>
        <div>
          <h3>Quality is a release gate.</h3>
          <p>
            Record actual results. Every required check must pass before a case can move to
            dispatch.
          </p>
        </div>
        <span>
          {qualityCases.length}
          <small>awaiting inspection</small>
        </span>
      </div>
      {qualityCases.length ? (
        <div className="quality-layout">
          <aside className="card inspection-queue">
            <div className="panel-heading">
              <h3>Inspection queue</h3>
              <span>{qualityCases.length}</span>
            </div>
            {qualityCases.map((item) => {
              const itemChecks = data.qualityChecks.filter((check) => check.caseId === item.id);
              return (
                <button
                  className={`inspection-case ${item.id === selected?.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedId(item.id);
                    setError('');
                  }}
                  key={item.id}
                >
                  <div>
                    <span>{item.reference}</span>
                    <ChevronRight size={15} />
                  </div>
                  <strong>{item.title}</strong>
                  <small>{item.customer}</small>
                  <div className="inspection-progress">
                    <span
                      style={{
                        width: `${itemChecks.length ? (itemChecks.filter((check) => check.passed === true).length / itemChecks.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <small>
                    {itemChecks.filter((check) => check.passed === true).length} /{' '}
                    {itemChecks.length} checks passed
                  </small>
                </button>
              );
            })}
          </aside>
          <section className="card inspection-detail">
            <div className="inspection-detail-header">
              <div>
                <p className="eyebrow">
                  {selected.reference} · Revision {selected.revision}
                </p>
                <h2>{selected.title}</h2>
                <p>
                  {selected.quantity} {selected.quantity === 1 ? 'part' : 'parts'} ·{' '}
                  {selected.material || 'Material not recorded'}
                </p>
              </div>
              <button className="button secondary small" onClick={() => onOpenCase(selected.id)}>
                Case details
                <ArrowUpRight size={15} />
              </button>
            </div>
            <div className="inspection-section-title">
              <ClipboardCheck size={17} />
              <h3>Acceptance checklist</h3>
              <span>
                {completed} of {checks.length} passed
              </span>
            </div>
            {checks.length ? (
              checks.map((check) => (
                <QualityRow
                  key={check.id}
                  check={check}
                  refresh={refresh}
                  notify={notify}
                  onDirty={onDirty}
                />
              ))
            ) : (
              <Empty
                title="No inspection checklist"
                text="A required checklist must exist before this case can be released."
              />
            )}
            <div className="quality-release">
              <InlineError text={error} />
              <div>
                <span>
                  <ShieldCheck size={18} />
                  {dirtyIds.length
                    ? 'Save your inspection changes before release'
                    : canRelease
                      ? 'All required checks passed'
                      : 'Complete all required checks to release'}
                </span>
                <button
                  className="button primary"
                  onClick={release}
                  disabled={!canRelease || pending}
                >
                  {pending ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  Release to dispatch
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="card">
          <Empty
            title="Nothing waiting at the bench"
            text="Complete a production job to begin its quality checks."
          />
        </div>
      )}
      <div className="page-note">
        <CircleHelp size={17} />
        <p>
          An inspection record supports traceability. Use suitable calibrated measurement equipment
          and the acceptance criteria agreed for this specific application.
        </p>
      </div>
    </>
  );
}

function ReorderModal({
  part,
  refresh,
  notify,
  onClose,
  onOpenCase,
}: {
  part: Part;
  refresh: Props['refresh'];
  notify: Notice;
  onClose: () => void;
  onOpenCase: Props['onOpenCase'];
}) {
  const [quantity, setQuantity] = useState(1);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const result = await api<{ id?: number; case?: CaseRecord; caseId?: number }>(
        `/parts/${part.id}/reorder`,
        { method: 'POST', body: JSON.stringify({ quantity, confirmed }) },
      );
      await refresh();
      notify('Repeat case created. Review the quote and production readiness before manufacture.');
      onClose();
      const id = result.case?.id || result.caseId || result.id;
      if (id) onOpenCase(id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      className="business-modal"
      title="Make a good thing again."
      subtitle="A repeat order keeps the approved revision and a new inspection record."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          <div className="reorder-part">
            <span className="mini-part-icon">
              <Box size={30} />
            </span>
            <div>
              <h3>{part.name}</h3>
              <p>
                {part.code} · Rev {part.revision} · {part.material}
              </p>
              <span>{part.customer}</span>
            </div>
          </div>
          <label className="field">
            <span>Quantity</span>
            <input
              type="number"
              min="1"
              max="10000"
              step="1"
              required
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              required
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              I confirm the intended use, mating interfaces, and operating conditions are unchanged,
              and we have permission to reproduce this design.
            </span>
          </label>
          <p className="fine-print">
            Changed requirements need a new assessment and revision. A repeat case still needs a
            current quote and quality release.
          </p>
          <InlineError text={error} />
        </div>
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="button primary"
            disabled={pending || !confirmed || quantity < 1}
          >
            {pending ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}Create
            repeat case
          </button>
        </div>
      </form>
    </Modal>
  );
}

function LibraryPage(props: Props) {
  const { data, refresh, notify, onOpenCase } = props;
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [reordering, setReordering] = useState<Part | null>(null);
  const categories = [...new Set(data.parts.map((part) => part.category))];
  const parts = data.parts.filter(
    (part) =>
      `${part.name} ${part.code} ${part.customer} ${part.material}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (category === 'all' || part.category === category),
  );
  return (
    <>
      <PageTitle
        title="Build once. Learn forever."
        description="Your private record of verified parts, revisions, and repeatable work."
        action={
          <span className="private-library">
            <FolderLock size={16} />
            Private to your workspace
          </span>
        }
      />
      <div className="library-feature">
        <div>
          <span className="eyebrow">The value is in the evidence</span>
          <h2>
            Every verified part is
            <br />a head start on the next one.
          </h2>
          <p>
            Reuse approved designs when the use and interfaces stay the same. Keep every batch
            traceable.
          </p>
        </div>
        <div className="library-feature-visual" aria-hidden="true">
          <div className="library-floating-part">
            <Layers3 size={66} strokeWidth={1} />
          </div>
          <span className="library-verified">
            <CheckCircle2 size={14} />
            Revision controlled
          </span>
          <span className="library-part-count">
            {data.parts.length}
            <small>verified records</small>
          </span>
        </div>
      </div>
      <div className="library-toolbar">
        <label className="page-search">
          <Search size={17} />
          <input
            aria-label="Search part library"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a part, customer, or material…"
          />
        </label>
        <div className="toolbar-select">
          <Filter size={15} />
          <select
            aria-label="Filter part category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="all">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <span className="library-result-count">
          {parts.length} {parts.length === 1 ? 'part' : 'parts'}
        </span>
      </div>
      <div className="library-grid">
        {parts.map((part, index) => (
          <article className="card part-card" key={part.id}>
            <div className={`part-card-visual visual-${index % 4}`}>
              <span className="part-revision">Rev {part.revision}</span>
              <div className={`css-part part-shape-${index % 3}`} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <span className="part-illustration-label">Illustration</span>
              <span className="part-material">{part.material}</span>
            </div>
            <div className="part-card-content">
              <span className="part-code">{part.code}</span>
              <h3>{part.name}</h3>
              <p>{part.customer}</p>
              <div className="part-record-meta">
                <span>
                  <Package size={13} />
                  {part.orders} {part.orders === 1 ? 'order' : 'orders'}
                </span>
                <span>Last made {dateLabel(part.lastMade)}</span>
              </div>
              <div className="part-card-actions">
                <button className="button secondary small" onClick={() => onOpenCase(part.caseId)}>
                  View record
                  <ArrowUpRight size={14} />
                </button>
                <button className="button primary small" onClick={() => setReordering(part)}>
                  <Plus size={14} />
                  Reorder
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {parts.length === 0 && (
        <div className="card">
          <Empty
            title="No matching parts"
            text={
              query || category !== 'all'
                ? 'Try another search or category.'
                : 'Verified part records are created when accepted work is marked delivered.'
            }
          />
        </div>
      )}
      <div className="page-note">
        <FolderLock size={17} />
        <p>
          Customer designs stay private. A library entry is a traceable part record; it is not a
          public catalog or an automatic license to reproduce a design.
        </p>
      </div>
      {reordering && (
        <ReorderModal
          part={reordering}
          refresh={refresh}
          notify={notify}
          onOpenCase={onOpenCase}
          onClose={() => setReordering(null)}
        />
      )}
    </>
  );
}

function InsightsPage({ data }: Props) {
  const active = data.cases.filter((item) => openStatuses.includes(item.status));
  const delivered = data.cases.filter((item) => item.status === 'delivered');
  const accepted = data.cases.filter((item) =>
    ['production', 'quality', 'ready', 'delivered'].includes(item.status),
  );
  const caseValue = data.cases.reduce((sum, item) => sum + item.amount, 0);
  const deliveredValue = delivered.reduce((sum, item) => sum + item.amount, 0);
  const acceptedValue = accepted.reduce((sum, item) => {
    const quote = data.quotes
      .filter((quote) => quote.caseId === item.id && quote.status === 'approved')
      .sort((a, b) => b.version - a.version)[0];
    return quote
      ? sum + quote.engineering + quote.manufacturing + quote.testing + quote.shipping
      : sum;
  }, 0);
  const acceptedCost = accepted.reduce((sum, item) => sum + item.cost, 0);
  const contribution = acceptedValue - acceptedCost;
  const margin = acceptedValue ? contribution / acceptedValue : 0;
  const breakEven = margin > 0 ? data.settings.monthlyOverhead / margin : null;
  const hours = active.reduce((sum, item) => sum + item.engineeringHours, 0);
  const capacityPercent = data.settings.engineeringCapacity
    ? (hours / data.settings.engineeringCapacity) * 100
    : 0;
  const serviceData = Object.entries(services).map(([id, label]) => ({
    id,
    label,
    count: data.cases.filter((item) => item.service === id).length,
    amount: data.cases
      .filter((item) => item.service === id)
      .reduce((sum, item) => sum + item.amount, 0),
  }));
  const recommendations = [
    {
      icon: Wrench,
      title: 'Make the assessment the first product.',
      text: 'Charge for diagnosis and engineering. Decide whether sourcing, repair, manufacture, or a qualified partner gives the best outcome.',
    },
    {
      icon: ShieldCheck,
      title: 'Qualify processes before adding printers.',
      text: 'Invest in measurement, material records, fit checks, and repeatable testing. A printer becomes useful capacity only when its process is proven.',
    },
    {
      icon: Layers3,
      title: 'Turn completed work into repeat supply.',
      text: 'Keep revisions and acceptance evidence together. Confirm unchanged conditions before reordering, then inspect the new batch.',
    },
    {
      icon: TrendingUp,
      title: 'Validate demand in one city.',
      text: 'Start with small factories and robotics / IoT labs. Track paid demand, actual engineering time, repeat orders, and contribution per case.',
    },
  ];
  return (
    <>
      <PageTitle
        title="See what moves you forward."
        description="A clear view of your case data, with planning assumptions kept visible."
        action={
          <a
            className="button secondary"
            href="/Tobor_Product_and_Factory_Plan.pdf"
            target="_blank"
            rel="noreferrer"
          >
            <FileText size={16} />
            Read the blueprint
            <ArrowUpRight size={15} />
          </a>
        }
      />
      <div className="page-stat-grid">
        <div className="card small-stat">
          <span className="stat-symbol green">
            <TrendingUp size={19} />
          </span>
          <div>
            <p>All recorded case value</p>
            <strong>{money(caseValue)}</strong>
            <span className="stat-footnote">
              Across {data.cases.length} cases · not cash received
            </span>
          </div>
        </div>
        <div className="card small-stat">
          <span className="stat-symbol blue">
            <CheckCircle2 size={19} />
          </span>
          <div>
            <p>Delivered case value</p>
            <strong>{money(deliveredValue)}</strong>
            <span className="stat-footnote">{delivered.length} delivered cases · all time</span>
          </div>
        </div>
        <div className="card small-stat">
          <span className="stat-symbol amber">
            <Layers3 size={19} />
          </span>
          <div>
            <p>Repeat case share</p>
            <strong>
              {data.cases.length
                ? Math.round(
                    (data.cases.filter((item) => item.service === 'repeat').length /
                      data.cases.length) *
                      100,
                  )
                : 0}
              <small>%</small>
            </strong>
            <span className="stat-footnote">Repeat cases / all recorded cases</span>
          </div>
        </div>
      </div>
      <div className="insights-grid">
        <section className="card insight-panel">
          <div className="panel-heading">
            <div>
              <h3>Where the work comes from</h3>
              <p>Service mix across your recorded cases</p>
            </div>
            <span className="subtle-pill">All time</span>
          </div>
          <div className="service-bars">
            {serviceData.map((item) => (
              <div className="service-bar-row" key={item.id}>
                <div>
                  <span>{item.label}</span>
                  <strong>
                    {item.count}
                    <small>{item.count === 1 ? 'case' : 'cases'}</small>
                  </strong>
                </div>
                <div className="service-bar-track">
                  <span
                    className={`service-bar-fill ${item.id}`}
                    style={{
                      width: `${data.cases.length ? (item.count / data.cases.length) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="service-bar-value">
                  {money(item.amount)} in recorded case value
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="card insight-panel capacity-panel">
          <div className="panel-heading">
            <div>
              <h3>Engineering is the constraint</h3>
              <p>Active estimated hours vs. configured monthly capacity</p>
            </div>
            <Clock3 size={20} />
          </div>
          <div className="capacity-display">
            <strong>
              {hours}
              <span>hrs</span>
            </strong>
            <span>of {data.settings.engineeringCapacity} hrs / month</span>
          </div>
          <div className="capacity-track">
            <span style={{ width: `${Math.min(100, capacityPercent)}%` }} />
          </div>
          <div className="capacity-ticks">
            <span>0 hrs</span>
            <span>{data.settings.engineeringCapacity} hrs</span>
          </div>
          <div className="capacity-callout">
            <Sparkles size={18} />
            <p>
              {capacityPercent > 100
                ? 'Current estimated work exceeds one month of configured capacity. Review priorities and due dates.'
                : 'Use estimated engineering hours to review commitments before accepting another job.'}
            </p>
          </div>
          <p className="fine-print">
            This compares all active estimates to one month of capacity. It is a planning indicator,
            not measured utilization or a delivery forecast.
          </p>
        </section>
      </div>
      <section className="card economics-panel">
        <div className="panel-heading">
          <div>
            <h3>Check the economics early.</h3>
            <p>A simple scenario using cases in production or later</p>
          </div>
          <span className="assumption-label">Planning indicator</span>
        </div>
        <div className="economics-grid">
          <div>
            <span>Approved work, excluding tax</span>
            <strong>{money(acceptedValue)}</strong>
            <small>{accepted.length} cases · all time</small>
          </div>
          <div>
            <span>Recorded direct costs</span>
            <strong>{money(acceptedCost)}</strong>
            <small>Estimate completeness matters</small>
          </div>
          <div>
            <span>Estimated contribution</span>
            <strong>{money(contribution)}</strong>
            <small>
              {acceptedValue
                ? `${Math.round(margin * 100)}% of recorded value`
                : 'No accepted case value yet'}
            </small>
          </div>
          <div className="economics-highlight">
            <span>Monthly break-even scenario</span>
            <strong>{breakEven === null ? '—' : money(breakEven)}</strong>
            <small>{money(data.settings.monthlyOverhead)} overhead ÷ margin</small>
          </div>
        </div>
        <p className="fine-print">
          Revenue uses approved quote line items before tax; it is not cash received. Direct costs
          may be incomplete. This is an illustrative planning calculation, not accounting profit or
          a financial forecast. Configure overhead in Settings and replace estimates with actual
          costs.
        </p>
      </section>
      <div className="section-heading">
        <div>
          <h2>A practical path to a better Tobor</h2>
          <p>Based on the supplied product and factory blueprint, 6 September 2026.</p>
        </div>
      </div>
      <div className="improvement-grid">
        {recommendations.map((item, index) => (
          <article className="card improvement-card" key={item.title}>
            <span className="improvement-number">0{index + 1}</span>
            <item.icon size={23} strokeWidth={1.5} />
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </div>
      <section className="workflow-explainer">
        <div>
          <span className="eyebrow">How Tobor works</span>
          <h2>
            One accountable service.
            <br />
            An evidence trail at every step.
          </h2>
          <p>
            A customer brings a problem. Your team owns the assessment, chooses the right route,
            agrees the scope and price, makes or repairs it, and verifies the result.
          </p>
        </div>
        <ol>
          {[
            {
              title: 'Understand & assess',
              text: 'Capture the use, interfaces, risks, and best fulfillment route.',
            },
            {
              title: 'Agree & produce',
              text: 'Approve the design and quote before committing production.',
            },
            {
              title: 'Verify & deliver',
              text: 'Save measured results. Release only when required checks pass.',
            },
            {
              title: 'Remember & repeat',
              text: 'Keep the approved revision and confirm conditions before the next batch.',
            },
          ].map((step, index) => (
            <li key={step.title}>
              <span>{index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <div className="page-note">
        <CircleHelp size={17} />
        <p>
          The blueprint proposes a local managed service first. Location, equipment capability,
          demand, costs, and budgets remain assumptions until verified with your operation.
        </p>
      </div>
    </>
  );
}

function SettingsPage({ data, refresh, notify, user }: Props) {
  const [draft, setDraft] = useState<Settings>({ ...data.settings });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setDraft({ ...data.settings });
  }, [
    data.settings.workspaceName,
    data.settings.city,
    data.settings.hourlyRate,
    data.settings.monthlyOverhead,
    data.settings.engineeringCapacity,
  ]);
  const dirty = [
    'workspaceName',
    'city',
    'hourlyRate',
    'monthlyOverhead',
    'engineeringCapacity',
  ].some((key) => draft[key as keyof Settings] !== data.settings[key as keyof Settings]);
  const update = (key: keyof Settings, value: string | number) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      await api('/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          workspaceName: draft.workspaceName,
          city: draft.city,
          hourlyRate: draft.hourlyRate,
          monthlyOverhead: draft.monthlyOverhead,
          engineeringCapacity: draft.engineeringCapacity,
        }),
      });
      await refresh();
      notify('Workspace settings saved.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <PageTitle
        title="Make room for your way of working."
        description="Set the workshop details and assumptions behind your workspace."
      />
      <div className="settings-layout">
        <form className="card workspace-settings" onSubmit={save}>
          <div className="settings-section">
            <div className="settings-section-title">
              <span className="stat-symbol green">
                <Settings2 size={19} />
              </span>
              <div>
                <h3>Workspace details</h3>
                <p>The name and place behind every case.</p>
              </div>
            </div>
            <div className="form-columns">
              <label className="field">
                <span>Workspace name</span>
                <input
                  required
                  maxLength={80}
                  value={draft.workspaceName}
                  onChange={(event) => update('workspaceName', event.target.value)}
                />
              </label>
              <label className="field">
                <span>City</span>
                <input
                  required
                  maxLength={80}
                  value={draft.city}
                  onChange={(event) => update('city', event.target.value)}
                />
              </label>
            </div>
          </div>
          <div className="settings-section">
            <div className="settings-section-title">
              <span className="stat-symbol amber">
                <TrendingUp size={19} />
              </span>
              <div>
                <h3>Planning assumptions</h3>
                <p>Use figures from your own operation as they become available.</p>
              </div>
            </div>
            <div className="form-columns">
              <label className="field">
                <span>Engineering rate (₹ / hour)</span>
                <input
                  type="number"
                  min="0"
                  max="1000000"
                  step="1"
                  required
                  value={draft.hourlyRate}
                  onChange={(event) => update('hourlyRate', Number(event.target.value))}
                />
                <small>Your reference rate when pricing engineering work.</small>
              </label>
              <label className="field">
                <span>Monthly overhead (₹)</span>
                <input
                  type="number"
                  min="0"
                  max="100000000"
                  step="1"
                  required
                  value={draft.monthlyOverhead}
                  onChange={(event) => update('monthlyOverhead', Number(event.target.value))}
                />
                <small>Rent, staff, utilities, and other fixed monthly costs.</small>
              </label>
              <label className="field">
                <span>Monthly engineering capacity (hours)</span>
                <input
                  type="number"
                  min="1"
                  max="100000"
                  step="1"
                  required
                  value={draft.engineeringCapacity}
                  onChange={(event) => update('engineeringCapacity', Number(event.target.value))}
                />
                <small>Available engineering time, allowing for non-project work.</small>
              </label>
              <div className="field">
                <span>Workspace currency</span>
                <div className="readonly-field">INR · Indian rupee</div>
                <small>The blueprint and quote amounts use INR.</small>
              </div>
            </div>
          </div>
          <div className="settings-save">
            <InlineError text={error} />
            <div>
              <span className="muted">
                {dirty ? 'You have unsaved changes' : 'Your settings are up to date'}
              </span>
              <button type="submit" className="button primary" disabled={pending || !dirty}>
                {pending ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Save
                changes
              </button>
            </div>
          </div>
        </form>
        <aside className="settings-aside">
          <div className="card profile-card">
            <div className="profile-avatar">
              {user.name
                .split(' ')
                .map((item) => item[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </div>
            <h3>{user.name}</h3>
            <p>{user.email}</p>
            <span className="subtle-pill">
              {user.role === 'admin' ? 'Workspace administrator' : user.role}
            </span>
          </div>
          <div className="card settings-info">
            <ShieldCheck size={24} strokeWidth={1.5} />
            <h3>A workspace with memory.</h3>
            <p>
              Changes to cases, quotes, and inspections stay in the activity record with the
              responsible team member.
            </p>
            <div>
              <span className="status-dot" />
              {data.settings.demoMode ? 'Sample data workspace' : 'Your workshop data'}
            </div>
          </div>
          <div className="settings-source">
            <FileText size={19} />
            <p>
              Built around your Tobor blueprint.
              <a href="/Tobor_Product_and_Factory_Plan.pdf" target="_blank" rel="noreferrer">
                Open source document
                <ArrowUpRight size={13} />
              </a>
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

export function WorkspacePage(props: Props) {
  switch (props.page) {
    case 'cases':
      return <CasesPage {...props} />;
    case 'production':
      return <ProductionPage {...props} />;
    case 'quotes':
      return <QuotesPage {...props} />;
    case 'quality':
      return <QualityPage {...props} />;
    case 'library':
      return <LibraryPage {...props} />;
    case 'insights':
      return <InsightsPage {...props} />;
    case 'settings':
      return <SettingsPage {...props} />;
    default:
      return null;
  }
}
