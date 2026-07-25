// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Relay usecase-ийн unit тестүүд. Гол баталгаанууд:
//   • assignment-ийн SLA нь хүсэлтийн эцсийн хугацаанаас ХЭТЭРЧ болохгүй;
//   • чиглүүлэлтгүй service_code нь 400 (даалгаваргүй хүсэлт үүсэхгүй);
//   • webhook нь ЗӨВХӨН бүртгэлтэй, идэвхтэй, гарын үсэг таарсан peer-ээс;
//   • SLA sweep нь сануулга/overdue/escalate/breach-ийг зөв нэг удаа хийнэ.

import { describe, expect, it, vi } from 'vitest';

import { ErrorType, is } from '../../apperror/index.js';
import type {
  NewRelayAssignment,
  NewRelayEvent,
  NewRelayRequest,
  RelayRepository,
} from '../../datasources/repositories/interface/relay.js';
import {
  RelayAsgAcknowledged,
  RelayAsgOverdue,
  RelayDirDownstream,
  RelayDirUpstream,
  RelayEvtBreachNotified,
  RelayEvtEscalated,
  RelayEvtOverdue,
  RelayEvtReminded,
  RelayReqDispatched,
  relaySignWebhook,
} from '../../domain/relay.js';
import type {
  RelayAssignment,
  RelayOverview,
  RelayPlatform,
  RelayRequest,
  RelayRequestDetail,
  RelayRoute,
} from '../../domain/relay.js';
import { background } from '../../pkg/ctx/ctx.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import { newRelayUsecase } from './relay_impl.js';

const ctx: Ctx = background();

const platform = (over: Partial<RelayPlatform> = {}): RelayPlatform => ({
  id: 'p1',
  code: 'e-mongolia',
  name: 'И-Монгол',
  direction: RelayDirUpstream,
  endpointUrl: 'demo://loopback',
  supervisorContact: '',
  webhookSecret: 'secret-key',
  enabled: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

const route = (over: Partial<RelayRoute> = {}): RelayRoute => ({
  id: 'r1',
  serviceCode: 'svc.test',
  platformId: 'p2',
  platformName: 'Доод байгууллага',
  slaMinutes: 60,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

const request = (over: Partial<RelayRequest> = {}): RelayRequest => ({
  id: 'req-1',
  sourcePlatform: '',
  externalRef: '',
  serviceCode: 'svc.test',
  title: '',
  payload: null,
  priority: 'normal',
  receivedAt: new Date(),
  dueAt: new Date(Date.now() + 3_600_000),
  status: RelayReqDispatched,
  result: null,
  fulfilledAt: null,
  breachNotified: false,
  updatedAt: null,
  ...over,
});

const assignment = (over: Partial<RelayAssignment> = {}): RelayAssignment => ({
  id: 'a1',
  requestId: 'req-1',
  platformId: 'p2',
  platformName: 'Доод байгууллага',
  status: RelayAsgAcknowledged,
  dueAt: new Date(Date.now() + 600_000),
  dispatchedAt: new Date(Date.now() - 600_000),
  respondedAt: null,
  result: null,
  remindersSent: 0,
  escalated: false,
  ...over,
});

const emptyOverview = (): RelayOverview => ({
  receivedToday: 0,
  inProgress: 0,
  overdue: 0,
  fulfilled: 0,
  total: 0,
  slaCompliancePct: 0,
  avgFulfillMins: 0,
  statusBuckets: [],
  platforms: [],
  recentEvents: [],
});

/** fakeRepo нь repository-ийн бүрэн гэрээг хангасан хуурамч хувилбар. */
function fakeRepo(over: Partial<RelayRepository> = {}): RelayRepository {
  return {
    listPlatforms: () => Promise.resolve<RelayPlatform[]>([]),
    getPlatformByCode: () => Promise.reject(new Error('not found')),
    createPlatform: (_c: Ctx, input) => Promise.resolve(platform({ ...input, id: 'new' })),
    deletePlatform: () => Promise.resolve(),
    listRoutes: () => Promise.resolve<RelayRoute[]>([]),
    routesForService: () => Promise.resolve<RelayRoute[]>([]),
    createRoute: (_c: Ctx, input) => Promise.resolve(route(input)),
    deleteRoute: () => Promise.resolve(),
    createRequestWithAssignments: () =>
      Promise.resolve({ request: request(), assignments: [assignment()] }),
    getAssignment: () => Promise.resolve(assignment()),
    respondAssignment: () => Promise.resolve({ request: request(), fulfilled: false }),
    markDispatched: () => Promise.resolve(),
    dueSoonAssignments: () => Promise.resolve<RelayAssignment[]>([]),
    overdueAssignments: () => Promise.resolve<RelayAssignment[]>([]),
    markAssignmentOverdue: () => Promise.resolve(),
    incReminders: () => Promise.resolve(),
    markEscalated: () => Promise.resolve(),
    markRequestOverdue: () => Promise.resolve(),
    markBreachNotified: () => Promise.resolve(false),
    appendEvent: () => Promise.resolve(),
    overview: () => Promise.resolve(emptyOverview()),
    listRequests: () => Promise.resolve<RelayRequest[]>([]),
    getRequestDetail: () =>
      Promise.resolve<RelayRequestDetail>({ request: request(), assignments: [], events: [] }),
    ...over,
  };
}

describe('relay ingest', () => {
  it('service_code хоосон бол 400', async () => {
    const uc = newRelayUsecase(fakeRepo());
    await expect(
      uc.ingest(ctx, {
        sourcePlatform: '',
        externalRef: '',
        serviceCode: '   ',
        title: '',
        payload: null,
        priority: '',
        dueAt: null,
      }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.BadRequest));
  });

  it('чиглүүлэлтгүй service_code нь 400 — даалгаваргүй хүсэлт үүсэхгүй', async () => {
    const create = vi.fn(() =>
      Promise.resolve({ request: request(), assignments: [assignment()] }),
    );
    const uc = newRelayUsecase(
      fakeRepo({
        routesForService: () => Promise.resolve([]),
        createRequestWithAssignments: create,
      }),
    );
    await expect(
      uc.ingest(ctx, {
        sourcePlatform: '',
        externalRef: '',
        serviceCode: 'svc.unknown',
        title: '',
        payload: null,
        priority: '',
        dueAt: null,
      }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.BadRequest));
    expect(create).not.toHaveBeenCalled();
  });

  it('assignment-ийн SLA нь хүсэлтийн эцсийн хугацаанаас ХЭТРЭХГҮЙ', async () => {
    let captured: { request: NewRelayRequest; assignments: NewRelayAssignment[] } | null = null;
    const uc = newRelayUsecase(
      fakeRepo({
        // Нэг маршрут 60 минут, нөгөө нь 10 минут — хүсэлтийн due нь 15 минут.
        routesForService: () =>
          Promise.resolve([
            route({ id: 'r1', platformId: 'p2', slaMinutes: 60 }),
            route({ id: 'r2', platformId: 'p3', slaMinutes: 10 }),
          ]),
        createRequestWithAssignments: (_c: Ctx, req, asg) => {
          captured = { request: req, assignments: asg };
          return Promise.resolve({ request: request(), assignments: [] });
        },
      }),
    );

    const due = new Date(Date.now() + 15 * 60_000);
    await uc.ingest(ctx, {
      sourcePlatform: 'e-mongolia',
      externalRef: 'X-1',
      serviceCode: 'svc.test',
      title: 'тест',
      payload: { a: 1 },
      priority: '',
      dueAt: due,
    });

    const cap = captured as unknown as {
      request: NewRelayRequest;
      assignments: NewRelayAssignment[];
    };
    expect(cap.request.dueAt.getTime()).toBe(due.getTime());
    expect(cap.request.status).toBe(RelayReqDispatched);
    // Priority хоосон бол "normal".
    expect(cap.request.priority).toBe('normal');
    // 60 минутын маршрут нь хүсэлтийн due дээр таслагдана; 10 минутынх хэвээр.
    expect(cap.assignments[0]?.dueAt.getTime()).toBe(due.getTime());
    expect(cap.assignments[1]?.dueAt.getTime()).toBeLessThan(due.getTime());
  });

  it('due_at өгөгдөөгүй бол хамгийн урт SLA-аар тооцно', async () => {
    let captured: NewRelayRequest | null = null;
    const uc = newRelayUsecase(
      fakeRepo({
        routesForService: () =>
          Promise.resolve([route({ slaMinutes: 30 }), route({ id: 'r2', slaMinutes: 90 })]),
        createRequestWithAssignments: (_c: Ctx, req) => {
          captured = req;
          return Promise.resolve({ request: request(), assignments: [] });
        },
      }),
    );
    const before = Date.now();
    await uc.ingest(ctx, {
      sourcePlatform: '',
      externalRef: '',
      serviceCode: 'svc.test',
      title: '',
      payload: null,
      priority: '',
      dueAt: null,
    });
    const cap = captured as unknown as NewRelayRequest;
    const minutes = (cap.dueAt.getTime() - before) / 60_000;
    expect(minutes).toBeGreaterThan(89);
    expect(minutes).toBeLessThan(91);
  });

  it('dispatch нь assignment бүрийг тэмдэглэж timeline бичнэ', async () => {
    const markDispatched = vi.fn((_c: Ctx, _id: string) => Promise.resolve());
    const events: NewRelayEvent[] = [];
    const uc = newRelayUsecase(
      fakeRepo({
        routesForService: () => Promise.resolve([route()]),
        createRequestWithAssignments: () =>
          Promise.resolve({
            request: request(),
            assignments: [assignment({ id: 'a1' }), assignment({ id: 'a2' })],
          }),
        markDispatched,
        appendEvent: (_c: Ctx, e: NewRelayEvent) => {
          events.push(e);
          return Promise.resolve();
        },
      }),
    );
    await uc.ingest(ctx, {
      sourcePlatform: '',
      externalRef: '',
      serviceCode: 'svc.test',
      title: '',
      payload: null,
      priority: '',
      dueAt: null,
    });
    expect(markDispatched).toHaveBeenCalledTimes(2);
    expect(events.map((e) => e.type)).toEqual(['received', 'dispatched', 'dispatched']);
  });
});

describe('relay respond', () => {
  it('done/rejected биш статусыг ТАТГАЛЗАНА', async () => {
    const respondAssignment = vi.fn(() =>
      Promise.resolve({ request: request(), fulfilled: false }),
    );
    const uc = newRelayUsecase(fakeRepo({ respondAssignment }));
    await expect(uc.respond(ctx, 'a1', { status: 'maybe', result: null })).rejects.toSatisfy(
      (e: unknown) => is(e, ErrorType.BadRequest),
    );
    expect(respondAssignment).not.toHaveBeenCalled();
  });

  it('бүх даалгавар дуусвал fulfilled event бичигдэнэ', async () => {
    const events: NewRelayEvent[] = [];
    const uc = newRelayUsecase(
      fakeRepo({
        respondAssignment: () => Promise.resolve({ request: request(), fulfilled: true }),
        appendEvent: (_c: Ctx, e: NewRelayEvent) => {
          events.push(e);
          return Promise.resolve();
        },
      }),
    );
    await uc.respond(ctx, 'a1', { status: 'done', result: { ok: true } });
    expect(events.map((e) => e.type)).toEqual(['responded', 'fulfilled']);
  });
});

describe('relay webhook (m2m)', () => {
  const body = Buffer.from(
    JSON.stringify({ event: 'forward', source_code: 'peer', service_code: 'svc.test' }),
    'utf8',
  );

  it('source header хоосон бол 400', async () => {
    const uc = newRelayUsecase(fakeRepo());
    await expect(uc.receiveWebhook(ctx, '', 'sha256=x', body)).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.BadRequest),
    );
  });

  it('бүртгэлгүй эх platform нь 401 (жагсаалт тандахаас хамгаална)', async () => {
    const uc = newRelayUsecase(fakeRepo());
    await expect(uc.receiveWebhook(ctx, 'unknown', 'sha256=x', body)).rejects.toSatisfy(
      (e: unknown) => is(e, ErrorType.Unauthorized),
    );
  });

  it('идэвхгүй platform нь 403', async () => {
    const uc = newRelayUsecase(
      fakeRepo({ getPlatformByCode: () => Promise.resolve(platform({ enabled: false })) }),
    );
    await expect(uc.receiveWebhook(ctx, 'e-mongolia', 'sha256=x', body)).rejects.toSatisfy(
      (e: unknown) => is(e, ErrorType.Forbidden),
    );
  });

  it('гарын үсэг таарахгүй бол 401 — ingest ХИЙГДЭХГҮЙ', async () => {
    const create = vi.fn(() =>
      Promise.resolve({ request: request(), assignments: [assignment()] }),
    );
    const uc = newRelayUsecase(
      fakeRepo({
        getPlatformByCode: () => Promise.resolve(platform()),
        routesForService: () => Promise.resolve([route()]),
        createRequestWithAssignments: create,
      }),
    );
    await expect(uc.receiveWebhook(ctx, 'e-mongolia', 'sha256=deadbeef', body)).rejects.toSatisfy(
      (e: unknown) => is(e, ErrorType.Unauthorized),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('зөв гарын үсэгтэй webhook нь хүсэлт болж ingest хийгдэнэ', async () => {
    let captured: NewRelayRequest | null = null;
    const uc = newRelayUsecase(
      fakeRepo({
        getPlatformByCode: () => Promise.resolve(platform()),
        routesForService: () => Promise.resolve([route()]),
        createRequestWithAssignments: (_c: Ctx, req) => {
          captured = req;
          return Promise.resolve({ request: request(), assignments: [] });
        },
      }),
    );
    await uc.receiveWebhook(ctx, 'e-mongolia', relaySignWebhook('secret-key', body), body);
    const cap = captured as unknown as NewRelayRequest;
    // sourcePlatform нь БҮРТГЭЛИЙН code — envelope доторх утга биш (хуурч болохгүй).
    expect(cap.sourcePlatform).toBe('e-mongolia');
    expect(cap.serviceCode).toBe('svc.test');
  });

  it('гарын үсэг зөв ч бие эвдэрсэн бол 400', async () => {
    const broken = Buffer.from('not-json', 'utf8');
    const uc = newRelayUsecase(fakeRepo({ getPlatformByCode: () => Promise.resolve(platform()) }));
    await expect(
      uc.receiveWebhook(ctx, 'e-mongolia', relaySignWebhook('secret-key', broken), broken),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.BadRequest));
  });
});

describe('relay forwardUp', () => {
  it('доод (downstream) platform руу дамжуулахыг ТАТГАЛЗАНА', async () => {
    const uc = newRelayUsecase(
      fakeRepo({
        getPlatformByCode: () => Promise.resolve(platform({ direction: RelayDirDownstream })),
      }),
    );
    await expect(uc.forwardUp(ctx, 'req-1', 'downstream-peer')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.BadRequest),
    );
  });

  it('дээд platform руу дамжуулбал forwarded_up event бичигдэнэ', async () => {
    const events: NewRelayEvent[] = [];
    const uc = newRelayUsecase(
      fakeRepo({
        getPlatformByCode: () => Promise.resolve(platform()),
        appendEvent: (_c: Ctx, e: NewRelayEvent) => {
          events.push(e);
          return Promise.resolve();
        },
      }),
    );
    await uc.forwardUp(ctx, 'req-1', 'e-mongolia');
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('forwarded_up');
  });

  it('request_id хоосон бол 400', async () => {
    const uc = newRelayUsecase(fakeRepo());
    await expect(uc.forwardUp(ctx, '', 'e-mongolia')).rejects.toSatisfy((e: unknown) =>
      is(e, ErrorType.BadRequest),
    );
  });
});

describe('relay SLA sweep', () => {
  it('75%/90% босго давсан бол дутуу сануулгыг гүйцээнэ', async () => {
    const now = Date.now();
    const inc = vi.fn((_c: Ctx, _id: string) => Promise.resolve());
    const events: NewRelayEvent[] = [];
    const uc = newRelayUsecase(
      fakeRepo({
        dueSoonAssignments: () =>
          Promise.resolve([
            assignment({
              dispatchedAt: new Date(now - 55 * 60_000),
              dueAt: new Date(now + 5 * 60_000), // 60 минутын цонхны 91.6%
              remindersSent: 0,
            }),
          ]),
        incReminders: inc,
        appendEvent: (_c: Ctx, e: NewRelayEvent) => {
          events.push(e);
          return Promise.resolve();
        },
      }),
    );
    await uc.slaSweep(ctx);
    expect(inc).toHaveBeenCalledTimes(2);
    expect(events.filter((e) => e.type === RelayEvtReminded)).toHaveLength(2);
  });

  it('сануулга аль хэдийн илгээгдсэн бол давхардуулахгүй', async () => {
    const inc = vi.fn((_c: Ctx, _id: string) => Promise.resolve());
    const now = Date.now();
    const uc = newRelayUsecase(
      fakeRepo({
        dueSoonAssignments: () =>
          Promise.resolve([
            assignment({
              dispatchedAt: new Date(now - 55 * 60_000),
              dueAt: new Date(now + 5 * 60_000),
              remindersSent: 2,
            }),
          ]),
        incReminders: inc,
      }),
    );
    await uc.slaSweep(ctx);
    expect(inc).not.toHaveBeenCalled();
  });

  it('dispatch хийгдээгүй даалгаварт сануулга илгээхгүй', async () => {
    const inc = vi.fn((_c: Ctx, _id: string) => Promise.resolve());
    const uc = newRelayUsecase(
      fakeRepo({
        dueSoonAssignments: () => Promise.resolve([assignment({ dispatchedAt: null })]),
        incReminders: inc,
      }),
    );
    await uc.slaSweep(ctx);
    expect(inc).not.toHaveBeenCalled();
  });

  it('хугацаа хэтэрсэнийг тэмдэглэж, grace дууссан бол escalate хийнэ', async () => {
    const now = Date.now();
    const markOverdue = vi.fn((_c: Ctx, _id: string) => Promise.resolve());
    const markEscalated = vi.fn((_c: Ctx, _id: string) => Promise.resolve());
    const events: NewRelayEvent[] = [];
    const uc = newRelayUsecase(
      fakeRepo({
        overdueAssignments: () =>
          Promise.resolve([assignment({ dueAt: new Date(now - 5 * 60_000), escalated: false })]),
        markAssignmentOverdue: markOverdue,
        markEscalated,
        appendEvent: (_c: Ctx, e: NewRelayEvent) => {
          events.push(e);
          return Promise.resolve();
        },
      }),
    );
    await uc.slaSweep(ctx);
    expect(markOverdue).toHaveBeenCalledOnce();
    expect(markEscalated).toHaveBeenCalledOnce();
    expect(events.map((e) => e.type)).toContain(RelayEvtOverdue);
    expect(events.map((e) => e.type)).toContain(RelayEvtEscalated);
  });

  it('grace дуусаагүй бол escalate хийхгүй', async () => {
    const markEscalated = vi.fn((_c: Ctx, _id: string) => Promise.resolve());
    const uc = newRelayUsecase(
      fakeRepo({
        overdueAssignments: () =>
          Promise.resolve([
            assignment({ status: RelayAsgOverdue, dueAt: new Date(Date.now() - 30_000) }),
          ]),
        markEscalated,
      }),
    );
    await uc.slaSweep(ctx);
    expect(markEscalated).not.toHaveBeenCalled();
  });

  it('breach мэдэгдэл нь хүсэлт тус бүрд ЗӨВХӨН НЭГ УДАА (латч)', async () => {
    const markBreach = vi.fn((_c: Ctx, _id: string) => Promise.resolve(true));
    const events: NewRelayEvent[] = [];
    const uc = newRelayUsecase(
      fakeRepo({
        overdueAssignments: () =>
          Promise.resolve([
            assignment({ id: 'a1', requestId: 'req-1', status: RelayAsgOverdue }),
            assignment({ id: 'a2', requestId: 'req-1', status: RelayAsgOverdue }),
          ]),
        markBreachNotified: markBreach,
        appendEvent: (_c: Ctx, e: NewRelayEvent) => {
          events.push(e);
          return Promise.resolve();
        },
      }),
    );
    await uc.slaSweep(ctx);
    expect(markBreach).toHaveBeenCalledTimes(1);
    expect(events.filter((e) => e.type === RelayEvtBreachNotified)).toHaveLength(1);
  });

  it('DB алдаа sweep-ийг УНАГАХГҮЙ (дараагийн tick дахин оролдоно)', async () => {
    const uc = newRelayUsecase(
      fakeRepo({
        dueSoonAssignments: () => Promise.reject(new Error('db down')),
        overdueAssignments: () => Promise.reject(new Error('db down')),
      }),
    );
    await expect(uc.slaSweep(ctx)).resolves.toBeUndefined();
  });
});

describe('relay platforms / routes', () => {
  it('code эсвэл name хоосон бол 400', async () => {
    const uc = newRelayUsecase(fakeRepo());
    await expect(
      uc.createPlatform(ctx, {
        code: '',
        name: 'x',
        direction: '',
        endpointUrl: '',
        supervisorContact: '',
        webhookSecret: '',
        enabled: true,
      }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.BadRequest));
  });

  it('танихгүй direction нь 400', async () => {
    const uc = newRelayUsecase(fakeRepo());
    await expect(
      uc.createPlatform(ctx, {
        code: 'c',
        name: 'n',
        direction: 'sideways',
        endpointUrl: '',
        supervisorContact: '',
        webhookSecret: '',
        enabled: true,
      }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.BadRequest));
  });

  it('нууц өгөөгүй бол 64-hex нууц ӨӨРӨӨ үүснэ (секретгүй peer үүсэхгүй)', async () => {
    let captured = '';
    const uc = newRelayUsecase(
      fakeRepo({
        createPlatform: (_c: Ctx, input) => {
          captured = input.webhookSecret;
          return Promise.resolve(platform(input));
        },
      }),
    );
    await uc.createPlatform(ctx, {
      code: 'peer',
      name: 'Peer',
      direction: '',
      endpointUrl: '',
      supervisorContact: '',
      webhookSecret: '',
      enabled: true,
    });
    expect(captured).toMatch(/^[0-9a-f]{64}$/);
  });

  it('direction хоосон бол downstream гэж тооцно', async () => {
    let captured = '';
    const uc = newRelayUsecase(
      fakeRepo({
        createPlatform: (_c: Ctx, input) => {
          captured = input.direction;
          return Promise.resolve(platform(input));
        },
      }),
    );
    await uc.createPlatform(ctx, {
      code: 'peer',
      name: 'Peer',
      direction: '',
      endpointUrl: '',
      supervisorContact: '',
      webhookSecret: 'given',
      enabled: true,
    });
    expect(captured).toBe(RelayDirDownstream);
  });

  it('sla_minutes 0 бол өгөгдмөл 60 минут', async () => {
    let captured = 0;
    const uc = newRelayUsecase(
      fakeRepo({
        createRoute: (_c: Ctx, input) => {
          captured = input.slaMinutes;
          return Promise.resolve(route(input));
        },
      }),
    );
    await uc.createRoute(ctx, { serviceCode: 'svc', platformId: 'p2', slaMinutes: 0 });
    expect(captured).toBe(60);
  });

  it('service_code эсвэл platform_id хоосон бол 400', async () => {
    const uc = newRelayUsecase(fakeRepo());
    await expect(
      uc.createRoute(ctx, { serviceCode: '', platformId: 'p', slaMinutes: 10 }),
    ).rejects.toSatisfy((e: unknown) => is(e, ErrorType.BadRequest));
  });
});

describe('relay жагсаалтын хязгаар', () => {
  it('limit 0 эсвэл хэтэрхий том бол 50 болно', async () => {
    const limits: number[] = [];
    const uc = newRelayUsecase(
      fakeRepo({
        listRequests: (_c: Ctx, limit: number) => {
          limits.push(limit);
          return Promise.resolve([]);
        },
      }),
    );
    await uc.listRequests(ctx, 0);
    await uc.listRequests(ctx, 500);
    await uc.listRequests(ctx, 25);
    expect(limits).toEqual([50, 50, 25]);
  });
});
