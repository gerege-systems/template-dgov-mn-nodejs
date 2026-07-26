// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// eID профайлын (төлөөлдөг байгууллага · зурагчид · PKI самбар) unit тестүүд.
//
// Гол зорилго:
//   • eID-ээр нэвтрээгүй хэрэглэгч профайлыг ЭВДЭХГҮЙ (хоосон, алдаагүй)
//   • байгууллага холбоход XYP-ийн эрх бүхий этгээдийн жагсаалт ЗӨВ дараалалтай
//     (захирал эхэнд — eidmongolia эхний таарсанаар role тодорхойлдог)
//   • IdP-ийн 403/404 нь ЦЭВЭР 4xx болж буулгагдана (5xx биш)
//   • SSO proxy тохируулагдсан бол PKI ЗӨВХӨН proxy-гоор явна

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorType, is } from '../../apperror/index.js';
import { emptyUser, type User } from '../../domain/users.js';
import { background, type Ctx } from '../../pkg/ctx/ctx.js';
import type { EidClient } from '../../pkg/eid/eid.js';
import { ErrNotRepresentative, ErrSignerNotEnrolled } from '../../pkg/eid/eid_org.js';
import { ErrPKINotPermitted } from '../../pkg/eid/eid_pki.js';
import { newJWTServiceWithRefresh, type JWTService } from '../../pkg/jwt/jwt.js';
import { ErrSSOTokenExpired, type SSOEidProxy } from '../../pkg/ssoeidproxy/ssoeidproxy.js';
import { ErrXypNotFound, type Lookuper, type Organization } from '../../pkg/xyp/xyp.js';
import type { AddRepresentationInput, Representation } from '../../pkg/eid/eid_org.js';
import type { RedisCache } from '../../datasources/caches/redis.js';
import type { UsersUsecase } from '../users/users_usecase.js';
import { newAuthUsecase } from './auth_impl.js';
import { ErrSSOTokenNotFound, type SSOTokenService } from './auth_usecase.js';

const userId = '11111111-1111-1111-1111-111111111111';
const orgRegister = '1234567';

function org(over: Partial<Organization> = {}): Organization {
  return {
    reg_no: orgRegister,
    name: 'Гэрэгэ Системс ХХК',
    type: 'ХХК',
    capital: '',
    ceo: 'Дорж',
    ceo_reg_no: 'АА00112233',
    ceo_position: '',
    phone: '',
    address: '',
    industry: [],
    founders: [{ name: 'Бат', reg_no: 'УY99887766', type: 'Иргэн', share_percent: '50' }],
    stake_holders: [{ name: 'Сүх', reg_no: 'ЖЖ11223344', position: '' }],
    ...over,
  };
}

let jwtService: JWTService;
let ctx: Ctx;

beforeEach(() => {
  jwtService = newJWTServiceWithRefresh('secret-secret-secret-secret', 'test', 2, 7);
  ctx = background();
});

interface Setup {
  civilId?: string;
  eid?: Partial<EidClient>;
  xyp?: Lookuper | null;
  ssoEidProxy?: SSOEidProxy | null;
  ssoTokens?: SSOTokenService | null;
}

function build(setup: Setup = {}) {
  const user: User = { ...emptyUser(), id: userId, civilId: setup.civilId ?? 'аа00112233' };
  const users = {
    getById: vi.fn(() => Promise.resolve({ user })),
  } as unknown as UsersUsecase;
  const no = () => Promise.reject(new Error('not stubbed'));
  const eid = {
    qrInitiate: vi.fn(no),
    initiate: vi.fn(no),
    session: vi.fn(no),
    representations: vi.fn(() => Promise.resolve([])),
    addRepresentation: vi.fn(() => Promise.resolve([])),
    removeRepresentation: vi.fn(() => Promise.resolve([])),
    orgSigners: vi.fn(() => Promise.resolve([])),
    addSigner: vi.fn(() => Promise.resolve({ signers: [], pendingConfirmation: null })),
    removeSigner: vi.fn(() => Promise.resolve([])),
    resendSigner: vi.fn(() => Promise.resolve({ signers: [], pendingConfirmation: null })),
    updateOrgNameLatin: vi.fn(no),
    personSummary: vi.fn(no),
    personCertificates: vi.fn(no),
    personDevices: vi.fn(no),
    personActivity: vi.fn(no),
    ...setup.eid,
  };
  const redis = {} as unknown as RedisCache;
  const uc = newAuthUsecase(users, jwtService, eid, setup.xyp ?? null, null, redis, {
    eidDisplayText: 'test',
    ssoEidProxy: setup.ssoEidProxy ?? null,
    ssoTokens: setup.ssoTokens ?? null,
  });
  return { uc, eid };
}

describe('eID-ээр нэвтрээгүй хэрэглэгч', () => {
  it('төлөөлдөг байгууллага нь ХООСОН жагсаалт (алдаа биш)', async () => {
    const { uc, eid } = build({ civilId: '' });
    await expect(uc.eidRepresentations(ctx, userId)).resolves.toEqual([]);
    expect(eid.representations).not.toHaveBeenCalled();
  });

  it('PKI самбарын дуудлагууд null буцна (профайл эвдрэхгүй)', async () => {
    const { uc } = build({ civilId: '' });
    await expect(uc.eidSummary(ctx, userId)).resolves.toBeNull();
    await expect(uc.eidCertificates(ctx, userId)).resolves.toBeNull();
    await expect(uc.eidDevices(ctx, userId)).resolves.toBeNull();
    await expect(uc.eidActivity(ctx, userId, 20, 0)).resolves.toBeNull();
  });

  it('байгууллага ХОЛБОХ нь 403 (эрх нь eID-д холбогддог)', async () => {
    const { uc } = build({ civilId: '', xyp: { lookup: vi.fn(() => Promise.resolve(org())) } });
    await expect(uc.registerEidOrganization(ctx, userId, orgRegister)).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.Forbidden),
    );
  });

  it('зурагч жагсаах нь 403', async () => {
    const { uc } = build({ civilId: '' });
    await expect(uc.listEidOrgSigners(ctx, userId, orgRegister)).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.Forbidden),
    );
  });
});

describe('төлөөлдөг байгууллагууд', () => {
  it('ETSI-г civil_id-аас ТОМООР угсарна', async () => {
    const { uc, eid } = build({ civilId: 'аа00112233' });
    await uc.eidRepresentations(ctx, userId);
    expect(eid.representations).toHaveBeenCalledWith('PNOMN-АА00112233', undefined);
  });

  it('салгах нь 403-д "зөвхөн ADMIN" гэсэн 403 болно', async () => {
    const { uc } = build({
      eid: { removeRepresentation: vi.fn(() => Promise.reject(new ErrNotRepresentative())) },
    });
    await expect(uc.unlinkEidOrganization(ctx, userId, orgRegister)).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.Forbidden),
    );
  });

  it('салгахад регистр хоосон бол 400', async () => {
    const { uc } = build();
    await expect(uc.unlinkEidOrganization(ctx, userId, '  ')).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.BadRequest),
    );
  });
});

describe('байгууллага холбох (XYP → eID)', () => {
  it('эрх бүхий этгээдийг ЗАХИРАЛ эхэнд байхаар угсарна', async () => {
    const addRepresentation = vi.fn(
      (_etsi: string, _input: AddRepresentationInput): Promise<Representation[]> =>
        Promise.resolve([]),
    );
    const { uc } = build({
      xyp: { lookup: vi.fn(() => Promise.resolve(org())) },
      eid: { addRepresentation },
    });

    await uc.registerEidOrganization(ctx, userId, orgRegister);

    const input = addRepresentation.mock.calls[0]?.[1];
    expect(input?.affiliates).toEqual([
      // ceo_position хоосон тул өгөгдмөл "Гүйцэтгэх захирал".
      { regNo: 'АА00112233', role: 'Гүйцэтгэх захирал', kind: 'CEO' },
      { regNo: 'УY99887766', role: 'Үүсгэн байгуулагч', kind: 'FOUNDER' },
      // position хоосон тул өгөгдмөл "Хувь эзэмшигч".
      { regNo: 'ЖЖ11223344', role: 'Хувь эзэмшигч', kind: 'STAKEHOLDER' },
    ]);
  });

  it('хоосон РД-тэй этгээдийг алгасна', async () => {
    const addRepresentation = vi.fn(
      (_etsi: string, _input: AddRepresentationInput): Promise<Representation[]> =>
        Promise.resolve([]),
    );
    const { uc } = build({
      xyp: {
        lookup: vi.fn(() =>
          Promise.resolve(
            org({
              ceo_reg_no: '  ',
              founders: [{ name: 'X', reg_no: '', type: 'Иргэн', share_percent: '' }],
              stake_holders: [],
            }),
          ),
        ),
      },
      eid: { addRepresentation },
    });

    await uc.registerEidOrganization(ctx, userId, orgRegister);

    expect(addRepresentation.mock.calls[0]?.[1].affiliates).toEqual([]);
  });

  it('XYP-д олдоогүй бол 404', async () => {
    const { uc } = build({ xyp: { lookup: vi.fn(() => Promise.reject(new ErrXypNotFound())) } });
    await expect(uc.registerEidOrganization(ctx, userId, orgRegister)).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.NotFound),
    );
  });

  it('XYP тохируулаагүй бол 500 (гэхдээ boot зогсохгүй)', async () => {
    const { uc } = build({ xyp: null });
    await expect(uc.registerEidOrganization(ctx, userId, orgRegister)).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.Internal),
    );
  });

  it('регистр хоосон бол XYP руу ч хүрэхгүй (400)', async () => {
    const lookup = vi.fn(() => Promise.resolve(org()));
    const { uc } = build({ xyp: { lookup } });
    await expect(uc.registerEidOrganization(ctx, userId, ' ')).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.BadRequest),
    );
    expect(lookup).not.toHaveBeenCalled();
  });

  it('eID 403 бол "төлөөлөх эрхгүй" гэсэн 403', async () => {
    const { uc } = build({
      xyp: { lookup: vi.fn(() => Promise.resolve(org())) },
      eid: { addRepresentation: vi.fn(() => Promise.reject(new ErrNotRepresentative())) },
    });
    await expect(uc.registerEidOrganization(ctx, userId, orgRegister)).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.Forbidden),
    );
  });
});

describe('гарын үсэг зурагчид', () => {
  it('нэмэхэд РД хоосон бол 400 — eID рүү хүрэхгүй', async () => {
    const addSigner = vi.fn(() => Promise.resolve({ signers: [], pendingConfirmation: null }));
    const { uc } = build({ eid: { addSigner } });
    await expect(uc.addEidOrgSigner(ctx, userId, orgRegister, ' ', '')).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.BadRequest),
    );
    expect(addSigner).not.toHaveBeenCalled();
  });

  it('eID-д бүртгэлгүй иргэн нэмэхэд 404', async () => {
    const { uc } = build({
      eid: { addSigner: vi.fn(() => Promise.reject(new ErrSignerNotEnrolled())) },
    });
    await expect(uc.addEidOrgSigner(ctx, userId, orgRegister, 'УY99887766', '')).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.NotFound),
    );
  });

  it('төлөөлөгч биш бол 403', async () => {
    const { uc } = build({
      eid: { orgSigners: vi.fn(() => Promise.reject(new ErrNotRepresentative())) },
    });
    await expect(uc.listEidOrgSigners(ctx, userId, orgRegister)).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.Forbidden),
    );
  });

  it('дахин илгээхэд РД хоосон бол 400', async () => {
    const { uc } = build();
    await expect(uc.resendEidOrgSigner(ctx, userId, orgRegister, '')).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.BadRequest),
    );
  });
});

describe('PKI самбар', () => {
  it('PKI_READ эрхгүй бол 403 (frontend "эрх хүлээгдэж байна" харуулна)', async () => {
    const { uc } = build({
      eid: { personSummary: vi.fn(() => Promise.reject(new ErrPKINotPermitted())) },
    });
    await expect(uc.eidSummary(ctx, userId)).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.Forbidden),
    );
  });

  it('SSO proxy тохируулагдсан бол ЗӨВХӨН proxy-гоор явна (шууд eID рүү хүрэхгүй)', async () => {
    const summary = vi.fn(() =>
      Promise.resolve({
        givenName: 'Дорж',
        surname: 'Бат',
        certificates: { valid: 1, revoked: 0, expired: 0, suspended: 0, total: 1 },
        activity: { authentication: 3, signature: 1 },
        devicesActive: 1,
        devicesTotal: 2,
        representationCount: 1,
      }),
    );
    const personSummary = vi.fn(() => Promise.reject(new Error('шууд зам руу орох ёсгүй')));
    const { uc } = build({
      eid: { personSummary },
      ssoEidProxy: { summary } as unknown as SSOEidProxy,
      ssoTokens: { validAccessToken: vi.fn(() => Promise.resolve('sso-token')) },
    });

    const out = await uc.eidSummary(ctx, userId);

    expect(out?.givenName).toBe('Дорж');
    expect(summary).toHaveBeenCalledWith('sso-token', undefined);
    expect(personSummary).not.toHaveBeenCalled();
  });

  it('proxy зөвхөн ТОКЕН үйлчилгээтэй хамт идэвхжинэ (токенгүй бол шууд зам)', async () => {
    const personSummary = vi.fn(() =>
      Promise.resolve({
        givenName: 'Шууд',
        surname: '',
        certificates: { valid: 0, revoked: 0, expired: 0, suspended: 0, total: 0 },
        activity: { authentication: 0, signature: 0 },
        devicesActive: 0,
        devicesTotal: 0,
        representationCount: 0,
      }),
    );
    const { uc } = build({
      eid: { personSummary },
      ssoEidProxy: { summary: vi.fn() } as unknown as SSOEidProxy,
      ssoTokens: null,
    });

    const out = await uc.eidSummary(ctx, userId);

    expect(out?.givenName).toBe('Шууд');
    expect(personSummary).toHaveBeenCalled();
  });

  it('SSO токен байхгүй бол 401 (дахин нэвтрэх) — 500 биш', async () => {
    const { uc } = build({
      ssoEidProxy: { devices: vi.fn() } as unknown as SSOEidProxy,
      ssoTokens: { validAccessToken: vi.fn(() => Promise.reject(new ErrSSOTokenNotFound())) },
    });
    await expect(uc.eidDevices(ctx, userId)).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.Unauthorized),
    );
  });

  it('proxy 401 буцаавал 401 болно', async () => {
    const { uc } = build({
      ssoEidProxy: {
        activity: vi.fn(() => Promise.reject(new ErrSSOTokenExpired())),
      } as unknown as SSOEidProxy,
      ssoTokens: { validAccessToken: vi.fn(() => Promise.resolve('t')) },
    });
    await expect(uc.eidActivity(ctx, userId, 20, 0)).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.Unauthorized),
    );
  });

  it('activity нь limit/offset-ийг шууд зам руу дамжуулна', async () => {
    const personActivity = vi.fn(() =>
      Promise.resolve({ counts: { authentication: 0, signature: 0 }, sessions: [], total: 0 }),
    );
    const { uc } = build({ eid: { personActivity } });
    await uc.eidActivity(ctx, userId, 5, 10);
    expect(personActivity).toHaveBeenCalledWith('PNOMN-АА00112233', 5, 10, undefined);
  });
});
