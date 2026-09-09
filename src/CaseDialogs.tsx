import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Box,
  Check,
  CircleCheck,
  Download,
  FileText,
  Layers3,
  LoaderCircle,
  Paperclip,
  Plus,
  ShieldCheck,
  Upload,
  Wrench,
} from 'lucide-react';
import type { CaseRecord, CaseStatus, DashboardData, ServiceType } from '../shared/types';
import { api, dateLabel, money, statusLabels } from './api';
import Modal from './Modal';
type Notify = (message: string, kind?: 'success' | 'error') => void;
export function NewCaseModal({
  onClose,
  onCreated,
  notify,
}: {
  onClose: () => void;
  onCreated: (id: number) => Promise<void>;
  notify: Notify;
}) {
  const [service, setService] = useState<ServiceType>('custom'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form);
    setBusy(true);
    setError('');
    try {
      const result = await api<CaseRecord>('/cases', {
        method: 'POST',
        body: JSON.stringify({
          ...body,
          service,
          quantity: Number(form.get('quantity')),
          owner: 'Unassigned',
        }),
      });
      notify('Request created. Ready for your engineering assessment.');
      await onCreated(result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Let’s make something happen."
      subtitle="Start with what you need. We’ll keep the details together."
      onClose={onClose}
      wide
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          <div className="service-picker">
            {[
              {
                id: 'custom',
                label: 'Make a part',
                desc: 'An idea, ready to take shape',
                icon: Layers3,
              },
              {
                id: 'replacement',
                label: 'Replace a part',
                desc: 'Give something a second life',
                icon: Box,
              },
              {
                id: 'repair',
                label: 'Repair a device',
                desc: 'Get supported equipment working',
                icon: Wrench,
              },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                className={service === s.id ? 'selected' : ''}
                aria-pressed={service === s.id}
                onClick={() => setService(s.id as ServiceType)}
              >
                <s.icon size={22} />
                <strong>{s.label}</strong>
                <span>{s.desc}</span>
                {service === s.id && <Check size={14} className="service-check" />}
              </button>
            ))}
          </div>
          <div className="form-grid">
            <label className="field full">
              Request title
              <input
                name="title"
                placeholder={
                  service === 'repair'
                    ? 'e.g. Lab robot with intermittent sensor'
                    : 'e.g. Custom sensor mounting bracket'
                }
                required
                minLength={3}
                maxLength={160}
              />
            </label>
            <label className="field">
              Customer / organization
              <input name="customer" placeholder="e.g. Orbit Robotics" required maxLength={120} />
            </label>
            <label className="field">
              Contact email
              <input name="email" type="email" placeholder="name@company.com" maxLength={254} />
            </label>
            <label className="field full">
              What do you need?
              <textarea
                name="description"
                placeholder="Describe the problem, what failed, and the outcome you need."
                rows={3}
                required
                maxLength={5000}
              />
            </label>
            <label className="field full">
              Intended use & environment
              <textarea
                name="intendedUse"
                placeholder="Where will it be used? Include loads, temperature, exposure, and what could happen if it fails."
                rows={2}
                required
                maxLength={3000}
              />
            </label>
            <label className="field">
              Dimensions & units
              <input
                name="dimensions"
                placeholder="e.g. 60 × 40 × 5 mm, or sample needed"
                maxLength={1000}
              />
            </label>
            <label className="field">
              Asset / device model
              <input
                name="asset"
                placeholder="Model or serial number, if available"
                maxLength={200}
              />
            </label>
            <label className="field">
              Quantity
              <input name="quantity" type="number" min={1} max={10000} defaultValue={1} required />
            </label>
            <label className="field">
              Preferred material
              <select name="material" defaultValue="To be assessed">
                <option>To be assessed</option>
                <option>PLA</option>
                <option>PETG</option>
                <option>TPU</option>
                <option>ASA</option>
                <option>Nylon</option>
                <option>Metal — partner</option>
                <option>Electronics</option>
              </select>
            </label>
            <label className="field">
              Requested date
              <input
                name="dueDate"
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                required
              />
            </label>
            <label className="field">
              Priority
              <select name="priority" defaultValue="normal">
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label className="field full">
              Consequence of failure
              <select name="risk" defaultValue="review">
                <option value="low">Noncritical accessory — low consequence</option>
                <option value="review">Needs engineering assessment</option>
                <option value="specialist">
                  Safety / high energy / medical — specialist referral
                </option>
              </select>
            </label>
          </div>
          <div className="info-callout">
            <ShieldCheck size={19} />
            <p>
              Every request starts with assessment. An engineer verifies fit, scope, and capability
              before anything goes into production. Attach drawings and photos after creating the
              case.
            </p>
          </div>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="button secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />} Create request
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function CaseDetailModal({
  record,
  data,
  refresh,
  notify,
  onClose,
}: {
  record: CaseRecord;
  data: DashboardData;
  refresh: () => Promise<void>;
  notify: Notify;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [tab, setTab] = useState('details'),
    [error, setError] = useState(''),
    [confirm, setConfirm] = useState(false);
  const [files, setFiles] = useState<
    { id: number; filename: string; size: number; createdAt: string }[]
  >([]);
  useEffect(() => {
    api<typeof files>(`/cases/${record.id}/files`)
      .then(setFiles)
      .catch(() => {});
  }, [record.id]);
  async function mutate(path: string, body: unknown, method = 'POST') {
    setBusy(true);
    setError('');
    try {
      await api(path, { method, body: JSON.stringify(body) });
      await refresh();
      notify('Case updated.');
      setConfirm(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void mutate(
      `/cases/${record.id}`,
      {
        ...Object.fromEntries(form),
        cost: Number(form.get('cost')),
        engineeringHours: Number(form.get('engineeringHours')),
      },
      'PATCH',
    );
  };
  const transitions: Partial<Record<CaseStatus, CaseStatus>> = {
    intake: 'assessment',
    assessment: 'approval',
    approval: 'production',
    production: 'quality',
    quality: 'ready',
    ready: 'delivered',
    blocked: 'assessment',
  };
  const next = transitions[record.status];
  const quotes = data.quotes.filter((q) => q.caseId === record.id),
    checks = data.qualityChecks.filter((q) => q.caseId === record.id);
  const activities = data.activities.filter((a) => a.caseId === record.id);
  return (
    <Modal
      title={record.title}
      subtitle={`${record.reference} · ${record.customer} · Revision ${record.revision}`}
      onClose={onClose}
      wide
    >
      <div className="detail-overview">
        <span className={`badge ${record.status}`}>
          <i />
          {statusLabels[record.status]}
        </span>
        <span className="muted">Due {dateLabel(record.dueDate)}</span>
        <span className={`priority-label ${record.priority}`}>{record.priority} priority</span>
      </div>
      <div className="detail-tabs" role="tablist" aria-label="Case information">
        {['details', 'approvals', 'files', 'history'].map((t) => (
          <button
            id={`tab-${t}`}
            role="tab"
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            key={t}
            onClick={() => setTab(t)}
          >
            {t === 'files' ? `Files (${files.length})` : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div
        className="modal-body"
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        {tab === 'details' && (
          <form onSubmit={save} id="case-edit" key={`${record.id}-${record.revision}`}>
            <div className="form-grid">
              <label className="field full">
                Request description
                <textarea
                  name="description"
                  defaultValue={record.description}
                  rows={3}
                  maxLength={5000}
                />
              </label>
              <label className="field full">
                Intended use & environment
                <textarea
                  name="intendedUse"
                  defaultValue={record.intendedUse}
                  rows={2}
                  maxLength={3000}
                />
              </label>
              <label className="field">
                Dimensions & units
                <input name="dimensions" defaultValue={record.dimensions} maxLength={1000} />
              </label>
              <label className="field">
                Material
                <input name="material" defaultValue={record.material} maxLength={100} />
              </label>
              <label className="field">
                Case owner
                <input name="owner" defaultValue={record.owner} maxLength={100} />
              </label>
              <label className="field">
                Due date
                <input name="dueDate" type="date" defaultValue={record.dueDate.slice(0, 10)} />
              </label>
              <label className="field">
                Fulfillment route
                <select name="route" defaultValue={record.route.toLowerCase()}>
                  <option value="assess">Assess first</option>
                  <option value="make">Make in-house</option>
                  <option value="source">Source existing spare</option>
                  <option value="repair">Supported repair</option>
                  <option value="partner">Qualified partner</option>
                  <option value="decline">Decline / refer</option>
                </select>
              </label>
              <label className="field">
                Engineering hours
                <input
                  name="engineeringHours"
                  type="number"
                  min={0}
                  max={10000}
                  step="0.25"
                  defaultValue={record.engineeringHours}
                />
              </label>
              <label className="field">
                Incremental job cost (₹)
                <input
                  name="cost"
                  type="number"
                  min={0}
                  max={10000000}
                  step="0.01"
                  defaultValue={record.cost}
                />
              </label>
              <label className="field">
                Hold / exception reason
                <input
                  name="blockedReason"
                  defaultValue={record.blockedReason}
                  placeholder="Explain what is needed next"
                  maxLength={1000}
                />
              </label>
            </div>
            <div className="info-callout">
              <Layers3 size={18} />
              <p>
                Changing the specification creates a new revision and resets affected approvals and
                quality checks.
              </p>
            </div>
          </form>
        )}
        {tab === 'approvals' && (
          <>
            <div className="approval-item">
              <span className={`approval-icon ${record.designApproved ? 'approved' : ''}`}>
                <ShieldCheck size={22} />
              </span>
              <div>
                <h3>Engineering release · revision {record.revision}</h3>
                <p>
                  {record.designApproved
                    ? 'The current design revision has been released.'
                    : 'Verify measurements, scope, and the qualified material / process.'}
                </p>
              </div>
              <span className={`badge ${record.designApproved ? 'approved' : 'draft'}`}>
                {record.designApproved ? 'Released' : 'Pending'}
              </span>
            </div>
            {!record.designApproved && (
              <div className="approval-confirm">
                <label>
                  <input
                    type="checkbox"
                    checked={confirm}
                    onChange={(e) => setConfirm(e.target.checked)}
                  />{' '}
                  I have reviewed the current specification and measured critical dimensions, and
                  approve this revision for its stated use.
                </label>
                <button
                  className="button primary small"
                  disabled={!confirm || busy}
                  onClick={() => mutate(`/cases/${record.id}`, { designApproved: true }, 'PATCH')}
                >
                  Record engineering release
                </button>
              </div>
            )}
            <div className="approval-item">
              <span className={`approval-icon ${record.quoteApproved ? 'approved' : ''}`}>
                <FileText size={22} />
              </span>
              <div>
                <h3>Commercial approval</h3>
                <p>
                  {record.quoteApproved
                    ? 'The exact quote version has recorded approval.'
                    : 'Create and approve an itemized quote in Quotes & approvals.'}
                </p>
              </div>
              <span className={`badge ${record.quoteApproved ? 'approved' : 'draft'}`}>
                {record.quoteApproved ? 'Approved' : 'Pending'}
              </span>
            </div>
            {quotes.map((q) => (
              <div className="quote-summary-line" key={q.id}>
                <span>
                  {q.reference} · v{q.version}
                </span>
                <strong>{money(q.total)}</strong>
                <span className={`badge ${q.status}`}>{statusLabels[q.status]}</span>
              </div>
            ))}
            <div className="approval-item">
              <span className="approval-icon">
                <CircleCheck size={22} />
              </span>
              <div>
                <h3>Quality release</h3>
                <p>
                  {checks.filter((c) => c.passed === true).length} of {checks.length} checks passed.
                  Record measurements in Quality control.
                </p>
              </div>
            </div>
          </>
        )}
        {tab === 'files' && (
          <>
            <label className="file-upload">
              <Upload size={24} />
              <strong>Add a drawing, photo, or specification</strong>
              <span>PDF, JPG, PNG, WebP, STEP, STL, 3MF, OBJ, CSV or TXT · up to 10 MB</span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.step,.stp,.stl,.3mf,.obj,.csv,.txt"
                disabled={busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const form = new FormData();
                  form.append('file', file);
                  setBusy(true);
                  setError('');
                  try {
                    await api(`/cases/${record.id}/files`, { method: 'POST', body: form });
                    setFiles(await api(`/cases/${record.id}/files`));
                    notify('File attached. The new revision needs a fresh engineering review.');
                    await refresh();
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setBusy(false);
                    e.target.value = '';
                  }
                }}
              />
            </label>
            <p className="form-hint">
              Files are stored privately. A new attachment creates a revision and resets design,
              quote, and quality approvals, so the changed package is reviewed before manufacturing.
            </p>
            <div className="file-list">
              {files.map((f) => (
                <a key={f.id} href={`/api/files/${f.id}`} className="file-row">
                  <FileText size={19} />
                  <div>
                    <strong>{f.filename}</strong>
                    <small>
                      {Math.max(1, Math.round(f.size / 1024))} KB · {dateLabel(f.createdAt)}
                    </small>
                  </div>
                  <Download size={17} />
                </a>
              ))}
            </div>
          </>
        )}
        {tab === 'history' && (
          <div className="case-history">
            {activities.length ? (
              activities.map((a) => (
                <div key={a.id}>
                  <span className="history-dot" />
                  <strong>{a.message}</strong>
                  <p>
                    {a.actor} · {new Date(a.createdAt).toLocaleString('en-IN')}
                  </p>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <ClockHistory />
                <h3>No history yet</h3>
                <p>Changes and approvals will be recorded here.</p>
              </div>
            )}
          </div>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="modal-footer detail-footer">
        <div>
          {next && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => mutate(`/cases/${record.id}/transition`, { status: next })}
            >
              {
                {
                  assessment: 'Start assessment',
                  approval: 'Request approval',
                  production: 'Start production',
                  quality: 'Send to quality',
                  ready: 'Release for dispatch',
                  delivered: 'Record delivery',
                  intake: 'Return to intake',
                  blocked: 'Put on hold',
                }[next]
              }{' '}
              <ArrowRight size={15} />
            </button>
          )}
        </div>
        <div>
          {!!record.blockedReason && !['blocked', 'delivered'].includes(record.status) && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => mutate(`/cases/${record.id}/transition`, { status: 'blocked' })}
            >
              Put on hold
            </button>
          )}
          {tab === 'details' ? (
            <button type="submit" form="case-edit" className="button primary" disabled={busy}>
              {busy && <LoaderCircle size={15} className="spin" />}Save changes
            </button>
          ) : (
            <button className="button secondary" onClick={onClose}>
              Done
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
function ClockHistory() {
  return <FileText size={24} />;
}
