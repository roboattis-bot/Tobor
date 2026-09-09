import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { z } from 'zod';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import type { ServerResponse } from 'node:http';
import { Repository } from './database';
import type {
  CaseRecord,
  CaseStatus,
  Machine,
  Part,
  QualityCheck,
  Quote,
  Settings,
  User,
} from '../shared/types';

type SessionUser = User & { tokenHash: string; expiresAt: number };
declare module 'fastify' {
  interface FastifyRequest {
    sessionUser: SessionUser | null;
  }
}
export interface ServerOptions {
  databasePath?: string;
  uploadDir?: string;
  demo?: boolean;
  logger?: boolean;
  serveStatic?: boolean;
  sessionTtlHours?: number;
}
class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
function fail(code: number, message: string): never {
  throw new ApiError(code, message);
}
const digest = (input: string | Buffer) => createHash('sha256').update(input).digest('hex');
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((res, rej) =>
    scrypt(
      password,
      salt,
      64,
      { N: 65536, r: 8, p: 1, maxmem: 128 * 1024 * 1024 },
      (error, value) => (error ? rej(error) : res(value)),
    ),
  );
const hashPassword = async (password: string) => {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await derive(password, salt)).toString('hex')}`;
};
const verifyPassword = async (password: string, encoded: string) => {
  const [salt, hash] = encoded.split(':');
  const actual = await derive(password, salt);
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
const now = () => new Date().toISOString();
const stages: CaseStatus[] = [
  'intake',
  'assessment',
  'approval',
  'production',
  'quality',
  'ready',
  'delivered',
];
const bounded = (max = 500) => z.string().trim().max(max);
const required = (max = 200) => bounded(max).min(1);
const money = z.number().finite().min(0).max(100_000_000);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format.')
  .refine((value) => {
    const parsed = new Date(value);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Enter a valid calendar date.');
const caseFields = z
  .object({
    title: required(),
    customer: required(),
    email: z.union([z.email().max(254), z.literal('')]),
    service: z.enum(['custom', 'replacement', 'repair', 'repeat']),
    priority: z.enum(['normal', 'high', 'urgent']),
    quantity: z.number().int().min(1).max(100000),
    material: required(80),
    owner: bounded(100),
    dueDate: z.union([date, z.literal('')]),
    description: bounded(8000),
    intendedUse: bounded(4000),
    dimensions: bounded(2000),
    risk: bounded(1000),
    route: bounded(200),
    asset: bounded(200),
  })
  .strict();
const caseDefaults: Omit<z.infer<typeof caseFields>, 'title' | 'customer'> = {
  email: '',
  service: 'custom',
  priority: 'normal',
  quantity: 1,
  material: 'PETG',
  owner: '',
  dueDate: '',
  description: '',
  intendedUse: '',
  dimensions: '',
  risk: 'review',
  route: 'make',
  asset: '',
};
const caseInput = caseFields
  .partial()
  .required({ title: true, customer: true })
  .transform((value) => ({ ...caseDefaults, ...value }));
const casePatch = caseFields
  .partial()
  .extend({
    designApproved: z.boolean().optional(),
    revision: z.number().int().min(1).optional(),
    blockedReason: bounded(2000).optional(),
    engineeringHours: z.number().finite().min(0).max(100000).optional(),
    cost: money.optional(),
  })
  .strict();
const quoteInput = z
  .object({
    caseId: z.number().int().positive(),
    engineering: money,
    manufacturing: money,
    testing: money,
    shipping: money,
    taxRate: z.number().finite().min(0).max(100),
    expiresAt: date,
  })
  .strict();
const parseId = (request: FastifyRequest): number => {
  const raw = (request.params as { id: string }).id;
  if (!/^\d+$/.test(raw)) fail(400, 'Invalid record ID.');
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) fail(400, 'Invalid record ID.');
  return id;
};

export async function buildServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const testLoginEmail = z
    .email()
    .optional()
    .parse(process.env.TEST_LOGIN_EMAIL?.trim().toLowerCase() || undefined);
  const app = Fastify({
    logger: options.logger ?? process.env.NODE_ENV !== 'test',
    bodyLimit: 1_048_576,
    requestTimeout: 30_000,
  });
  const repo = new Repository(
    options.databasePath ?? process.env.DATABASE_PATH ?? './data/tobor.sqlite',
  );
  repo.seed(options.demo ?? process.env.SEED_DEMO !== 'false');
  repo.db
    .prepare(
      "DELETE FROM sessions WHERE auth_mode = 'test' AND user_id NOT IN (SELECT id FROM users WHERE email = ? COLLATE NOCASE)",
    )
    .run(testLoginEmail ?? '');
  const uploadDir = resolve(options.uploadDir ?? process.env.UPLOAD_DIR ?? './data/uploads');
  mkdirSync(uploadDir, { recursive: true });
  const sessionHours = options.sessionTtlHours ?? Number(process.env.SESSION_TTL_HOURS || 12);
  if (!Number.isFinite(sessionHours) || sessionHours <= 0 || sessionHours > 720)
    throw new Error('SESSION_TTL_HOURS must be between 0 and 720.');
  const sessionMs = sessionHours * 60 * 60 * 1000;
  const cookieSecureSetting = z.enum(['true', 'false']).optional().parse(process.env.COOKIE_SECURE);
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'strict' as const,
    secure:
      cookieSecureSetting === undefined
        ? process.env.NODE_ENV === 'production'
        : cookieSecureSetting === 'true',
    maxAge: Math.floor(sessionMs / 1000),
  };
  const clients = new Set<{ response: ServerResponse; tokenHash: string }>();
  const broadcast = () => {
    for (const client of clients)
      if (!client.response.destroyed)
        client.response.write(`event: update\ndata: {"at":"${now()}"}\n\n`);
  };
  const userCount = () =>
    Number(
      (repo.db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count,
    );
  const publicUser = (user: User): User => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
  const getCase = (id: number) => repo.get<CaseRecord>('cases', id) ?? fail(404, 'Case not found.');
  const getQuote = (id: number) => repo.get<Quote>('quotes', id) ?? fail(404, 'Quote not found.');
  const touchCase = (item: CaseRecord) => repo.save('cases', { ...item, updatedAt: now() });
  const latestQuote = (caseId: number): Quote | undefined => {
    const row = repo.db
      .prepare('SELECT data FROM quotes WHERE case_id = ? ORDER BY id DESC LIMIT 1')
      .get(caseId) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as Quote) : undefined;
  };
  const quoteRevision = (id: number) =>
    (
      repo.db.prepare('SELECT design_revision FROM quotes WHERE id = ?').get(id) as {
        design_revision: number;
      }
    ).design_revision;
  const checksFor = (caseId: number) =>
    (
      repo.db
        .prepare('SELECT data FROM quality_checks WHERE case_id = ? ORDER BY id')
        .all(caseId) as { data: string }[]
    ).map((row) => JSON.parse(row.data) as QualityCheck);
  const revokeChecks = (caseId: number) => {
    for (const check of checksFor(caseId))
      repo.save('quality_checks', { ...check, actual: '', passed: null, checkedBy: '' });
  };
  const checkDesign = (item: CaseRecord) => {
    const unresolved =
      /\b(?:awaiting|unknown|tbd|tbc|pending|unverified|unmeasured|inferred|estimated|assumed|approximate|placeholder)\b|\b(?:to be|not(?: yet)?)\s+(?:assessed|measured|verified|confirmed)\b/i;
    const needsMeasurement = /\b(?:sample|measurements?|dimensions?)\s+(?:needed|required)\b/i;
    if (
      !item.intendedUse ||
      !item.dimensions ||
      unresolved.test(item.dimensions) ||
      needsMeasurement.test(item.dimensions)
    )
      fail(
        409,
        'Record intended use and verified interface dimensions before approving this design.',
      );
    if (!item.material || unresolved.test(item.material))
      fail(409, 'Select the assessed material before approving this design.');
    if (
      !item.route ||
      !item.risk ||
      /^(?:assess|assessment)$/i.test(item.route) ||
      unresolved.test(item.route)
    )
      fail(409, 'Record the engineering route and risk assessment before design approval.');
  };
  const checkRelease = (item: CaseRecord) => {
    if (!item.designApproved) fail(409, 'Approve the current design revision before production.');
    checkDesign(item);
    const quote = latestQuote(item.id);
    if (
      !item.quoteApproved ||
      !quote ||
      quote.status !== 'approved' ||
      quoteRevision(quote.id) !== item.revision
    )
      fail(409, 'The latest quote for this design revision must be approved before production.');
    if (/specialist/i.test(item.risk) && !/partner|referral|specialist/i.test(item.route))
      fail(409, 'Specialist work needs an explicitly recorded partner or referral route.');
    if (/decline|outside scope/i.test(item.route))
      fail(409, 'A declined case cannot enter production.');
  };
  const checkQuality = (item: CaseRecord) => {
    const requiredChecks = checksFor(item.id).filter((q) => q.required);
    if (!requiredChecks.length || requiredChecks.some((q) => q.passed !== true || !q.actual.trim()))
      fail(409, 'Every required quality check must pass with measured evidence before release.');
  };
  await app.register(cookie);
  await app.register(rateLimit, {
    max: 240,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({ error: 'Too many requests. Please wait and try again.' }),
  });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } });
  app.decorateRequest('sessionUser', null);
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) {
      reply.code(400).send({
        error: error.issues.map((i) => `${i.path.join('.') || 'Request'}: ${i.message}`).join(' '),
      });
      return;
    }
    const code =
      typeof (error as { statusCode?: number }).statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : 500;
    if (code >= 500) request.log.error(error);
    reply.code(code >= 400 && code <= 599 ? code : 500).send({
      error: code >= 500 ? 'The server could not complete this request.' : (error as Error).message,
    });
  });
  app.addHook('onRequest', async (request, reply) => {
    reply
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'same-origin')
      .header('X-Frame-Options', 'DENY');
    const path = request.url.split('?')[0];
    if (!path.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.headers.origin;
      const trustedOrigin = process.env.APP_ORIGIN?.replace(/\/$/, '');
      const hostOrigin = `${request.protocol}://${request.headers.host}`;
      if (
        request.headers['sec-fetch-site'] === 'cross-site' ||
        (origin && origin !== (trustedOrigin || hostOrigin))
      )
        fail(403, 'Cross-origin requests are not allowed.');
    }
    const token = request.cookies.tobor_session;
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      const tokenHash = digest(token);
      const row = repo.db
        .prepare(
          "SELECT u.id, u.name, u.email, u.role, s.expires_at AS expiresAt FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND (s.auth_mode = 'password' OR (s.auth_mode = 'test' AND u.email = ? COLLATE NOCASE))",
        )
        .get(tokenHash, Date.now(), testLoginEmail ?? '') as
        (User & { expiresAt: number }) | undefined;
      if (row) request.sessionUser = { ...row, tokenHash };
    }
    if (['/api/health', '/api/auth/me', '/api/auth/setup', '/api/auth/login'].includes(path))
      return;
    if (!request.sessionUser) fail(401, 'Please sign in to continue.');
  });
  const startSession = (userId: number, authMode: 'password' | 'test' = 'password') => {
    const token = randomBytes(32).toString('hex');
    repo.db
      .prepare(
        'INSERT INTO sessions(token_hash, user_id, expires_at, auth_mode) VALUES (?, ?, ?, ?)',
      )
      .run(digest(token), userId, Date.now() + sessionMs, authMode);
    return token;
  };
  app.get('/api/health', async () => ({ ok: true, service: 'tobor-api' }));
  app.get('/api/auth/me', async (request) => ({
    user: request.sessionUser ? publicUser(request.sessionUser) : null,
    needsSetup: userCount() === 0,
    testLoginEnabled: Boolean(testLoginEmail),
  }));
  const authLimit = { rateLimit: { max: 10, timeWindow: '15 minutes' } };
  app.post('/api/auth/setup', { config: authLimit }, async (request, reply) => {
    if (userCount() > 0) fail(409, 'This workspace already has an administrator. Sign in instead.');
    const data = z
      .object({
        name: required(100),
        email: z
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
        password: z.string().min(12, 'Use at least 12 characters.').max(128),
      })
      .strict()
      .parse(request.body);
    const encoded = await hashPassword(data.password);
    const user = repo.transaction(() => {
      if (userCount() > 0) fail(409, 'This workspace already has an administrator.');
      const result = repo.db
        .prepare(
          'INSERT INTO users(name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(data.name, data.email, encoded, 'admin', now());
      repo.activity(
        null,
        'account',
        `${data.name} created the workshop administrator account.`,
        data.name,
      );
      return {
        id: Number(result.lastInsertRowid),
        name: data.name,
        email: data.email,
        role: 'admin',
      };
    });
    reply.setCookie('tobor_session', startSession(user.id), cookieOptions).code(201);
    return { user };
  });
  app.post('/api/auth/login', { config: authLimit }, async (request, reply) => {
    const data = z
      .object({
        email: z
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
        password: z.string().min(1).max(128),
      })
      .strict()
      .parse(request.body);
    const row = repo.db
      .prepare('SELECT id, name, email, role, password_hash FROM users WHERE email = ?')
      .get(data.email) as (User & { password_hash: string }) | undefined;
    const testAccess = Boolean(row && testLoginEmail === data.email);
    const valid =
      testAccess ||
      (await verifyPassword(
        data.password,
        row?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`,
      ));
    if (!row || !valid) fail(401, 'Email or password is incorrect.');
    reply.setCookie(
      'tobor_session',
      startSession(row.id, testAccess ? 'test' : 'password'),
      cookieOptions,
    );
    return { user: publicUser(row) };
  });
  app.post('/api/auth/logout', async (request, reply) => {
    const tokenHash = request.sessionUser!.tokenHash;
    repo.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    for (const client of clients)
      if (client.tokenHash === tokenHash) {
        client.response.end();
        clients.delete(client);
      }
    reply.clearCookie('tobor_session', { path: '/' });
    return { ok: true };
  });
  app.get('/api/dashboard', async () => repo.dashboard());
  app.get('/api/cases/:id', async (request) => getCase(parseId(request)));
  app.get('/api/cases/:id/revisions', async (request) => {
    const id = parseId(request);
    getCase(id);
    return (
      repo.db
        .prepare(
          'SELECT revision, data, created_at AS createdAt FROM case_revisions WHERE case_id = ? ORDER BY revision DESC',
        )
        .all(id) as { revision: number; data: string; createdAt: string }[]
    ).map((row) => ({
      revision: row.revision,
      createdAt: row.createdAt,
      specification: JSON.parse(row.data) as CaseRecord,
    }));
  });
  const createCase = (body: z.infer<typeof caseInput>, actor: string): CaseRecord => {
    const next = Number(
      (
        repo.db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS next FROM cases').get() as {
          next: number;
        }
      ).next,
    );
    const item = repo.insert<CaseRecord>('cases', {
      ...body,
      owner: body.owner || actor,
      route: body.risk === 'specialist' ? 'partner' : body.route,
      reference: `TB-${String(1040 + next).padStart(4, '0')}`,
      status: 'intake',
      createdAt: now(),
      updatedAt: now(),
      revision: 1,
      designApproved: false,
      quoteApproved: false,
      amount: 0,
      cost: 0,
      engineeringHours: 0,
      blockedReason: '',
    });
    repo.addDefaultQuality(item.id);
    repo.activity(item.id, 'intake', `${item.reference} · ${item.title} created.`, actor);
    return item;
  };
  app.post('/api/cases', async (request, reply) => {
    const data = caseInput.parse(request.body);
    const item = repo.transaction(() => createCase(data, request.sessionUser!.name));
    broadcast();
    reply.code(201);
    return item;
  });
  app.patch('/api/cases/:id', async (request) => {
    const before = getCase(parseId(request));
    const patch = casePatch.parse(request.body);
    if (patch.revision !== undefined && patch.revision !== before.revision)
      fail(409, 'This case revision changed. Refresh before saving.');
    const { revision: _revision, ...changes } = patch;
    const critical: Array<keyof CaseRecord> = [
      'title',
      'customer',
      'description',
      'service',
      'quantity',
      'material',
      'intendedUse',
      'dimensions',
      'risk',
      'route',
      'asset',
    ];
    const changedScope = critical.some(
      (key) => key in changes && changes[key as keyof typeof changes] !== before[key],
    );
    if (before.status === 'delivered' && (changedScope || changes.designApproved !== undefined))
      fail(409, 'Delivered records are immutable. Create a reorder or a new case for changes.');
    if (changedScope && changes.designApproved === true)
      fail(
        409,
        'Save the revised specification first, then separately approve its new design revision.',
      );
    const item = repo.transaction(() => {
      let updated: CaseRecord = { ...before, ...changes };
      if (changedScope) {
        updated = {
          ...updated,
          revision: before.revision + 1,
          designApproved: false,
          quoteApproved: false,
          amount: 0,
          status: before.status === 'intake' ? 'intake' : 'assessment',
        };
        revokeChecks(before.id);
        repo.activity(
          before.id,
          'revision',
          `Revision ${updated.revision} saved. Design and price approvals require a new review.`,
          request.sessionUser!.name,
        );
      } else if (changes.designApproved === true) {
        checkDesign(updated);
        repo.activity(
          before.id,
          'approval',
          `Engineering design revision ${updated.revision} approved by ${request.sessionUser!.name}.`,
          request.sessionUser!.name,
        );
      } else if (changes.designApproved === false && before.designApproved) {
        if (stages.indexOf(before.status) >= 3) updated.status = 'approval';
        revokeChecks(before.id);
      }
      repo.activity(before.id, 'case', `${before.reference} updated.`, request.sessionUser!.name);
      return touchCase(updated);
    });
    broadcast();
    return item;
  });
  app.post('/api/cases/:id/transition', async (request) => {
    const item = getCase(parseId(request));
    const { status } = z
      .object({
        status: z.enum([
          'intake',
          'assessment',
          'approval',
          'production',
          'quality',
          'ready',
          'delivered',
          'blocked',
        ]),
      })
      .strict()
      .parse(request.body);
    if (status === item.status) return item;
    if (item.status === 'delivered')
      fail(409, 'Delivered cases cannot change stage. Create a new case or reorder.');
    if (status === 'blocked') {
      if (!item.blockedReason.trim())
        fail(409, 'Add a hold reason to the case before putting it on hold.');
    } else if (item.status === 'blocked') {
      if (status !== 'assessment')
        fail(409, 'Resume a held case in assessment to review its scope and approvals.');
    } else if (status !== stages[stages.indexOf(item.status) + 1])
      fail(409, 'Cases must move through the next workflow stage in order.');
    if (status === 'approval') checkDesign(item);
    if (['production', 'quality', 'ready', 'delivered'].includes(status)) checkRelease(item);
    if (['ready', 'delivered'].includes(status)) checkQuality(item);
    const updated = repo.transaction(() => {
      const result = touchCase({
        ...item,
        status,
        blockedReason:
          status === 'assessment' && item.status === 'blocked' ? '' : item.blockedReason,
      });
      repo.activity(
        item.id,
        'status',
        `${item.reference} moved from ${item.status} to ${status}.`,
        request.sessionUser!.name,
      );
      if (
        status === 'delivered' &&
        !repo.all<Part>('parts').some((p) => p.caseId === item.id && p.revision === item.revision)
      )
        repo.insert<Part>(
          'parts',
          {
            name: item.title,
            code: `${item.reference}-R${item.revision}`,
            category: item.service === 'repair' ? 'Robotics' : 'Workshop parts',
            material: item.material,
            revision: item.revision,
            customer: item.customer,
            lastMade: now().slice(0, 10),
            orders: 1,
            caseId: item.id,
          },
          { caseId: item.id },
        );
      return result;
    });
    broadcast();
    return updated;
  });
  app.post('/api/quotes', async (request, reply) => {
    const data = quoteInput.parse(request.body);
    const item = getCase(data.caseId);
    if (item.status === 'delivered') fail(409, 'Create a new case to quote delivered work again.');
    if (data.expiresAt < now().slice(0, 10)) fail(400, 'The quote expiry cannot be in the past.');
    const quote = repo.transaction(() => {
      const version = (latestQuote(item.id)?.version ?? 0) + 1;
      const total =
        Math.round(
          (data.engineering + data.manufacturing + data.testing + data.shipping) *
            (1 + data.taxRate / 100) *
            100,
        ) / 100;
      const created = repo.insert<Quote>(
        'quotes',
        {
          ...data,
          reference: `QT-${item.reference.slice(3)}-${version}`,
          caseTitle: item.title,
          customer: item.customer,
          version,
          total,
          status: 'draft',
          createdAt: now(),
        },
        { caseId: item.id, revision: item.revision },
      );
      touchCase({
        ...item,
        quoteApproved: false,
        amount: 0,
        status: stages.indexOf(item.status) >= 3 ? 'approval' : item.status,
      });
      if (stages.indexOf(item.status) >= 3) revokeChecks(item.id);
      repo.activity(
        item.id,
        'quote',
        `${created.reference} created for design revision ${item.revision}.`,
        request.sessionUser!.name,
      );
      return created;
    });
    broadcast();
    reply.code(201);
    return quote;
  });
  for (const action of ['send', 'approve'] as const)
    app.post(`/api/quotes/:id/${action}`, async (request) => {
      if (action === 'approve')
        z.object({
          confirmed: z.literal(true, {
            error: 'Confirm that the customer approved this exact quote version and scope.',
          }),
        })
          .strict()
          .parse(request.body);
      const quote = getQuote(parseId(request));
      const item = getCase(quote.caseId);
      if (item.status === 'delivered') fail(409, 'Delivered case approvals cannot be changed.');
      if (latestQuote(item.id)?.id !== quote.id || quoteRevision(quote.id) !== item.revision)
        fail(
          409,
          'This quote is superseded. Review the latest quote for the current design revision.',
        );
      if (quote.expiresAt < now().slice(0, 10))
        fail(409, 'This quote has expired. Create a new version.');
      if (quote.status === 'approved') return quote;
      if (action === 'send' && quote.status !== 'draft')
        fail(409, 'Only draft quotes can be marked as sent.');
      const updated = repo.transaction(() => {
        const next = repo.save('quotes', {
          ...quote,
          status: action === 'approve' ? ('approved' as const) : ('sent' as const),
        });
        if (action === 'approve') touchCase({ ...item, quoteApproved: true, amount: quote.total });
        repo.activity(
          item.id,
          'quote',
          `${quote.reference} ${action === 'approve' ? `approval recorded by ${request.sessionUser!.name}` : 'marked as sent (no email is sent by this workspace)'}.`,
          request.sessionUser!.name,
        );
        return next;
      });
      broadcast();
      return updated;
    });
  app.patch('/api/quality/:id', async (request) => {
    const check =
      repo.get<QualityCheck>('quality_checks', parseId(request)) ??
      fail(404, 'Quality check not found.');
    const item = getCase(check.caseId);
    if (item.status !== 'quality')
      fail(409, 'Record quality results while the case is in quality check.');
    const patch = z
      .object({ actual: required(4000), passed: z.boolean() })
      .strict()
      .parse(request.body);
    const updated = repo.transaction(() => {
      const result = repo.save('quality_checks', {
        ...check,
        ...patch,
        checkedBy: request.sessionUser!.name,
      });
      touchCase(item);
      repo.activity(
        item.id,
        'quality',
        `${check.label}: ${patch.passed ? 'passed' : 'failed'}.`,
        request.sessionUser!.name,
      );
      return result;
    });
    broadcast();
    return updated;
  });
  app.post('/api/parts/:id/reorder', async (request, reply) => {
    const part = repo.get<Part>('parts', parseId(request)) ?? fail(404, 'Part not found.');
    const { quantity } = z
      .object({
        quantity: z.number().int().positive().max(100000),
        confirmed: z.literal(true, {
          error: 'Confirm unchanged interfaces/use and design rights to request a reorder.',
        }),
      })
      .strict()
      .parse(request.body);
    const source = getCase(part.caseId);
    const item = repo.transaction(() => {
      const created = createCase(
        caseInput.parse({
          title: part.name,
          customer: part.customer,
          email: source.email,
          service: 'repeat',
          priority: 'normal',
          quantity,
          material: part.material,
          intendedUse: source.intendedUse,
          dimensions: source.dimensions,
          description: `Reorder request for ${part.code}, library revision ${part.revision}. Customer confirmed unchanged interfaces/use and design rights. Engineering review and a new quote are required.`,
          risk: source.risk,
          route: source.route,
          asset: source.asset,
        }),
        request.sessionUser!.name,
      );
      const result = touchCase({ ...created, status: 'assessment' });
      repo.save('parts', { ...part, orders: part.orders + 1 });
      repo.activity(
        created.id,
        'reorder',
        `Reorder requested from ${part.code}; new approval required.`,
        request.sessionUser!.name,
      );
      return result;
    });
    broadcast();
    reply.code(201);
    return item;
  });
  app.patch('/api/machines/:id', async (request) => {
    const machine =
      repo.get<Machine>('machines', parseId(request)) ?? fail(404, 'Machine not found.');
    const { status } = z
      .object({ status: z.enum(['printing', 'idle', 'maintenance']) })
      .strict()
      .parse(request.body);
    if (status === 'printing' && !machine.qualified)
      fail(409, 'This machine requires qualification before recording a production job.');
    const updated = repo.transaction(() => {
      const result = repo.save('machines', {
        ...machine,
        status,
        ...(status !== 'printing'
          ? { progress: 0, temperature: 24, remaining: '', job: '' }
          : { job: machine.job || 'Manually recorded job' }),
      });
      repo.activity(
        null,
        'machine',
        `${machine.name} manually set to ${status}.`,
        request.sessionUser!.name,
      );
      return result;
    });
    broadcast();
    return updated;
  });
  app.patch('/api/settings', async (request) => {
    const patch = z
      .object({
        workspaceName: required(100).optional(),
        city: required(100).optional(),
        currency: z.enum(['INR']).optional(),
        monthlyOverhead: money.optional(),
        engineeringCapacity: z.number().finite().positive().max(100000).optional(),
        hourlyRate: money.optional(),
      })
      .strict()
      .parse(request.body);
    const updated = repo.transaction(() => {
      const result = repo.saveSettings({ ...repo.settings(), ...patch });
      repo.activity(null, 'settings', 'Workspace settings updated.', request.sessionUser!.name);
      return result;
    });
    broadcast();
    return updated;
  });
  app.get('/api/export/cases.csv', async (_request, reply) => {
    const columns: Array<keyof CaseRecord> = [
      'reference',
      'title',
      'customer',
      'service',
      'status',
      'quantity',
      'material',
      'owner',
      'dueDate',
      'revision',
      'amount',
      'cost',
      'engineeringHours',
    ];
    const csvCell = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const csv = [
      columns.join(','),
      ...repo
        .all<CaseRecord>('cases')
        .map((item) => columns.map((key) => csvCell(item[key])).join(',')),
    ].join('\r\n');
    return reply
      .type('text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="tobor-cases.csv"')
      .send(`\uFEFF${csv}`);
  });
  app.get('/api/cases/:id/files', async (request) => {
    const id = parseId(request);
    getCase(id);
    return repo.db
      .prepare(
        'SELECT id, case_id AS caseId, revision, original_name AS filename, mime, size, sha256, created_at AS createdAt FROM files WHERE case_id = ? ORDER BY id DESC',
      )
      .all(id);
  });
  const allowedExtensions = new Set([
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.pdf',
    '.stl',
    '.step',
    '.stp',
    '.3mf',
    '.obj',
    '.csv',
    '.txt',
  ]);
  app.post('/api/cases/:id/files', async (request, reply) => {
    const item = getCase(parseId(request));
    if (item.status === 'delivered') fail(409, 'Delivered case files are immutable.');
    const upload = await request.file();
    if (!upload) fail(400, 'Select one file to upload.');
    const name = basename(upload.filename)
      .replace(/[\x00-\x1f\x7f]/g, '')
      .slice(0, 180);
    const ext = extname(name).toLowerCase();
    if (!allowedExtensions.has(ext)) {
      upload.file.resume();
      fail(
        400,
        'This file type is not supported. Use an image, PDF, STEP, STL, 3MF, OBJ, CSV or text file.',
      );
    }
    const bytes = await upload.toBuffer();
    if (!bytes.length) fail(400, 'Empty files cannot be uploaded.');
    const stored = `${randomBytes(20).toString('hex')}${ext}`;
    const location = resolve(uploadDir, stored);
    await writeFile(location, bytes, { flag: 'wx' });
    try {
      const file = repo.transaction(() => {
        const current = getCase(item.id);
        if (current.status === 'delivered') fail(409, 'Delivered case files are immutable.');
        const revision = current.revision + 1;
        const result = repo.db
          .prepare(
            'INSERT INTO files(case_id, revision, original_name, storage_name, mime, size, sha256, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            item.id,
            revision,
            name,
            stored,
            'application/octet-stream',
            bytes.length,
            digest(bytes),
            request.sessionUser!.id,
            now(),
          );
        touchCase({
          ...current,
          revision,
          designApproved: false,
          quoteApproved: false,
          amount: 0,
          status: current.status === 'intake' ? 'intake' : 'assessment',
        });
        revokeChecks(item.id);
        repo.activity(
          item.id,
          'file',
          `${name} attached as revision ${revision}; specification approvals require a new review.`,
          request.sessionUser!.name,
        );
        return {
          id: Number(result.lastInsertRowid),
          caseId: item.id,
          revision,
          filename: name,
          size: bytes.length,
          sha256: digest(bytes),
        };
      });
      broadcast();
      reply.code(201);
      return file;
    } catch (error) {
      await unlink(location);
      throw error;
    }
  });
  app.get('/api/files/:id', async (request, reply) => {
    const file = repo.db
      .prepare('SELECT storage_name, original_name FROM files WHERE id = ?')
      .get(parseId(request)) as { storage_name: string; original_name: string } | undefined;
    if (!file) fail(404, 'File not found.');
    const location = resolve(uploadDir, file.storage_name);
    if (!existsSync(location)) fail(404, 'The stored file is unavailable.');
    return reply
      .type('application/octet-stream')
      .header(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
      )
      .header('Content-Security-Policy', "sandbox; default-src 'none'")
      .send(createReadStream(location));
  });
  app.get('/api/events', async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(`event: connected\ndata: {"ok":true}\n\n`);
    const client = { response: reply.raw, tokenHash: request.sessionUser!.tokenHash };
    clients.add(client);
    reply.raw.on('close', () => clients.delete(client));
  });
  const heartbeat = setInterval(() => {
    repo.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    for (const client of clients) {
      if (
        client.response.destroyed ||
        !repo.db
          .prepare('SELECT 1 FROM sessions WHERE token_hash = ? AND expires_at > ?')
          .get(client.tokenHash, Date.now())
      ) {
        client.response.end();
        clients.delete(client);
      } else client.response.write(`: heartbeat ${Date.now()}\n\n`);
    }
  }, 20_000);
  heartbeat.unref();
  app.addHook('preClose', async () => {
    clearInterval(heartbeat);
    for (const client of clients) client.response.end();
    clients.clear();
  });
  app.addHook('onClose', async () => {
    repo.db.close();
  });
  if ((options.serveStatic ?? true) && existsSync(resolve('dist/index.html'))) {
    await app.register(fastifyStatic, { root: resolve('dist'), prefix: '/', wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (
        request.url.startsWith('/api') ||
        request.method !== 'GET' ||
        extname(request.url.split('?')[0])
      )
        return reply.code(404).send({ error: 'Route not found.' });
      return reply.sendFile('index.html');
    });
  } else
    app.setNotFoundHandler((_request, reply) =>
      reply.code(404).send({ error: 'Route not found.' }),
    );
  return app;
}
