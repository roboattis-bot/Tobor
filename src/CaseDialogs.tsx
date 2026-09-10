import { useEffect, useRef, useState, type FormEvent } from 'react';
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
import { nextStep, serviceOptions } from './workflow';
type Notify = (message: string, kind?: 'success' | 'error') => void;
export function NewCaseModal({
  onClose,
  onCreated,
  notify,
  initialService = 'custom',
}: {
  onClose: () => void;
  onCreated: (id: number) => Promise<void>;
  notify: Notify;
  initialService?: ServiceType;
}) {
  const [service, setService] = useState<ServiceType>(
    initialService === 'repeat' ? 'custom' : initialService,
  );
  const [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const steps = ['Your request', 'About the item', 'Timing & quantity'];
  const goTo = (index: number) => {
    setStep(index);
    setError('');
    requestAnimationFrame(() => {
      formRef.current?.querySelector('.modal-body')?.scrollTo({ top: 0 });
      formRef.current?.querySelector<HTMLElement>(`[data-step="${index}"] h3`)?.focus();
    });
  };
  const validateStep = (index: number) => {
    const fields = formRef.current?.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >(
      `[data-step="${index}"] input, [data-step="${index}"] select, [data-step="${index}"] textarea`,
    );
    const invalid = [...(fields || [])].find((field) => !field.checkValidity());
    if (!invalid) return true;
    goTo(index);
    setError('Please complete the highlighted field.');
    requestAnimationFrame(() => {
      invalid.focus();
      invalid.reportValidity();
    });
    return false;
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateStep(step)) return;
    if (step < 2) {
      goTo(step + 1);
      return;
    }
    if (![0, 1, 2].every(validateStep)) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const result = await api<CaseRecord>('/cases', {
        method: 'POST',
        body: JSON.stringify({
          ...Object.fromEntries(form),
          service,
          quantity: Number(form.get('quantity')),
          owner: 'Unassigned',
        }),
      });
      notify('Request saved. Next, the team will review the details.');
      await onCreated(result.id);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Start a new request"
      subtitle="Three short steps. You do not need to know all the technical details."
      onClose={onClose}
      wide
      className="request-wizard"
    >
      <form
        ref={formRef}
        onSubmit={submit}
        noValidate
        onFocusCapture={(event) => {
          if (event.target.matches('input, select, textarea')) {
            event.target.closest('.field')?.scrollIntoView({ block: 'nearest' });
          }
        }}
      >
        <ol className="wizard-steps" aria-label="Request steps">
          {steps.map((title, index) => (
            <li key={title} className={index === step ? 'current' : index < step ? 'done' : ''}>
              <button
                type="button"
                onClick={() => goTo(index)}
                disabled={index > step || busy}
                aria-current={index === step ? 'step' : undefined}
              >
                <span>{index < step ? <Check size={16} /> : index + 1}</span>
                {title}
              </button>
            </li>
          ))}
        </ol>
        <div className="modal-body">
          <fieldset data-step="0" hidden={step !== 0} className="wizard-fieldset">
            <h3 tabIndex={-1}>What can we help you with?</h3>
            <p className="wizard-intro">Choose the type of job and tell us what you need.</p>
            <div className="service-picker">
              {serviceOptions.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className={service === option.id ? 'selected' : ''}
                  aria-pressed={service === option.id}
                  onClick={() => setService(option.id)}
                >
                  <strong>{option.title}</strong>
                  <span>{option.description}</span>
                  {service === option.id && <Check size={16} className="service-check" />}
                </button>
              ))}
            </div>
            <div className="form-grid">
              <label className="field full">
                Request title
                <input
                  name="title"
                  placeholder={serviceOptions.find((option) => option.id === service)?.example}
                  required
                  minLength={3}
                  maxLength={160}
                />
              </label>
              <label className="field full">
                What do you need?
                <textarea
                  name="description"
                  placeholder="Tell us what is broken or what you want to make. A few simple sentences are enough."
                  rows={3}
                  required
                  maxLength={5000}
                />
              </label>
              <label className="field">
                Who is this for?
                <input
                  name="customer"
                  placeholder="A person, team, or company"
                  required
                  maxLength={120}
                />
              </label>
              <label className="field">
                Contact email
                <input
                  name="email"
                  aria-label="Contact email"
                  aria-describedby="new-email-help"
                  type="email"
                  placeholder="name@company.com"
                  maxLength={254}
                />
                <span className="field-help" id="new-email-help">
                  Optional. Use the customer's contact email.
                </span>
              </label>
            </div>
          </fieldset>
          <fieldset data-step="1" hidden={step !== 1} className="wizard-fieldset">
            <h3 tabIndex={-1}>Tell us about the item</h3>
            <p className="wizard-intro">
              Add what you know. The team can help with measurements and materials.
            </p>
            <div className="form-grid">
              <label className="field full">
                Where and how will it be used?
                <textarea
                  name="intendedUse"
                  placeholder="For example: a holder on an indoor workbench, used to keep a small sensor in place."
                  rows={3}
                  required
                  maxLength={3000}
                />
              </label>
              <label className="field">
                Size (if known)
                <input
                  name="dimensions"
                  aria-label="Size (if known)"
                  aria-describedby="new-size-help"
                  placeholder="For example: 60 x 40 x 5 mm"
                  maxLength={1000}
                />
                <span className="field-help" id="new-size-help">
                  Leave blank if the item needs measuring.
                </span>
              </label>
              <label className="field">
                Device or model (if known)
                <input name="asset" placeholder="Model name or number" maxLength={200} />
              </label>
              <label className="field">
                Material (optional)
                <select name="material" defaultValue="To be assessed">
                  <option value="To be assessed">Let the team choose</option>
                  <option>PLA</option>
                  <option>PETG</option>
                  <option>TPU</option>
                  <option>ASA</option>
                  <option>Nylon</option>
                  <option value="Metal - partner">Metal (specialist)</option>
                  <option>Electronics</option>
                </select>
              </label>
              <label className="field">
                What if the item fails?
                <select name="risk" defaultValue="review">
                  <option value="low">Low impact</option>
                  <option value="review">Not sure - please check</option>
                  <option value="specialist">Could cause harm</option>
                </select>
              </label>
            </div>
            <div className="info-callout">
              <ShieldCheck size={20} />
              <p>
                Choose "Could cause harm" if failure may injure someone or damage equipment. A
                specialist should review that work.
              </p>
            </div>
          </fieldset>
          <fieldset data-step="2" hidden={step !== 2} className="wizard-fieldset">
            <h3 tabIndex={-1}>How many, and when?</h3>
            <p className="wizard-intro">
              Tell us your preferred timing. The team will confirm what is possible.
            </p>
            <div className="form-grid">
              <label className="field">
                How many?
                <input
                  name="quantity"
                  type="number"
                  min={1}
                  max={10000}
                  defaultValue={1}
                  required
                />
              </label>
              <label className="field">
                When do you need it?
                <input
                  name="dueDate"
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  required
                />
              </label>
              <label className="field full">
                How urgent is it?
                <select name="priority" defaultValue="normal">
                  <option value="normal">Normal</option>
                  <option value="high">Important</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
            </div>
            <div className="request-review">
              <span className="eyebrow">WHAT HAPPENS AFTER YOU SAVE?</span>
              <h4>The team reviews your request.</h4>
              <p>
                You can add photos and drawings on the next screen. The design and price must be
                agreed before work starts.
              </p>
            </div>
          </fieldset>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer wizard-footer">
          <button
            className="button secondary"
            type="button"
            onClick={() => (step ? goTo(step - 1) : onClose())}
            disabled={busy}
          >
            {step ? 'Back' : 'Cancel'}
          </button>
          <span>Step {step + 1} of 3</span>
          <button className="button primary" disabled={busy}>
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : step < 2 ? (
              <ArrowRight size={17} />
            ) : (
              <Plus size={17} />
            )}
            {step === 0 ? 'Next: item details' : step === 1 ? 'Next: timing' : 'Create request'}
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
      <div className="request-next-step">
        <span className="eyebrow">WHAT TO DO NEXT</span>
        <h3>{nextStep(record).title}</h3>
        <p>{nextStep(record).text}</p>
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
