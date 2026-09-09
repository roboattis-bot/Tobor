import { lazy, Suspense, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  Layers3,
  MoreHorizontal,
  Plus,
  Printer,
  ScanLine,
  Wrench,
} from 'lucide-react';
import { dateLabel, money, statusLabels } from './api';
import type { DashboardData, Page, User } from '../shared/types';
const PrinterScene = lazy(() => import('./PrinterScene'));
const serviceLabels: Record<string, string> = {
  custom: 'Custom part',
  replacement: 'Replacement',
  repair: 'Robot repair',
  repeat: 'Repeat order',
};
export default function Dashboard({
  data,
  user,
  navigate,
  onOpenCase,
  onNewCase,
}: {
  data: DashboardData;
  user: User;
  navigate: (page: Page) => void;
  onOpenCase: (id: number) => void;
  onNewCase: () => void;
}) {
  const [period, setPeriod] = useState(14);
  const active = data.cases.filter((c) => c.status !== 'delivered');
  const printing = data.machines.filter((m) => m.status === 'printing').length;
  const approval = data.cases.filter((c) => c.status === 'approval').length;
  const delivered = data.cases.filter((c) => c.status === 'delivered');
  const qc = data.qualityChecks.filter((c) => c.passed !== null),
    passed = qc.filter((c) => c.passed).length;
  const cards = [
    {
      label: 'Active cases',
      value: active.length.toString(),
      foot: `${data.cases.filter((c) => c.status === 'intake').length} new requests to review`,
      icon: Layers3,
      className: 'purple',
    },
    {
      label: 'Printers in production',
      value: printing.toString(),
      suffix: `/ ${data.machines.length}`,
      foot: `${data.machines.filter((m) => m.status === 'idle').length} available for your next job`,
      icon: Printer,
      className: 'green',
    },
    {
      label: 'Awaiting approval',
      value: approval.toString(),
      foot: 'Keep the next stage moving',
      icon: Clock3,
      className: 'orange',
    },
    {
      label: 'Quality checks passed',
      value: qc.length ? Math.round((passed / qc.length) * 100) + '%' : '—',
      foot: `${passed} of ${qc.length} recorded checks`,
      icon: ScanLine,
      className: 'blue',
    },
  ];
  const stages = [
    { id: 'intake', name: 'Intake', color: '#b8aedc' },
    { id: 'assessment', name: 'Assessment', color: '#f1c690' },
    { id: 'approval', name: 'Approval', color: '#d9d0ac' },
    { id: 'production', name: 'Production', color: '#8aafa0' },
    { id: 'quality', name: 'Quality check', color: '#aabd93' },
    { id: 'ready', name: 'Ready', color: '#466d52' },
  ];
  const chartDays = Array.from({ length: period }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (period - 1 - i));
    const key = d.toISOString().slice(0, 10);
    return {
      key,
      label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      created: data.cases.filter((c) => c.createdAt.slice(0, 10) === key).length,
      delivered: data.cases.filter(
        (c) => c.status === 'delivered' && c.updatedAt.slice(0, 10) === key,
      ).length,
    };
  });
  const chartMax = Math.max(3, ...chartDays.map((d) => d.created));
  const points = chartDays
    .map((d, i) => `${42 + i * (690 / (period - 1))},${154 - (d.created / chartMax) * 114}`)
    .join(' ');
  const completedPoints = chartDays
    .map((d, i) => `${42 + i * (690 / (period - 1))},${154 - (d.delivered / chartMax) * 114}`)
    .join(' ');
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">A LITTLE CLARITY FOR YOUR DAY</div>
          <h1>
            {greeting}, {user.name.split(' ')[0]} <span className="greeting-sun">✳</span>
          </h1>
          <p>Here’s what’s happening across your workshop.</p>
        </div>
        <button className="button primary" onClick={onNewCase}>
          <Plus size={17} /> New request
        </button>
      </div>
      <div className="stats-grid">
        {cards.map((card) => (
          <div className="stat-card card" key={card.label}>
            <div className="stat-top">
              <span>{card.label}</span>
              <span className={`stat-icon ${card.className}`}>
                <card.icon size={18} />
              </span>
            </div>
            <div className="stat-value">
              {card.value}
              <span>{card.suffix}</span>
            </div>
            <div className="stat-foot">
              <span className="tiny-dot" />
              {card.foot}
            </div>
          </div>
        ))}
      </div>
      <div className="overview-main-grid">
        <section className="card flow-card">
          <div className="card-heading">
            <div>
              <h2>Workshop at a glance</h2>
              <p>Every request, one step closer to ready.</p>
            </div>
            <button className="text-button" onClick={() => navigate('cases')}>
              View pipeline <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="flow-stages">
            {stages.map((s, i) => (
              <button
                key={s.id}
                className="flow-stage"
                onClick={() =>
                  navigate(
                    s.id === 'production' ? 'production' : s.id === 'quality' ? 'quality' : 'cases',
                  )
                }
              >
                <div className="stage-marker">
                  <span style={{ background: s.color }}>{i + 1}</span>
                  {i < stages.length - 1 && <div />}
                </div>
                <strong>
                  {data.cases
                    .filter((c) => c.status === s.id)
                    .length.toString()
                    .padStart(2, '0')}
                </strong>
                <span>{s.name}</span>
              </button>
            ))}
          </div>
          <div className="chart-heading">
            <h3>Request activity</h3>
            <select
              aria-label="Activity period"
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value))}
            >
              <option value={14}>Last 14 days</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </div>
          <div className="activity-chart">
            <svg
              viewBox="0 0 760 190"
              role="img"
              aria-label={`New and delivered requests in the last ${period} days. ${chartDays.reduce((s, d) => s + d.created, 0)} new requests.`}
            >
              <defs>
                <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#85a994" stopOpacity=".22" />
                  <stop offset="100%" stopColor="#85a994" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0, 1, 2, 3].map((i) => (
                <g key={i}>
                  <line
                    x1="42"
                    x2="734"
                    y1={40 + i * 38}
                    y2={40 + i * 38}
                    stroke="#eef0ee"
                    strokeDasharray="4 5"
                  />
                  <text x="14" y={44 + i * 38} fontSize="10" fill="#8d9590">
                    {Math.round(chartMax * (1 - i / 3))}
                  </text>
                </g>
              ))}
              <polygon points={`42,154 ${points} 732,154`} fill="url(#chart-fill)" />
              <polyline
                points={points}
                fill="none"
                stroke="#35694c"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              <polyline
                points={completedPoints}
                fill="none"
                stroke="#a7b57c"
                strokeWidth="2"
                strokeDasharray="5 4"
              />
              {chartDays.map((d, i) =>
                i % Math.max(1, Math.ceil(period / 6)) === 0 || i === period - 1 ? (
                  <text
                    key={d.key}
                    x={42 + i * (690 / (period - 1))}
                    y="181"
                    textAnchor="middle"
                    fontSize="10"
                    fill="#8d9590"
                  >
                    {d.label}
                  </text>
                ) : null,
              )}
            </svg>
          </div>
          <div className="chart-legend">
            <span>
              <i /> New requests
            </span>
            <span>
              <i /> Delivered
            </span>
            <span className="chart-note">
              {data.settings.demoMode
                ? 'Based on sample case history'
                : 'Based on recorded case history'}
            </span>
          </div>
        </section>
        <section className="workshop-card">
          <div className="workshop-card-top">
            <span className="workshop-kicker">
              <span className="live-dot" /> MADE POSSIBLE, TOGETHER
            </span>
            <span className="three-badge">3D VIEW</span>
          </div>
          <h2>
            Your next idea.
            <br />
            Already taking shape.
          </h2>
          <p>
            One connected workspace.
            <br />A world of things you can make.
          </p>
          <Suspense fallback={<div className="scene-loading" />}>
            <PrinterScene />
          </Suspense>
          <div className="workshop-card-bottom">
            <span>
              <Box size={16} /> The Tobor workshop
            </span>
            <button aria-label="Explore production" onClick={() => navigate('production')}>
              <ArrowUpRight size={19} />
            </button>
          </div>
        </section>
      </div>
      <div className="overview-lower-grid">
        <section className="card recent-card">
          <div className="card-heading">
            <div>
              <h2>
                Recent cases <span className="count-pill">{data.cases.length}</span>
              </h2>
              <p>Small details. Real progress.</p>
            </div>
            <button className="text-button" onClick={() => navigate('cases')}>
              View all cases <ArrowRight size={15} />
            </button>
          </div>
          <div className="table-scroll">
            <table className="cases-table">
              <thead>
                <tr>
                  <th>CASE / CUSTOMER</th>
                  <th>SERVICE</th>
                  <th>STATUS</th>
                  <th>DUE DATE</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...data.cases]
                  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                  .slice(0, 5)
                  .map((c) => (
                    <tr key={c.id}>
                      <td>
                        <button className="case-title-button" onClick={() => onOpenCase(c.id)}>
                          <span className={`case-service-icon ${c.service}`}>
                            {c.service === 'repair' ? (
                              <Wrench size={17} />
                            ) : c.service === 'custom' ? (
                              <Layers3 size={17} />
                            ) : (
                              <Box size={17} />
                            )}
                          </span>
                          <span>
                            <strong>{c.title}</strong>
                            <small>
                              {c.reference} <span>·</span> {c.customer}
                            </small>
                          </span>
                        </button>
                      </td>
                      <td>
                        <span className="table-service">{serviceLabels[c.service]}</span>
                      </td>
                      <td>
                        <span className={`badge ${c.status}`}>
                          <i />
                          {statusLabels[c.status]}
                        </span>
                      </td>
                      <td className="table-date">{dateLabel(c.dueDate)}</td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Open ${c.reference}`}
                          onClick={() => onOpenCase(c.id)}
                        >
                          <ChevronRight size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!data.cases.length && (
              <div className="empty-state">
                <Box />
                <h3>A clear workbench.</h3>
                <p>Create your first request to get started.</p>
                <button className="button primary" onClick={onNewCase}>
                  New request
                </button>
              </div>
            )}
          </div>
          <div className="table-footer">
            <span>
              <span className="tiny-dot" /> {active.length} cases moving through your workshop
            </span>
            <span>One accountable service.</span>
          </div>
        </section>
        <section className="card activity-card">
          <div className="card-heading">
            <h2>Workshop updates</h2>
            <span className="activity-live">RECENT</span>
          </div>
          <div className="activity-list">
            {data.activities.slice(0, 4).map((a, i) => (
              <div className="activity-item" key={a.id}>
                <div className={`activity-symbol symbol-${i % 4}`}>
                  {i % 3 === 0 ? (
                    <Check size={14} />
                  ) : i % 3 === 1 ? (
                    <Box size={14} />
                  ) : (
                    <ArrowDownLeft size={14} />
                  )}
                </div>
                <div>
                  <p>{a.message}</p>
                  <span>
                    {a.actor} <b>·</b> {dateLabel(a.createdAt)}
                  </span>
                  {a.caseId && (
                    <button className="activity-link" onClick={() => onOpenCase(a.caseId!)}>
                      Open case <ArrowUpRight size={11} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!data.activities.length && <p className="muted">Case updates will appear here.</p>}
          </div>
          <button className="activity-bottom" onClick={() => navigate('production')}>
            <span>
              <Printer size={16} /> Explore your factory floor
            </span>
            <ArrowRight size={15} />
          </button>
        </section>
      </div>
      <div className="dashboard-footer">
        <span>
          <span className="mini-brand">t.</span> Thoughtfully made. Carefully verified.
        </span>
        <span>
          {delivered.length} delivered cases <span>·</span>{' '}
          {money(delivered.reduce((s, c) => s + c.amount, 0))} delivered value
        </span>
      </div>
    </>
  );
}
