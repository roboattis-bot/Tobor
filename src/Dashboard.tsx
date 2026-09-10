import { ArrowRight, ArrowUpRight, Check, ChevronRight, Plus, RotateCcw } from 'lucide-react';
import { dateLabel, statusLabels } from './api';
import type { DashboardData, Page, ServiceType, User } from '../shared/types';
import { ModelView } from './ModelScene';
import { journey, journeyIndex, nextStep, serviceOptions } from './workflow';
import type { ModelKind } from './models/types';

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
  onNewCase: (service?: ServiceType) => void;
}) {
  const active = data.cases.filter((item) => item.status !== 'delivered');
  const priority = [
    'blocked',
    'quality',
    'ready',
    'approval',
    'intake',
    'assessment',
    'production',
  ];
  const attention = [...active]
    .sort(
      (a, b) =>
        priority.indexOf(a.status) - priority.indexOf(b.status) ||
        (a.dueDate || '9999').localeCompare(b.dueDate || '9999'),
    )
    .slice(0, 3);
  const recent = [...data.cases].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const stats: { label: string; value: number; text: string; model: ModelKind; page: Page }[] = [
    {
      label: 'Open requests',
      value: active.length,
      text: 'Jobs we are still working on',
      model: 'blueprint',
      page: 'cases',
    },
    {
      label: 'Need approval',
      value: data.cases.filter((item) => item.status === 'approval').length,
      text: 'Waiting for the design or price to be agreed',
      model: 'receipt',
      page: 'quotes',
    },
    {
      label: 'Ready to send',
      value: data.cases.filter((item) => item.status === 'ready').length,
      text: 'Checked and ready for delivery',
      model: 'parcel',
      page: 'cases',
    },
    {
      label: 'Jobs delivered',
      value: data.cases.filter((item) => item.status === 'delivered').length,
      text: 'Finished items received by customers',
      model: 'check',
      page: 'cases',
    },
  ];
  return (
    <div className="simple-home">
      <div className="page-heading home-heading">
        <div>
          <p className="eyebrow">YOUR WORKSHOP, ONE CLEAR STEP AT A TIME</p>
          <h1>
            {greeting}, {user.name.split(' ')[0]} <span className="greeting-sun">✳</span>
          </h1>
          <p>Start a request or see what needs your attention.</p>
        </div>
      </div>
      <section className="welcome-scene">
        <div className="welcome-copy">
          <span className="welcome-label">
            <span className="live-dot" /> THIS IS TOBOR
          </span>
          <h2>
            Make it.
            <br />
            Fix it. <em>Use it again.</em>
          </h2>
          <p>
            Make new parts, replace broken ones, and repair devices. We keep the request, the price,
            and the progress together.
          </p>
          <div className="welcome-actions">
            <button className="button primary" onClick={() => onNewCase()}>
              <Plus size={19} /> New request
            </button>
            <button
              className="button ghost"
              onClick={() =>
                document.getElementById('how-it-works')?.scrollIntoView({
                  behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                    ? 'auto'
                    : 'smooth',
                  block: 'start',
                })
              }
            >
              How it works <ArrowRight size={17} />
            </button>
          </div>
        </div>
        <div className="welcome-art">
          <span className="art-label">AN IDEA → A WORKING PART</span>
          <ModelView
            kind="workshop"
            hero
            label="3D illustration of a printer, repair robot, gear, and delivery box"
          />
          <span className="art-caption">Workshop illustrations · not live machine readings</span>
        </div>
      </section>
      <section className="home-section" aria-labelledby="start-heading">
        <div className="simple-section-heading">
          <div>
            <h2 id="start-heading">What would you like to do?</h2>
            <p>Choose a starting point. We will guide you through the details.</p>
          </div>
        </div>
        <div className="service-action-grid">
          {serviceOptions.map((service) => (
            <button
              className="service-action card"
              key={service.id}
              onClick={() => onNewCase(service.id)}
            >
              <ModelView kind={service.model} />
              <div>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
              </div>
              <ArrowUpRight className="service-arrow" size={20} />
            </button>
          ))}
          <button className="service-action card repeat-action" onClick={() => navigate('library')}>
            <ModelView kind="library" />
            <div>
              <h3>Order it again</h3>
              <p>Find a saved part and request another batch.</p>
            </div>
            <RotateCcw className="service-arrow" size={20} />
          </button>
        </div>
      </section>
      <section className="stats-grid simple-stats" aria-label="Your work at a glance">
        {stats.map((stat) => (
          <button className="stat-card card" key={stat.label} onClick={() => navigate(stat.page)}>
            <div className="simple-stat-copy">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <p>{stat.text}</p>
            </div>
            <ModelView kind={stat.model} />
          </button>
        ))}
      </section>
      <section className="home-section" aria-labelledby="next-heading">
        <div className="simple-section-heading">
          <div>
            <span className="eyebrow">A GOOD PLACE TO START</span>
            <h2 id="next-heading">What needs to happen next?</h2>
            <p>Open a job to see its details and take the next step.</p>
          </div>
          <button className="text-button" onClick={() => navigate('cases')}>
            All requests <ArrowRight size={17} />
          </button>
        </div>
        <div className="next-actions">
          {attention.length ? (
            attention.map((item) => {
              const task = nextStep(item);
              return (
                <article className="next-action card" key={item.id}>
                  <span className={`badge ${item.status}`}>
                    <i />
                    {statusLabels[item.status]}
                  </span>
                  <h3>{task.title}</h3>
                  <button className="next-job-title" onClick={() => onOpenCase(item.id)}>
                    {item.title}
                  </button>
                  <p>{task.text}</p>
                  <div className="next-action-bottom">
                    <span>{item.customer}</span>
                    <button className="button secondary small" onClick={() => onOpenCase(item.id)}>
                      Open request <ArrowRight size={16} />
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="card simple-empty">
              <Check size={26} />
              <h3>You are all caught up.</h3>
              <p>New requests will appear here when they need a next step.</p>
            </div>
          )}
        </div>
      </section>
      <section className="journey-section" id="how-it-works" aria-labelledby="journey-heading">
        <div className="simple-section-heading">
          <div>
            <span className="eyebrow">NO WORKSHOP EXPERIENCE NEEDED</span>
            <h2 id="journey-heading">From a request to something ready to use.</h2>
            <p>Every job follows these five simple steps.</p>
          </div>
        </div>
        <ol className="journey-grid">
          {journey.map((step, index) => (
            <li key={step.title}>
              <div className="journey-art">
                <ModelView kind={step.model} />
                <span>{index + 1}</span>
              </div>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </li>
          ))}
        </ol>
        <p className="journey-footnote">
          Not sure about a size or material? Add what you know. The team reviews the details before
          any work starts.
        </p>
      </section>
      <section className="home-section" aria-labelledby="recent-heading">
        <div className="simple-section-heading">
          <div>
            <h2 id="recent-heading">Your recent requests</h2>
            <p>See where each job is and what comes next.</p>
          </div>
          <button className="text-button" onClick={() => navigate('cases')}>
            See all requests <ArrowRight size={17} />
          </button>
        </div>
        <div className="simple-recent card">
          {recent.map((item) => {
            const step = journeyIndex(item.status);
            return (
              <button
                className="simple-request-row"
                key={item.id}
                onClick={() => onOpenCase(item.id)}
              >
                <div className="simple-request-title">
                  <strong>{item.title}</strong>
                  <span>
                    {item.reference} · {item.customer}
                  </span>
                </div>
                <div className="request-progress">
                  <span className={`badge ${item.status}`}>{statusLabels[item.status]}</span>
                  <span className="mini-progress" aria-hidden="true">
                    {journey.map((stage, i) => (
                      <i key={stage.title} className={i <= step ? 'complete' : ''} />
                    ))}
                  </span>
                </div>
                <span className="request-date">
                  {item.dueDate ? `Due ${dateLabel(item.dueDate)}` : 'No due date yet'}
                </span>
                <ChevronRight size={19} />
              </button>
            );
          })}
          {!recent.length && <p className="simple-empty">Your first request will appear here.</p>}
        </div>
      </section>
      <div className="home-report-link">
        <div>
          <strong>Want to understand the costs and workload?</strong>
          <p>Reports keep the detailed numbers in one place.</p>
        </div>
        <button className="button secondary" onClick={() => navigate('insights')}>
          View reports <ArrowRight size={17} />
        </button>
      </div>
    </div>
  );
}
