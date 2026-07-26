// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// gov usecase-ийн unit тестүүд. Гол зорилго:
//   • auto ↔ manual салаалт (EU 2018/1724 Art.6(2)-ийн мэдэгдлийн ялгаа)
//   • үнэлэх эрхтэй "auto" үйлчилгээ гараар хянуулах руу БУУНА
//   • татгалзах шийдвэр ҮНДЭСЛЭЛГҮЙ гарахгүй
//   • төлөвийн машин зөрчигдөхгүй (409)
//   • дараалалд `assigned_to` нь зөвхөн "me" (өөр хүний ID шургуулах боломжгүй)

import { describe, expect, it, vi } from 'vitest';

import { ErrorType, is } from '../../apperror/index.js';
import type {
  GovDecisionInput,
  GovRepository,
  NewGovApplication,
  NewGovAppointment,
  NewGovReference,
} from '../../datasources/repositories/interface/gov.js';
import type { GovApplication, GovQueueFilter, GovService } from '../../domain/gov.js';
import { background } from '../../pkg/ctx/ctx.js';
import { newGovUsecase } from './gov_usecase.js';

const userId = '11111111-1111-1111-1111-111111111111';
const officerId = '22222222-2222-2222-2222-222222222222';
const serviceId = '33333333-3333-3333-3333-333333333333';
const appId = '44444444-4444-4444-4444-444444444444';

function service(over: Partial<GovService> = {}): GovService {
  return {
    id: serviceId,
    code: 'MN-01-001',
    name: 'Оршин суугаа газрын лавлагаа',
    category: 'reference',
    agency: 'УБЕГ',
    description: '',
    fee: 0,
    processingDays: 3,
    processingTime: '',
    cofogCode: '',
    cofogLabel: '',
    mainActivity: '',
    sdgCode: '',
    outputType: 'Declaration',
    outputRefType: '',
    evidence: [],
    legalBasis: '',
    assuranceLevel: 'substantial',
    lifecycle: 'active',
    fulfilment: 'manual',
    hasDiscretion: false,
    hasAssessment: false,
    slaHours: 72,
    tacitApproval: false,
    lifeEvents: [],
    online: true,
    enabled: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  };
}

function application(over: Partial<GovApplication> = {}): GovApplication {
  return {
    id: appId,
    userId,
    serviceId,
    serviceCode: 'MN-01-001',
    serviceName: 'Оршин суугаа газрын лавлагаа',
    referenceNo: 'APP-2026-100001',
    status: 'registered',
    result: '',
    note: '',
    payload: null,
    assignedTo: null,
    assignedAt: null,
    decidedBy: null,
    decidedAt: null,
    decisionNote: '',
    dueAt: null,
    slaBreached: false,
    suspendedAt: null,
    outputRefId: null,
    tacit: false,
    submittedAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: null,
    ...over,
  };
}

function build(over: Partial<GovRepository> = {}) {
  const repo: GovRepository = {
    listServices: vi.fn(() => Promise.resolve([service()])),
    getService: vi.fn(() => Promise.resolve(service())),
    listLifeEvents: vi.fn(() => Promise.resolve([])),
    listApplications: vi.fn(() => Promise.resolve([])),
    getApplication: vi.fn(() => Promise.resolve(application())),
    createApplication: vi.fn((_c: unknown, i: NewGovApplication) =>
      Promise.resolve(application({ ...i, serviceId: i.serviceId })),
    ),
    setApplicationStatus: vi.fn(() => Promise.resolve()),
    createApplicationWithOutput: vi.fn((_c: unknown, a: NewGovApplication) =>
      Promise.resolve({ application: application({ ...a }), reference: null }),
    ),
    queueStats: vi.fn(() =>
      Promise.resolve({ open: 0, unassigned: 0, mine: 0, overdue: 0, dueSoon: 0 }),
    ),
    listQueue: vi.fn(() => Promise.resolve([])),
    getApplicationAny: vi.fn(() => Promise.resolve(application())),
    assignApplication: vi.fn(() => Promise.resolve(application({ status: 'in_review' }))),
    decideApplication: vi.fn((_c: unknown, d: GovDecisionInput) =>
      Promise.resolve(application({ status: d.target, result: d.result })),
    ),
    completeApplication: vi.fn(() => Promise.resolve(application({ status: 'completed' }))),
    requestMoreInfo: vi.fn(() => Promise.resolve(application({ status: 'info_required' }))),
    resumeFromInfo: vi.fn(() => Promise.resolve(application({ status: 'in_review' }))),
    appendApplicationEvent: vi.fn(() => Promise.resolve()),
    listApplicationEvents: vi.fn(() => Promise.resolve([])),
    markSLABreached: vi.fn(() => Promise.resolve([])),
    tacitApprovals: vi.fn(() => Promise.resolve([])),
    listReferences: vi.fn(() => Promise.resolve([])),
    createReference: vi.fn((_c: unknown, r: NewGovReference) =>
      Promise.resolve({
        id: 'ref-1',
        userId: r.userId,
        type: r.type,
        title: r.title,
        referenceNo: r.referenceNo,
        status: r.status,
        issuedAt: new Date(),
        validUntil: r.validUntil,
        data: r.data,
      }),
    ),
    createNotification: vi.fn(() => Promise.resolve()),
    listNotifications: vi.fn(() => Promise.resolve([])),
    markNotificationRead: vi.fn(() => Promise.resolve()),
    markAllNotificationsRead: vi.fn(() => Promise.resolve()),
    listPayments: vi.fn(() => Promise.resolve([])),
    payPayment: vi.fn(() => Promise.resolve()),
    listAppointments: vi.fn(() => Promise.resolve([])),
    createAppointment: vi.fn((_c: unknown, a: NewGovAppointment) =>
      Promise.resolve({ ...a, id: 'appt-1', createdAt: new Date() }),
    ),
    cancelAppointment: vi.fn(() => Promise.resolve()),
    overview: vi.fn(() =>
      Promise.resolve({
        openApplications: 0,
        unreadNotifications: 0,
        unpaidCount: 0,
        unpaidAmount: 0,
        upcomingCount: 0,
        issuedReferences: 0,
        recentApplications: [],
        upcomingAppointments: [],
      }),
    ),
    countUserRows: vi.fn(() => Promise.resolve(1)),
    seedDemoData: vi.fn(() => Promise.resolve()),
    ...over,
  };
  return { uc: newGovUsecase(repo), repo };
}

describe('хүсэлт илгээх — auto ↔ manual салаалт', () => {
  it('auto үйлчилгээ НЭГ транзакцид биелж, лавлагаа олгогдоно', async () => {
    const createApplicationWithOutput = vi.fn(
      (_c: unknown, a: NewGovApplication, _r: NewGovReference | null) =>
        Promise.resolve({ application: application({ ...a }), reference: null }),
    );
    const { uc, repo } = build({
      getService: vi.fn(() =>
        Promise.resolve(service({ fulfilment: 'auto', outputRefType: 'residence' })),
      ),
      createApplicationWithOutput,
    });

    const out = await uc.apply(background(), userId, { serviceId, note: '', payload: null });

    expect(out.autoIssued).toBe(true);
    const [, app, ref] = createApplicationWithOutput.mock.calls[0]!;
    expect(app.status).toBe('completed');
    expect(app.result).toBe('processed');
    expect(ref?.type).toBe('residence');
    // Гаралт шууд олгогдсон тул дараалалд ОРОХГҮЙ.
    expect(repo.createApplication).not.toHaveBeenCalled();
  });

  it('manual үйлчилгээ дараалалд орж SLA цаг эхэлнэ + хүлээн авсан мэдэгдэл', async () => {
    const createApplication = vi.fn((_c: unknown, i: NewGovApplication) =>
      Promise.resolve(application({ ...i })),
    );
    const { uc, repo } = build({ createApplication });

    const out = await uc.apply(background(), userId, {
      serviceId,
      note: ' тэмдэглэл ',
      payload: null,
    });

    expect(out.autoIssued).toBe(false);
    const app = createApplication.mock.calls[0]![1];
    expect(app.status).toBe('registered');
    expect(app.note).toBe('тэмдэглэл');
    // SLA 72 цаг → dueAt тавигдана.
    expect(app.dueAt).not.toBeNull();
    // Art.6(2)(b) — хүлээн авсан тухай мэдэгдэл.
    expect(repo.createNotification).toHaveBeenCalled();
  });

  it('үнэлэх эрхтэй "auto" үйлчилгээ ГАРААР хянуулах руу буурна', async () => {
    const { uc, repo } = build({
      getService: vi.fn(() =>
        Promise.resolve(service({ fulfilment: 'auto', hasDiscretion: true })),
      ),
    });

    const out = await uc.apply(background(), userId, { serviceId, note: '', payload: null });

    expect(out.autoIssued).toBe(false);
    expect(repo.createApplication).toHaveBeenCalled();
    expect(repo.createApplicationWithOutput).not.toHaveBeenCalled();
  });

  it('идэвхгүй үйлчилгээнд хүсэлт өгөхийг татгалзана', async () => {
    const { uc } = build({ getService: vi.fn(() => Promise.resolve(service({ enabled: false }))) });
    await expect(
      uc.apply(background(), userId, { serviceId, note: '', payload: null }),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
  });

  it('service_id хоосон бол 400', async () => {
    const { uc } = build();
    await expect(
      uc.apply(background(), userId, { serviceId: '  ', note: '', payload: null }),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
  });
});

describe('менежерийн шийдвэр', () => {
  it('татгалзах шийдвэр ҮНДЭСЛЭЛГҮЙ гарахгүй (400)', async () => {
    const { uc, repo } = build();
    await expect(
      uc.decide(background(), officerId, appId, { approve: false, note: '  ', result: '' }),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
    expect(repo.decideApplication).not.toHaveBeenCalled();
  });

  it('гаралт нь лавлагаа бол ШУУД completed + лавлагаа үүснэ', async () => {
    const decideApplication = vi.fn((_c: unknown, d: GovDecisionInput) =>
      Promise.resolve(application({ status: d.target })),
    );
    const { uc } = build({
      getService: vi.fn(() => Promise.resolve(service({ outputRefType: 'residence' }))),
      decideApplication,
    });

    await uc.decide(background(), officerId, appId, { approve: true, note: 'OK', result: '' });

    const d = decideApplication.mock.calls[0]![1];
    expect(d.target).toBe('completed');
    expect(d.result).toBe('granted');
    expect(d.outputRef?.type).toBe('residence');
  });

  it('гаралт нь БИЕТ зүйл бол approved (хүргэгдэх хүртэл)', async () => {
    const decideApplication = vi.fn((_c: unknown, d: GovDecisionInput) =>
      Promise.resolve(application({ status: d.target })),
    );
    const { uc } = build({
      getService: vi.fn(() => Promise.resolve(service({ outputRefType: '' }))),
      decideApplication,
    });

    await uc.decide(background(), officerId, appId, { approve: true, note: '', result: '' });

    const d = decideApplication.mock.calls[0]![1];
    expect(d.target).toBe('approved');
    expect(d.outputRef).toBeNull();
  });

  it('төлөвийн машин зөрчигдвөл 409 (DB-д ч хүрэхгүй)', async () => {
    const { uc, repo } = build({
      // Аль хэдийн дууссан хүсэлт — цаашид шилжихгүй.
      getApplicationAny: vi.fn(() => Promise.resolve(application({ status: 'completed' }))),
    });
    await expect(
      uc.decide(background(), officerId, appId, { approve: true, note: '', result: '' }),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.Conflict));
    expect(repo.decideApplication).not.toHaveBeenCalled();
  });

  it('нэмэлт мэдээлэл хүсэхэд юу дутууг бичих ЁСТОЙ', async () => {
    const { uc, repo } = build();
    await expect(uc.requestInfo(background(), officerId, appId, '   ')).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.BadRequest),
    );
    expect(repo.requestMoreInfo).not.toHaveBeenCalled();
  });
});

describe('менежерийн дараалал', () => {
  it('assigned_to нь зөвхөн "me" — өөр хүний ID шургуулах боломжгүй', async () => {
    const { uc, repo } = build();
    await expect(
      uc.listQueue(background(), officerId, {
        status: '',
        assignedTo: officerId,
        overdue: false,
        limit: 50,
        offset: 0,
      }),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
    expect(repo.listQueue).not.toHaveBeenCalled();
  });

  it('"me" нь баталгаажсан officerId болж хөрвөнө', async () => {
    const listQueue = vi.fn((_c: unknown, _f: GovQueueFilter) =>
      Promise.resolve([] as GovApplication[]),
    );
    const { uc } = build({ listQueue });
    await uc.listQueue(background(), officerId, {
      status: '',
      assignedTo: 'me',
      overdue: false,
      limit: 50,
      offset: 0,
    });
    expect(listQueue.mock.calls[0]![1].assignedTo).toBe(officerId);
  });

  it('танихгүй төлөвийн шүүлтүүр 400', async () => {
    const { uc } = build();
    await expect(
      uc.listQueue(background(), officerId, {
        status: 'made_up',
        assignedTo: '',
        overdue: false,
        limit: 50,
        offset: 0,
      }),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
  });
});

describe('лавлагаа', () => {
  it('танихгүй төрөл 400', async () => {
    const { uc, repo } = build();
    await expect(uc.requestReference(background(), userId, 'made_up')).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.BadRequest),
    );
    expect(repo.createReference).not.toHaveBeenCalled();
  });

  it('танигдсан төрөлд гарчиг автоматаар онооно', async () => {
    const createReference = vi.fn((_c: unknown, r: NewGovReference) =>
      Promise.resolve({
        id: 'ref-1',
        userId: r.userId,
        type: r.type,
        title: r.title,
        referenceNo: r.referenceNo,
        status: r.status,
        issuedAt: new Date(),
        validUntil: r.validUntil,
        data: null,
      }),
    );
    const { uc } = build({ createReference });
    const ref = await uc.requestReference(background(), userId, ' TAX ');
    expect(ref.type).toBe('tax');
    expect(ref.title).toBe('Татварын тодорхойлолт');
    expect(ref.referenceNo).toMatch(/^REF-\d{4}-\d{6}$/);
  });
});

describe('цаг захиалга', () => {
  it('өнгөрсөн цаг 400', async () => {
    const { uc, repo } = build();
    await expect(
      uc.bookAppointment(background(), userId, {
        serviceId: '',
        scheduledAt: new Date('2020-01-01T00:00:00Z'),
        location: '',
        note: '',
      }),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
    expect(repo.createAppointment).not.toHaveBeenCalled();
  });

  it('1 жилээс хол цаг 400 (хог өгөгдлөөс сэргийлнэ)', async () => {
    const { uc } = build();
    const far = new Date();
    far.setFullYear(far.getFullYear() + 2);
    await expect(
      uc.bookAppointment(background(), userId, {
        serviceId: '',
        scheduledAt: far,
        location: '',
        note: '',
      }),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
  });

  it('үйлчилгээ заавал бол нэр/байгууллага автоматаар бөглөгдөнө', async () => {
    const createAppointment = vi.fn((_c: unknown, a: NewGovAppointment) =>
      Promise.resolve({ ...a, id: 'appt-1', createdAt: new Date() }),
    );
    const { uc } = build({ createAppointment });
    const soon = new Date(Date.now() + 86_400_000);

    await uc.bookAppointment(background(), userId, {
      serviceId,
      scheduledAt: soon,
      location: ' БЗД ',
      note: '',
    });

    const a = createAppointment.mock.calls[0]![1];
    expect(a.serviceName).toBe('Оршин суугаа газрын лавлагаа');
    expect(a.agency).toBe('УБЕГ');
    expect(a.location).toBe('БЗД');
    expect(a.status).toBe('booked');
  });
});

describe('SLA sweep', () => {
  it('хугацаа хэтэрсэн бүрд мэдэгдэл + timeline бичнэ', async () => {
    const { uc, repo } = build({
      markSLABreached: vi.fn(() => Promise.resolve([application({ status: 'in_review' })])),
      tacitApprovals: vi.fn(() => Promise.resolve([application({ status: 'completed' })])),
    });

    await uc.slaSweep(background());

    // Хоёр төрлийн sweep тус бүрд мэдэгдэл.
    expect(repo.createNotification).toHaveBeenCalledTimes(2);
    expect(repo.appendApplicationEvent).toHaveBeenCalledTimes(2);
  });

  it('нэг sweep унасан ч нөгөө нь үргэлжилнэ', async () => {
    const tacitApprovals = vi.fn(() => Promise.resolve([application()]));
    const { uc } = build({
      markSLABreached: vi.fn(() => Promise.reject(new Error('db down'))),
      tacitApprovals,
    });

    await expect(uc.slaSweep(background())).resolves.toBeUndefined();
    expect(tacitApprovals).toHaveBeenCalled();
  });
});

describe('эзэмшлийн шалгалт', () => {
  it('timeline нь ЭХЛЭЭД эзэмшлийг шалгана (өөр хүнийх бол 404)', async () => {
    const getApplication = vi.fn(() => Promise.reject(new Error('not found')));
    const { uc, repo } = build({ getApplication });
    await expect(uc.applicationTimeline(background(), userId, appId)).rejects.toThrow();
    expect(repo.listApplicationEvents).not.toHaveBeenCalled();
  });
});
