import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type {
  Activity,
  CaseRecord,
  DashboardData,
  Machine,
  Part,
  QualityCheck,
  Quote,
  Settings,
} from '../shared/types';

export type EntityTable =
  'cases' | 'machines' | 'quotes' | 'quality_checks' | 'parts' | 'activities';
export class Repository {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin', created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
      CREATE TABLE IF NOT EXISTS cases (id INTEGER PRIMARY KEY, reference TEXT NOT NULL UNIQUE, data TEXT NOT NULL CHECK(json_valid(data)));
      CREATE TABLE IF NOT EXISTS case_revisions (case_id INTEGER NOT NULL REFERENCES cases(id), revision INTEGER NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), created_at TEXT NOT NULL, PRIMARY KEY(case_id, revision));
      INSERT OR IGNORE INTO case_revisions(case_id, revision, data, created_at) SELECT id, json_extract(data, '$.revision'), data, json_extract(data, '$.updatedAt') FROM cases WHERE json_extract(data, '$.revision') IS NOT NULL;
      CREATE TABLE IF NOT EXISTS machines (id INTEGER PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)));
      CREATE TABLE IF NOT EXISTS quotes (id INTEGER PRIMARY KEY, case_id INTEGER NOT NULL REFERENCES cases(id), design_revision INTEGER NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)));
      CREATE INDEX IF NOT EXISTS quotes_case ON quotes(case_id);
      CREATE TABLE IF NOT EXISTS quality_checks (id INTEGER PRIMARY KEY, case_id INTEGER NOT NULL REFERENCES cases(id), data TEXT NOT NULL CHECK(json_valid(data)));
      CREATE INDEX IF NOT EXISTS quality_case ON quality_checks(case_id);
      CREATE TABLE IF NOT EXISTS parts (id INTEGER PRIMARY KEY, case_id INTEGER NOT NULL REFERENCES cases(id), data TEXT NOT NULL CHECK(json_valid(data)));
      CREATE TABLE IF NOT EXISTS activities (id INTEGER PRIMARY KEY, case_id INTEGER REFERENCES cases(id), data TEXT NOT NULL CHECK(json_valid(data)));
      CREATE INDEX IF NOT EXISTS activities_case ON activities(case_id);
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id = 1), data TEXT NOT NULL CHECK(json_valid(data)));
      CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY, case_id INTEGER NOT NULL REFERENCES cases(id), revision INTEGER NOT NULL, original_name TEXT NOT NULL, storage_name TEXT NOT NULL UNIQUE, mime TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL, uploaded_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS files_case ON files(case_id);
    `);
    const sessionColumns = this.db.prepare('PRAGMA table_info(sessions)').all();
    if (!sessionColumns.some((column) => column.name === 'auth_mode'))
      this.db.exec("ALTER TABLE sessions ADD COLUMN auth_mode TEXT NOT NULL DEFAULT 'password'");
  }
  all<T>(table: EntityTable): T[] {
    return (
      this.db.prepare(`SELECT data FROM ${table} ORDER BY id DESC`).all() as { data: string }[]
    ).map((row) => JSON.parse(row.data) as T);
  }
  get<T>(table: EntityTable, id: number): T | undefined {
    const row = this.db.prepare(`SELECT data FROM ${table} WHERE id = ?`).get(id) as
      { data: string } | undefined;
    return row ? (JSON.parse(row.data) as T) : undefined;
  }
  save<T extends { id: number }>(table: EntityTable, data: T): T {
    this.db.prepare(`UPDATE ${table} SET data = ? WHERE id = ?`).run(JSON.stringify(data), data.id);
    if (table === 'cases') {
      const item = data as unknown as CaseRecord;
      this.db
        .prepare(
          'INSERT OR IGNORE INTO case_revisions(case_id, revision, data, created_at) VALUES (?, ?, ?, ?)',
        )
        .run(item.id, item.revision, JSON.stringify(item), new Date().toISOString());
    }
    return data;
  }
  insert<T extends { id: number }>(
    table: EntityTable,
    data: Omit<T, 'id'>,
    relation?: { caseId: number | null; revision?: number },
  ): T {
    let result;
    if (table === 'cases')
      result = this.db
        .prepare('INSERT INTO cases(reference, data) VALUES (?, ?)')
        .run((data as unknown as Omit<CaseRecord, 'id'>).reference, '{}');
    else if (table === 'quotes')
      result = this.db
        .prepare('INSERT INTO quotes(case_id, design_revision, data) VALUES (?, ?, ?)')
        .run(relation!.caseId, relation!.revision!, '{}');
    else if (['quality_checks', 'parts', 'activities'].includes(table))
      result = this.db
        .prepare(`INSERT INTO ${table}(case_id, data) VALUES (?, ?)`)
        .run(relation!.caseId, '{}');
    else result = this.db.prepare(`INSERT INTO ${table}(data) VALUES (?)`).run('{}');
    const record = { ...data, id: Number(result.lastInsertRowid) } as T;
    return this.save(table, record);
  }
  transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  settings(): Settings {
    return JSON.parse(
      (this.db.prepare('SELECT data FROM settings WHERE id = 1').get() as { data: string }).data,
    ) as Settings;
  }
  saveSettings(data: Settings): Settings {
    this.db
      .prepare(
        'INSERT INTO settings(id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
      )
      .run(JSON.stringify(data));
    return data;
  }
  activity(caseId: number | null, type: string, message: string, actor: string): Activity {
    return this.insert<Activity>(
      'activities',
      { caseId, type, message, actor, createdAt: new Date().toISOString() },
      { caseId },
    );
  }
  dashboard(): DashboardData {
    return {
      cases: this.all<CaseRecord>('cases'),
      machines: this.all<Machine>('machines').reverse(),
      quotes: this.all<Quote>('quotes'),
      qualityChecks: this.all<QualityCheck>('quality_checks'),
      parts: this.all<Part>('parts'),
      activities: (
        this.db.prepare('SELECT data FROM activities ORDER BY id DESC LIMIT 80').all() as {
          data: string;
        }[]
      ).map((x) => JSON.parse(x.data) as Activity),
      settings: this.settings(),
    };
  }
  seed(demo: boolean): void {
    if (this.db.prepare('SELECT id FROM settings WHERE id = 1').get()) return;
    this.transaction(() => {
      this.saveSettings({
        workspaceName: 'Tobor Workshop',
        city: 'Chennai',
        currency: 'INR',
        monthlyOverhead: 310000,
        engineeringCapacity: 208,
        hourlyRate: 750,
        demoMode: demo,
      });
      if (!demo) return;
      const date = (days: number) => {
        const d = new Date();
        d.setDate(d.getDate() + days);
        return d.toISOString();
      };
      const demos: Array<
        [
          string,
          string,
          CaseRecord['service'],
          CaseRecord['status'],
          string,
          number,
          number,
          number,
        ]
      > = [
        [
          'Sensor mount · assembly line',
          'Acme Automation',
          'custom',
          'production',
          'PETG',
          12,
          12400,
          3,
        ],
        [
          'Robot enclosure · revision B',
          'Nova Robotics Lab',
          'custom',
          'assessment',
          'ABS',
          2,
          8600,
          5,
        ],
        [
          'Conveyor guide replacement',
          'Meridian Components',
          'replacement',
          'quality',
          'PETG',
          6,
          6200,
          1,
        ],
        ['IoT gateway housing', 'Fieldwork Systems', 'custom', 'approval', 'PLA', 4, 14800, 4],
        [
          'Lab robot sensor harness',
          'Nova Robotics Lab',
          'repair',
          'blocked',
          'Electronics',
          1,
          9800,
          -1,
        ],
        ['PCB assembly nest', 'Acme Automation', 'repeat', 'production', 'PETG', 8, 18500, 2],
        [
          'Control panel knobs',
          'Urban Repair Collective',
          'replacement',
          'ready',
          'ABS',
          24,
          4200,
          1,
        ],
        ['Camera inspection holder', 'Meridian Components', 'custom', 'intake', 'PETG', 3, 0, 7],
        ['Cable routing clips', 'Fieldwork Systems', 'repeat', 'delivered', 'PETG', 40, 3600, -2],
        [
          'Bench sensor calibration',
          'Aster Learning Lab',
          'repair',
          'assessment',
          'Electronics',
          1,
          5400,
          6,
        ],
        [
          'Noncritical cover plate',
          'Urban Repair Collective',
          'replacement',
          'approval',
          'PLA',
          5,
          2800,
          3,
        ],
        ['Connector test fixture', 'Acme Automation', 'custom', 'quality', 'PETG', 2, 16500, 0],
        [
          'Desk robot cable guard',
          'Aster Learning Lab',
          'custom',
          'delivered',
          'PETG',
          6,
          7900,
          -4,
        ],
        ['Enclosure spacer set', 'Fieldwork Systems', 'repeat', 'production', 'PLA', 16, 3200, 2],
      ];
      const releaseStates = ['production', 'quality', 'ready', 'delivered'];
      demos.forEach(
        ([title, customer, service, status, material, quantity, amount, due], index) => {
          const released = releaseStates.includes(status);
          const item = this.insert<CaseRecord>('cases', {
            reference: `TB-${String(1041 + index).padStart(4, '0')}`,
            title,
            customer,
            email: `demo${index + 1}@example.com`,
            service,
            status,
            priority: index === 4 ? 'urgent' : index % 4 === 0 ? 'high' : 'normal',
            quantity,
            material,
            owner: ['Prakash', 'Meera', 'Arjun', 'Priya'][index % 4],
            dueDate: date(due).slice(0, 10),
            createdAt: date(-8 - (index % 5)),
            updatedAt: date(-index % 3),
            description:
              'Demonstration case. Confirm the actual specification, design rights and agreed acceptance criteria before real work.',
            intendedUse:
              service === 'repair'
                ? 'Supported low-voltage bench robot; supervised lab use.'
                : 'Noncritical workshop accessory; supervised indoor use.',
            dimensions:
              index === 1 || index === 7
                ? 'Awaiting measured interface dimensions'
                : '80 × 45 × 12 mm; verify mating fit',
            risk: 'low',
            route: service === 'repair' ? 'repair' : 'make',
            revision: (index % 3) + 1,
            designApproved: released,
            quoteApproved: released,
            amount,
            cost: Math.round(amount * (0.28 + (index % 3) * 0.06)),
            engineeringHours: [3.5, 6, 1.5, 4, 5, 0.5][index % 6],
            asset: ['Assembly line A', 'Lab robot R-02', 'Workshop bench'][index % 3],
            blockedReason:
              status === 'blocked'
                ? 'Awaiting replacement connector and customer confirmation.'
                : '',
          });
          if (amount > 0) {
            const shipping = 150,
              testing = 350,
              engineering = service === 'repeat' ? 0 : Math.round(amount * 0.3);
            const manufacturing = Math.max(0, amount - shipping - testing - engineering);
            this.insert<Quote>(
              'quotes',
              {
                caseId: item.id,
                reference: `QT-${String(2041 + index)}`,
                caseTitle: title,
                customer,
                version: 1,
                status: released ? 'approved' : status === 'approval' ? 'sent' : 'draft',
                engineering,
                manufacturing,
                testing,
                shipping,
                taxRate: 18,
                total: Math.round(amount * 1.18 * 100) / 100,
                expiresAt: date(14).slice(0, 10),
                createdAt: date(-6),
              },
              { caseId: item.id, revision: item.revision },
            );
            if (released)
              this.save('cases', { ...item, amount: Math.round(amount * 1.18 * 100) / 100 });
          }
          this.addDefaultQuality(
            item.id,
            status === 'ready' || status === 'delivered',
            status === 'quality' && index === 11,
          );
        },
      );
      // A library part must resolve to a completed, inspected source batch.
      // Active repeat jobs remain separate from the historical batch they repeat.
      [2, 5, 6, 8, 12, 13].forEach((index, libraryIndex) => {
        const original = this.get<CaseRecord>('cases', index + 1)!;
        let source = original;
        if (original.status !== 'delivered') {
          const { id: _id, ...record } = original;
          const deliveredAt = date(-14 - index);
          source = this.insert<CaseRecord>('cases', {
            ...record,
            reference: `TB-${1031 + libraryIndex}`,
            description: `Historical demonstration batch for the private part library. ${record.description}`,
            status: 'delivered',
            dueDate: deliveredAt.slice(0, 10),
            createdAt: date(-24 - index),
            updatedAt: deliveredAt,
            designApproved: true,
            quoteApproved: true,
          });
          const sourceQuote = this.all<Quote>('quotes').find(
            (quote) => quote.caseId === original.id,
          )!;
          const { id: _quoteId, ...quote } = sourceQuote;
          this.insert<Quote>(
            'quotes',
            {
              ...quote,
              caseId: source.id,
              reference: `QT-${source.reference.slice(3)}-1`,
              status: 'approved',
              createdAt: date(-22 - index),
              expiresAt: deliveredAt.slice(0, 10),
            },
            { caseId: source.id, revision: source.revision },
          );
          this.addDefaultQuality(source.id, true);
        }
        this.insert<Part>(
          'parts',
          {
            name: source.title,
            code: `TB-P${301 + index}`,
            category: source.service === 'repair' ? 'Robotics' : 'Workshop parts',
            material: source.material,
            revision: source.revision,
            customer: source.customer,
            lastMade: source.updatedAt.slice(0, 10),
            orders: 2 + index,
            caseId: source.id,
          },
          { caseId: source.id },
        );
      });
      for (let i = 0; i < 10; i++)
        this.insert<Machine>('machines', {
          name: `Printer ${String(i + 1).padStart(2, '0')}`,
          model: 'Demo FDM printer',
          status: i < 6 ? 'printing' : i === 8 ? 'maintenance' : 'idle',
          material: ['PETG', 'PLA', 'ABS'][i % 3],
          progress: i < 6 ? [68, 42, 87, 24, 56, 15][i] : 0,
          temperature: i < 6 ? [235, 210, 245][i % 3] : 24,
          job: i < 6 ? demos[[0, 5, 13, 0, 5, 13][i]][0] : '',
          remaining: i < 6 ? ['1h 24m', '2h 10m', '32m', '3h 45m', '1h 50m', '4h 12m'][i] : '',
          qualified: i !== 8,
        });
      this.activity(
        3,
        'quality',
        'Conveyor guide moved to dimensional inspection.',
        'Demo · Meera',
      );
      this.activity(
        6,
        'production',
        'PCB assembly nest batch released for production.',
        'Demo · Arjun',
      );
      this.activity(
        7,
        'quality',
        'Control panel knobs passed required release checks.',
        'Demo · Priya',
      );
      this.activity(
        null,
        'system',
        'Demo workspace initialized. All cases, customers and machine readings are sample data.',
        'System',
      );
    });
  }
  addDefaultQuality(caseId: number, complete = false, failed = false): void {
    const checks = [
      [
        'Dimensions & interface',
        'Record measured critical dimensions against the approved drawing.',
        'Critical dimensions recorded; mating fit verified.',
      ],
      [
        'Visual & material inspection',
        'Correct material/revision; no cracks, layer defects or sharp edges.',
        'Material and revision match; no visible defects.',
      ],
      [
        'Functional fit test',
        'Complete the agreed installation or functional test for this case.',
        'Agreed fit test completed successfully.',
      ],
    ];
    checks.forEach(([label, expected, actual], i) =>
      this.insert<QualityCheck>(
        'quality_checks',
        {
          caseId,
          label,
          expected,
          actual: complete
            ? actual
            : failed && i === 0
              ? 'Interface outside agreed tolerance; requires rework.'
              : '',
          passed: complete ? true : failed && i === 0 ? false : null,
          required: true,
          checkedBy: complete || (failed && i === 0) ? 'Demo · Meera' : '',
        },
        { caseId },
      ),
    );
  }
}
