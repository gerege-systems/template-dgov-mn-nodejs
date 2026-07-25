// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Registry usecase-ийн unit тестүүд. Гол зорилго:
//   • ЭРХ ЗҮЙН шалгуур: үнэлэх эрх/үнэлгээний зайтай үйлчилгээг автоматжуулахгүй
//   • Регистр өөрөө ХУДАЛ мэдээлэл агуулахгүй (once-only зөрчилтэй байж
//     "once_only" гэж нийтлэхгүй)
//   • Нийтлэгдсэн паспорт устгагдахгүй (архивлана), архивласан нь засагдахгүй
//   • Нийтийн каталог нь ноорог/архивласныг ХЭЗЭЭ Ч гаргахгүй

import { describe, expect, it, vi } from 'vitest';

import { ErrorType, is } from '../../apperror/index.js';
import type {
  NewRegistryService,
  NewRegistryVersion,
  RegistryFilter,
  RegistryRepository,
} from '../../datasources/repositories/interface/registry.js';
import type { RegistryService, RegistryServiceEvidence } from '../../domain/registry.js';
import { background } from '../../pkg/ctx/ctx.js';
import { newRegistryUsecase, type ServiceInput } from './registry_usecase.js';

const serviceId = '11111111-1111-1111-1111-111111111111';

function service(over: Partial<RegistryService> = {}): RegistryService {
  return {
    id: serviceId,
    code: 'BIRTH_CERT',
    name: 'Төрсний гэрчилгээ',
    nameEn: 'Birth certificate',
    description: '',
    authority: 'УБЕГ',
    authorityOrgId: null,
    legalBasis: '',
    targetGroup: '',
    output: '',
    channels: ['e-mongolia'],
    fee: 0,
    maxDays: 3,
    stepsCount: 2,
    annualVolume: 1000,
    proactivity: 'online',
    status: 'draft',
    lifeEventId: null,
    category: '',
    cofogCode: '',
    cofogLabel: '',
    mainActivity: '',
    sdgCode: '',
    processingTime: '',
    outputType: 'Declaration',
    outputRefType: '',
    assuranceLevel: 'substantial',
    fulfilment: 'manual',
    hasDiscretion: false,
    hasAssessment: false,
    slaHours: 24,
    tacitApproval: false,
    online: true,
    version: 0,
    publishedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: null,
    evidences: [],
    ...over,
  };
}

function evidence(over: Partial<RegistryServiceEvidence> = {}): RegistryServiceEvidence {
  return {
    evidenceId: '22222222-2222-2222-2222-222222222222',
    code: 'ID_CARD',
    name: 'Иргэний үнэмлэх',
    required: true,
    fromCitizen: true,
    inKhur: false,
    note: '',
    ...over,
  };
}

function input(over: Partial<ServiceInput> = {}): ServiceInput {
  return {
    code: 'BIRTH_CERT',
    name: 'Төрсний гэрчилгээ',
    nameEn: '',
    description: '',
    authority: 'УБЕГ',
    authorityOrgId: null,
    legalBasis: '',
    targetGroup: '',
    output: '',
    channels: [],
    fee: 0,
    maxDays: 3,
    stepsCount: 2,
    annualVolume: 0,
    proactivity: '',
    lifeEventId: null,
    category: '',
    cofogCode: '',
    cofogLabel: '',
    mainActivity: '',
    sdgCode: '',
    processingTime: '',
    outputType: '',
    outputRefType: '',
    assuranceLevel: '',
    fulfilment: '',
    hasDiscretion: false,
    hasAssessment: false,
    slaHours: 0,
    tacitApproval: false,
    online: false,
    ...over,
  };
}

function build(over: Partial<RegistryRepository> = {}) {
  const repo: RegistryRepository = {
    listServices: vi.fn(() => Promise.resolve([service()])),
    getService: vi.fn(() => Promise.resolve(service())),
    createService: vi.fn((_c: unknown, i: NewRegistryService) =>
      Promise.resolve(service({ ...i, evidences: [] })),
    ),
    updateService: vi.fn((_c: unknown, _id: string, i: NewRegistryService) =>
      Promise.resolve(service({ ...i, evidences: [] })),
    ),
    setServiceStatus: vi.fn(() => Promise.resolve()),
    deleteService: vi.fn(() => Promise.resolve()),
    setServiceEvidences: vi.fn(() => Promise.resolve()),
    countCitizenDocuments: vi.fn(() => Promise.resolve(0)),
    listVersions: vi.fn(() => Promise.resolve([])),
    baselineVersion: vi.fn(() => Promise.resolve(null)),
    publishVersion: vi.fn((_c: unknown, v: NewRegistryVersion) =>
      Promise.resolve({ ...v, id: 'v1', version: 1, publishedAt: new Date() }),
    ),
    projectToGov: vi.fn(() => Promise.resolve()),
    withdrawFromGov: vi.fn(() => Promise.resolve()),
    listEvidences: vi.fn(() => Promise.resolve([])),
    createEvidence: vi.fn(() => Promise.reject(new Error('not stubbed'))),
    updateEvidence: vi.fn(() => Promise.reject(new Error('not stubbed'))),
    deleteEvidence: vi.fn(() => Promise.resolve()),
    listLifeEvents: vi.fn(() => Promise.resolve([])),
    createLifeEvent: vi.fn(() => Promise.reject(new Error('not stubbed'))),
    deleteLifeEvent: vi.fn(() => Promise.resolve()),
    onceOnlyViolations: vi.fn(() => Promise.resolve([])),
    overview: vi.fn(() => Promise.reject(new Error('not stubbed'))),
    ...over,
  };
  return { uc: newRegistryUsecase(repo), repo };
}

describe('автоматжуулалтын эрх зүйн шалгуур (VwVfG §35a загвар)', () => {
  it('үнэлэх эрхтэй үйлчилгээг auto болгохыг ТАТГАЛЗАНА', async () => {
    const { uc, repo } = build();
    await expect(
      uc.createService(background(), input({ fulfilment: 'auto', hasDiscretion: true })),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
    expect(repo.createService).not.toHaveBeenCalled();
  });

  it('үнэлгээний зайтай үйлчилгээг ч татгалзана', async () => {
    const { uc } = build();
    await expect(
      uc.createService(background(), input({ fulfilment: 'auto', hasAssessment: true })),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
  });

  it('аль нь ч байхгүй бол auto зөвшөөрөгдөж, SLA тэглэгдэнэ', async () => {
    const createService = vi.fn((_c: unknown, i: NewRegistryService) =>
      Promise.resolve(service({ ...i, evidences: [] })),
    );
    const { uc } = build({ createService });
    await uc.createService(background(), input({ fulfilment: 'auto', slaHours: 48 }));
    // Шууд олгогддог үйлчилгээнд хүлээх хугацаа утгагүй.
    expect(createService.mock.calls[0]?.[1].slaHours).toBe(0);
  });
});

describe('оролтын шалгалт', () => {
  it('код нь A-Z0-9_- хэлбэртэй байх ёстой', async () => {
    const { uc } = build();
    await expect(uc.createService(background(), input({ code: 'bad code!' }))).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.BadRequest),
    );
  });

  it('танихгүй суваг татгалзагдана', async () => {
    const { uc } = build();
    await expect(
      uc.createService(background(), input({ channels: ['telepathy'] })),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
  });

  it('суваг давхардвал нэгтгэгдэж, эрэмбэ хадгалагдана', async () => {
    const createService = vi.fn((_c: unknown, i: NewRegistryService) =>
      Promise.resolve(service({ ...i, evidences: [] })),
    );
    const { uc } = build({ createService });
    await uc.createService(background(), input({ channels: ['Office', 'office', 'mobile'] }));
    expect(createService.mock.calls[0]?.[1].channels).toEqual(['office', 'mobile']);
  });

  it('эрх бүхий байгууллага заавал (CPSV-AP цөм талбар)', async () => {
    const { uc } = build();
    await expect(uc.createService(background(), input({ authority: '  ' }))).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.BadRequest),
    );
  });

  it('шинэ паспорт ҮРГЭЛЖ ноорогоор эхэлнэ', async () => {
    const createService = vi.fn((_c: unknown, i: NewRegistryService) =>
      Promise.resolve(service({ ...i, evidences: [] })),
    );
    const { uc } = build({ createService });
    await uc.createService(background(), input());
    expect(createService.mock.calls[0]?.[1].status).toBe('draft');
  });
});

describe('once-only шалгалт', () => {
  it('ХУР-д байгаа баримтыг иргэнээс шаардаж байвал зөрчил', async () => {
    const { uc } = build({
      getService: vi.fn(() =>
        Promise.resolve(
          service({
            evidences: [
              evidence({ fromCitizen: true, inKhur: true }),
              evidence({ evidenceId: 'e2', fromCitizen: true, inKhur: false }),
              // Байгууллага өөрөө татдаг — тоологдохгүй.
              evidence({ evidenceId: 'e3', fromCitizen: false, inKhur: true }),
            ],
          }),
        ),
      ),
    });

    const report = await uc.checkOnceOnly(background(), serviceId);

    expect(report.citizenDocuments).toBe(2);
    expect(report.violations).toHaveLength(1);
    expect(report.compliant).toBe(false);
  });

  it('зөрчилтэй үед once_only гэж зарлах боломжгүй (online руу буурна)', async () => {
    const { uc } = build({
      getService: vi.fn(() =>
        Promise.resolve(
          service({
            proactivity: 'once_only',
            evidences: [evidence({ fromCitizen: true, inKhur: true })],
          }),
        ),
      ),
    });
    const report = await uc.checkOnceOnly(background(), serviceId);
    expect(report.eligibleProactivity).toBe('online');
  });

  it('зөрчилгүй бол зарласан шат хэвээр', async () => {
    const { uc } = build({
      getService: vi.fn(() => Promise.resolve(service({ proactivity: 'proactive' }))),
    });
    const report = await uc.checkOnceOnly(background(), serviceId);
    expect(report.eligibleProactivity).toBe('proactive');
    expect(report.compliant).toBe(true);
  });
});

describe('нийтлэлт', () => {
  it('зөрчилтэй байхад зарласан шатаар нийтлэхийг ТАТГАЛЗАНА (409)', async () => {
    const { uc, repo } = build({
      getService: vi.fn(() =>
        Promise.resolve(
          service({
            proactivity: 'once_only',
            evidences: [evidence({ fromCitizen: true, inKhur: true })],
          }),
        ),
      ),
    });
    await expect(
      uc.publish(background(), serviceId, { changeNote: '', publishedBy: null }),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.Conflict));
    expect(repo.publishVersion).not.toHaveBeenCalled();
  });

  it('эхний нийтлэлт нь baseline болно (delta бүгд 0)', async () => {
    const publishVersion = vi.fn((_c: unknown, v: NewRegistryVersion) =>
      Promise.resolve({ ...v, id: 'v1', version: 1, publishedAt: new Date() }),
    );
    const { uc } = build({ publishVersion, baselineVersion: vi.fn(() => Promise.resolve(null)) });

    await uc.publish(background(), serviceId, { changeNote: 'анхны', publishedBy: 'u1' });

    const v = publishVersion.mock.calls[0]![1];
    expect(v.isBaseline).toBe(true);
    expect([v.deltaSteps, v.deltaDocuments, v.deltaDays, v.deltaFee]).toEqual([0, 0, 0, 0]);
  });

  it('дараагийн нийтлэлт baseline-тай харьцуулагдана (сөрөг = сайжралт)', async () => {
    const publishVersion = vi.fn((_c: unknown, v: NewRegistryVersion) =>
      Promise.resolve({ ...v, id: 'v2', version: 2, publishedAt: new Date() }),
    );
    const { uc } = build({
      publishVersion,
      countCitizenDocuments: vi.fn(() => Promise.resolve(1)),
      baselineVersion: vi.fn(() =>
        Promise.resolve({
          id: 'v1',
          serviceId,
          version: 1,
          snapshot: null,
          changeNote: '',
          isBaseline: true,
          stepsCount: 5,
          documentsCount: 4,
          maxDays: 10,
          fee: 5000,
          deltaSteps: 0,
          deltaDocuments: 0,
          deltaDays: 0,
          deltaFee: 0,
          publishedAt: new Date(),
          publishedBy: null,
        }),
      ),
    });

    await uc.publish(background(), serviceId, { changeNote: '', publishedBy: null });

    const v = publishVersion.mock.calls[0]![1];
    expect(v.isBaseline).toBe(false);
    // 2−5 = −3 алхам, 1−4 = −3 баримт, 3−10 = −7 хоног, 0−5000 = −5000₮.
    expect([v.deltaSteps, v.deltaDocuments, v.deltaDays, v.deltaFee]).toEqual([-3, -3, -7, -5000]);
  });

  it('нийтэлсний дараа иргэний каталог руу проекц хийгдэнэ', async () => {
    const { uc, repo } = build();
    await uc.publish(background(), serviceId, { changeNote: '', publishedBy: null });
    expect(repo.projectToGov).toHaveBeenCalledWith(expect.anything(), serviceId);
  });

  it('архивласан паспортыг нийтлэхгүй', async () => {
    const { uc } = build({
      getService: vi.fn(() => Promise.resolve(service({ status: 'archived' }))),
    });
    await expect(
      uc.publish(background(), serviceId, { changeNote: '', publishedBy: null }),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.Conflict));
  });
});

describe('амьдралын мөчлөг', () => {
  it('нийтлэгдсэн паспорт УСТГАГДАХГҮЙ (архивлана)', async () => {
    const { uc, repo } = build({
      getService: vi.fn(() => Promise.resolve(service({ status: 'published' }))),
    });
    await expect(uc.deleteService(background(), serviceId)).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.Conflict),
    );
    expect(repo.deleteService).not.toHaveBeenCalled();
  });

  it('архивлахад иргэний каталогоос ч гарна', async () => {
    const { uc, repo } = build();
    await uc.archiveService(background(), serviceId);
    expect(repo.setServiceStatus).toHaveBeenCalledWith(expect.anything(), serviceId, 'archived');
    expect(repo.withdrawFromGov).toHaveBeenCalledWith(expect.anything(), serviceId);
  });

  it('архивласан паспорт ЗАСАГДАХГҮЙ', async () => {
    const { uc, repo } = build({
      getService: vi.fn(() => Promise.resolve(service({ status: 'archived' }))),
    });
    await expect(uc.updateService(background(), serviceId, input())).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.Conflict),
    );
    expect(repo.updateService).not.toHaveBeenCalled();
  });
});

describe('нийтийн каталог', () => {
  it('status query-гээр ноорог гуйхыг ҮЛ ТООМСОРЛОНО', async () => {
    const listServices = vi.fn((_c: unknown, _f: RegistryFilter) => Promise.resolve([]));
    const { uc } = build({ listServices });

    await uc.publicCatalog(background(), {
      status: 'draft',
      authority: '',
      lifeEventId: '',
      proactivity: '',
      query: '',
    });

    const f = listServices.mock.calls[0]![1];
    expect(f.publishedOnly).toBe(true);
    expect(f.status).toBe('');
  });

  it('нийтлэгдээгүй паспорт иргэнд БАЙХГҮЙ мэт харагдана', async () => {
    const { uc } = build({
      getService: vi.fn(() => Promise.resolve(service({ status: 'draft' }))),
    });
    await expect(uc.publicService(background(), serviceId)).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.BadRequest),
    );
  });
});

describe('нотолгооны холбоос', () => {
  it('давхардсан нотолгоо 400', async () => {
    const { uc, repo } = build();
    await expect(
      uc.setEvidences(background(), serviceId, [
        { evidenceId: 'e1', required: true, fromCitizen: true, note: '' },
        { evidenceId: 'e1', required: false, fromCitizen: false, note: '' },
      ]),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
    expect(repo.setServiceEvidences).not.toHaveBeenCalled();
  });

  it('нотолгооны id хоосон бол 400', async () => {
    const { uc } = build();
    await expect(
      uc.setEvidences(background(), serviceId, [
        { evidenceId: '  ', required: true, fromCitizen: true, note: '' },
      ]),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
  });
});

describe('нотолгооны каталог', () => {
  it('ХУР-д байгаа гэж тэмдэглэвэл лавлагааны код ЗААВАЛ', async () => {
    const { uc } = build();
    await expect(
      uc.createEvidence(background(), {
        code: 'ID_CARD',
        name: 'Иргэний үнэмлэх',
        description: '',
        holderAgency: '',
        sourceSystem: '',
        inKhur: true,
        khurServiceCode: '',
      }),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
  });
});
