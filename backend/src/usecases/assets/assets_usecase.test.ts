// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// assets usecase-ийн unit тестүүд. Гол зорилго: байгууллагын тамганы ЭРХИЙН
// хаалт — унших нь төлөөлөгч, бичих нь ADMIN шаардана; eID-гүй хэрэглэгч
// байгууллага төлөөлж чадахгүй; эрхийн шийдвэр eID (улсын бүртгэл)-д үлдэнэ.

import { describe, expect, it, vi } from 'vitest';

import { ErrorType, is } from '../../apperror/index.js';
import type { OrgStampRepository } from '../../datasources/repositories/interface/orgstamp.js';
import type { UserRepository } from '../../datasources/repositories/interface/users.js';
import { emptyUser, type User } from '../../domain/users.js';
import { background } from '../../pkg/ctx/ctx.js';
import type { EidClient } from '../../pkg/eid/eid.js';
import { ErrNotRepresentative, type Signer } from '../../pkg/eid/eid_org.js';
import type { UsersUsecase } from '../users/users_usecase.js';
import { newAssetsUsecase } from './assets_usecase.js';

const userId = '11111111-1111-1111-1111-111111111111';
const orgRegister = '1234567';

function user(over: Partial<User> = {}): User {
  return { ...emptyUser(), id: userId, civilId: 'аа00112233', ...over };
}

function signer(over: Partial<Signer> = {}): Signer {
  return {
    personEtsi: 'PNOMN-АА00112233',
    regNo: 'АА00112233',
    name: 'Дорж',
    nameEn: 'Dorj',
    role: 'Захирал',
    rightType: 'MANAGER',
    status: 'ACTIVE',
    source: 'REGISTRY',
    self: false,
    ...over,
  };
}

interface Stubs {
  signers?: Signer[] | (() => Promise<Signer[]>);
  currentUser?: User;
  stampUrl?: string;
}

function build(stubs: Stubs = {}) {
  const stampRepo: OrgStampRepository = {
    get: vi.fn(() => Promise.resolve(stubs.stampUrl ?? '')),
    upsert: vi.fn(() => Promise.resolve()),
    deleteStamp: vi.fn(() => Promise.resolve()),
  };
  const userRepo = {
    getSignature: vi.fn(() => Promise.resolve('https://drive.example/sig.png')),
    setSignature: vi.fn(() => Promise.resolve()),
    setLatinName: vi.fn(() => Promise.resolve()),
  } as unknown as UserRepository;
  const users = {
    getById: vi.fn(() => Promise.resolve({ user: stubs.currentUser ?? user() })),
  } as unknown as UsersUsecase;
  const orgSigners = vi.fn(() =>
    typeof stubs.signers === 'function' ? stubs.signers() : Promise.resolve(stubs.signers ?? []),
  );
  const eid = {
    orgSigners,
    updateOrgNameLatin: vi.fn(() => Promise.resolve([])),
  } as unknown as EidClient;
  return {
    uc: newAssetsUsecase(users, userRepo, stampRepo, eid),
    stampRepo,
    userRepo,
    eid,
    orgSigners,
  };
}

describe('гарын үсэг (хувь хүн)', () => {
  it('URL-ийг уншиж буцаана', async () => {
    const { uc } = build();
    await expect(uc.getSignature(background(), userId)).resolves.toBe(
      'https://drive.example/sig.png',
    );
  });

  it('хоосон URL хадгалахыг татгалзана (400)', async () => {
    const { uc, userRepo } = build();
    await expect(uc.setSignature(background(), userId, '   ')).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.BadRequest),
    );
    expect(userRepo.setSignature).not.toHaveBeenCalled();
  });

  it('хадгалахын өмнө хоосон зайг зална', async () => {
    const { uc, userRepo } = build();
    await uc.setSignature(background(), userId, '  https://drive.example/a.png  ');
    expect(userRepo.setSignature).toHaveBeenCalledWith(
      expect.anything(),
      userId,
      'https://drive.example/a.png',
    );
  });

  it('устгах нь хоосон мөр бичнэ (багана NULL болно)', async () => {
    const { uc, userRepo } = build();
    await uc.deleteSignature(background(), userId);
    expect(userRepo.setSignature).toHaveBeenCalledWith(expect.anything(), userId, '');
  });
});

describe('байгууллагын тамга — унших эрх', () => {
  it('төлөөлөгч мөн бол тамгыг буцаана', async () => {
    const { uc } = build({
      signers: [signer({ self: true })],
      stampUrl: 'https://drive.example/stamp.png',
    });
    await expect(uc.getStamp(background(), userId, orgRegister)).resolves.toBe(
      'https://drive.example/stamp.png',
    );
  });

  it('төлөөлөгч БИШ бол 403 — DB-д ч хүрэхгүй (IDOR хаалт)', async () => {
    const { uc, stampRepo } = build({ signers: [signer({ self: false })] });
    await expect(uc.getStamp(background(), userId, orgRegister)).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.Forbidden),
    );
    expect(stampRepo.get).not.toHaveBeenCalled();
  });

  it('eID нь 403 буцаавал (төлөөлөгч биш) 403 болно', async () => {
    const { uc } = build({ signers: () => Promise.reject(new ErrNotRepresentative()) });
    await expect(uc.getStamp(background(), userId, orgRegister)).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.Forbidden),
    );
  });

  it('eID-ийн сүлжээний алдаа нь ДОТООД алдаа (403 биш)', async () => {
    const { uc } = build({ signers: () => Promise.reject(new Error('eid: http: timeout')) });
    await expect(uc.getStamp(background(), userId, orgRegister)).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.Internal),
    );
  });
});

describe('байгууллагын тамга — бичих эрх (зөвхөн ADMIN)', () => {
  it('ADMIN төлөөлөгч тамга тавьж чадна', async () => {
    const { uc, stampRepo } = build({ signers: [signer({ self: true, rightType: 'ADMIN' })] });
    await uc.setStamp(background(), userId, ` ${orgRegister} `, ' https://drive.example/s.png ');
    expect(stampRepo.upsert).toHaveBeenCalledWith(
      expect.anything(),
      orgRegister,
      'https://drive.example/s.png',
      userId,
    );
  });

  it('MANAGER эрхтэй төлөөлөгч тамга ТАВЬЖ ЧАДАХГҮЙ (403)', async () => {
    const { uc, stampRepo } = build({ signers: [signer({ self: true, rightType: 'MANAGER' })] });
    await expect(
      uc.setStamp(background(), userId, orgRegister, 'https://drive.example/s.png'),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.Forbidden));
    expect(stampRepo.upsert).not.toHaveBeenCalled();
  });

  it('ӨӨР хүний ADMIN эрх өөрийг чинь ADMIN болгохгүй (self=false)', async () => {
    const { uc } = build({
      signers: [signer({ self: false, rightType: 'ADMIN' }), signer({ self: true })],
    });
    await expect(
      uc.setStamp(background(), userId, orgRegister, 'https://drive.example/s.png'),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.Forbidden));
  });

  it('хоосон URL нь эрх шалгахаас ӨМНӨ 400 болно', async () => {
    const { uc, orgSigners } = build({ signers: [signer({ self: true, rightType: 'ADMIN' })] });
    await expect(uc.setStamp(background(), userId, orgRegister, ' ')).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.BadRequest),
    );
    expect(orgSigners).not.toHaveBeenCalled();
  });

  it('устгах нь мөн ADMIN шаардана', async () => {
    const { uc, stampRepo } = build({ signers: [signer({ self: true, rightType: 'MANAGER' })] });
    await expect(uc.deleteStamp(background(), userId, orgRegister)).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.Forbidden),
    );
    expect(stampRepo.deleteStamp).not.toHaveBeenCalled();
  });
});

describe('eID-ээр нэвтрээгүй хэрэглэгч', () => {
  it('civil_id-гүй бол байгууллагын үйлдэл 403 — eID рүү ч хүрэхгүй', async () => {
    const { uc, orgSigners } = build({ currentUser: user({ civilId: '' }) });
    await expect(uc.getStamp(background(), userId, orgRegister)).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.Forbidden),
    );
    expect(orgSigners).not.toHaveBeenCalled();
  });
});

describe('латин нэр', () => {
  it('хэрэглэгчийн латин нэрийг repository руу дамжуулна', async () => {
    const { uc, userRepo } = build();
    await uc.setLatinName(background(), userId, 'Dorj', 'Bat');
    expect(userRepo.setLatinName).toHaveBeenCalledWith(expect.anything(), userId, 'Dorj', 'Bat');
  });

  it('байгууллагын латин нэрийг ETSI (PNOMN-<CIVIL>) томоор угсарч илгээнэ', async () => {
    const { uc, eid } = build();
    await uc.setOrgNameLatin(background(), userId, ` ${orgRegister} `, 'Gerege Systems LLC');
    expect(eid.updateOrgNameLatin).toHaveBeenCalledWith(
      orgRegister,
      'PNOMN-АА00112233',
      'Gerege Systems LLC',
      undefined,
    );
  });

  it('eID 403 буцаавал ADMIN эрхгүй гэсэн 403 болно', async () => {
    const { uc } = build();
    const failing = build();
    (failing.eid.updateOrgNameLatin as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ErrNotRepresentative(),
    );
    await expect(
      failing.uc.setOrgNameLatin(background(), userId, orgRegister, 'X'),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.Forbidden));
    // Хяналтын хувилбар: анхны uc нь амжилттай хэвээр.
    await expect(
      uc.setOrgNameLatin(background(), userId, orgRegister, 'X'),
    ).resolves.toBeUndefined();
  });
});
