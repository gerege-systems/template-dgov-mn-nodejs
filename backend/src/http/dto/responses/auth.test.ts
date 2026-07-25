// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Хариуны mapper-уудын unit тест. ОНЦГОЙ АНХААРАЛ: eidPollResponse нь COMPLETE
// БИШ төлөвт токен/хэрэглэгчийн мэдээллийг бөглөх ЁСГҮЙ — RUNNING хариунд токен
// алдагдвал session ID мэдсэн хэн ч session-ийг булаах боломжтой болно.

import { describe, expect, it } from 'vitest';

import { emptyUser, RoleUser, type User } from '../../../domain/users.js';
import type { EIDPollResponse as UcPoll } from '../../../usecases/auth/auth_usecase.js';
import { eidPollResponse, googleLoginResponse, loginResponse } from './auth.js';

function sampleUser(over: Partial<User> = {}): User {
  return {
    ...emptyUser(),
    id: 'u1',
    username: 'bat',
    firstName: 'Бат',
    lastName: 'Дорж',
    email: 'bat@example.com',
    roleId: RoleUser,
    ...over,
  };
}

function poll(over: Partial<UcPoll>): UcPoll {
  return {
    state: 'RUNNING',
    user: null,
    mfaRequired: false,
    mfaToken: '',
    accessToken: '',
    refreshToken: '',
    ...over,
  };
}

describe('eidPollResponse — токен зөвхөн COMPLETE үед', () => {
  it('RUNNING нь хэрэглэгч ч, токен ч зөөхгүй', () => {
    const r = eidPollResponse(
      poll({ state: 'RUNNING', user: sampleUser(), accessToken: 'acc', refreshToken: 'ref' }),
    );
    expect(r.state).toBe('RUNNING');
    expect(r.token).toBeUndefined();
    expect(r.refresh_token).toBeUndefined();
    expect(r.id).toBeUndefined();
  });

  for (const state of ['EXPIRED', 'REFUSED']) {
    it(`${state} нь токен зөөхгүй`, () => {
      const r = eidPollResponse(
        poll({ state, user: sampleUser(), accessToken: 'acc', refreshToken: 'ref' }),
      );
      expect(r.state).toBe(state);
      expect(r.token).toBeUndefined();
      expect(r.id).toBeUndefined();
    });
  }

  it('COMPLETE нь хэрэглэгч + токенуудыг зөөнө', () => {
    const r = eidPollResponse(
      poll({ state: 'COMPLETE', user: sampleUser(), accessToken: 'acc', refreshToken: 'ref' }),
    );
    expect(r.state).toBe('COMPLETE');
    expect(r.token).toBe('acc');
    expect(r.refresh_token).toBe('ref');
    expect(r.id).toBe('u1');
    expect(r.full_name).toBe('Дорж Бат');
  });

  it('MFA шаардлагатай үед session олгогдоогүй — зөвхөн mfa_token', () => {
    const r = eidPollResponse(
      poll({
        state: 'COMPLETE',
        mfaRequired: true,
        mfaToken: 'mfa-1',
        user: sampleUser(),
        accessToken: 'acc',
        refreshToken: 'ref',
      }),
    );
    expect(r.mfa_required).toBe(true);
    expect(r.mfa_token).toBe('mfa-1');
    expect(r.token).toBeUndefined();
    expect(r.id).toBeUndefined();
  });

  it('COMPLETE боловч user null бол токен зөөхгүй (хамгаалалт)', () => {
    const r = eidPollResponse(poll({ state: 'COMPLETE', accessToken: 'acc' }));
    expect(r.token).toBeUndefined();
    expect(r.id).toBeUndefined();
  });
});

describe('loginResponse', () => {
  it('хэрэглэгчийн талбарууд + токен хосыг нэгтгэнэ', () => {
    const r = loginResponse({ user: sampleUser(), accessToken: 'a', refreshToken: 'b' });
    expect(r.id).toBe('u1');
    expect(r.token).toBe('a');
    expect(r.refresh_token).toBe('b');
  });

  it('нууц үгийн hash-ийг ХЭЗЭЭ Ч буцаахгүй', () => {
    const r = loginResponse({
      user: sampleUser({ password: '$2b$12$secrethash' }),
      accessToken: 'a',
      refreshToken: 'b',
    });
    expect(JSON.stringify(r)).not.toContain('secrethash');
    expect('password' in r).toBe(false);
  });
});

describe('googleLoginResponse', () => {
  it('MFA шаардлагатай үед хэрэглэгч ч, токен ч буцаахгүй', () => {
    const r = googleLoginResponse({
      linked: true,
      login: { user: sampleUser(), accessToken: 'acc', refreshToken: 'ref' },
      mfaRequired: true,
      mfaToken: 'mfa-1',
      linkToken: '',
      email: 'bat@example.com',
    });
    expect(r.mfa_required).toBe(true);
    expect(r.mfa_token).toBe('mfa-1');
    expect(r.user).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain('acc');
  });

  it('холбогдсон account нь токентой хэрэглэгч буцаана', () => {
    const r = googleLoginResponse({
      linked: true,
      login: { user: sampleUser(), accessToken: 'acc', refreshToken: 'ref' },
      mfaRequired: false,
      mfaToken: '',
      linkToken: '',
      email: '',
    });
    expect(r.linked).toBe(true);
    expect(r.user?.token).toBe('acc');
  });

  it('эхний удаа нь link_token + email буцаана (токен БАЙХГҮЙ)', () => {
    const r = googleLoginResponse({
      linked: false,
      login: null,
      mfaRequired: false,
      mfaToken: '',
      linkToken: 'lt-1',
      email: 'new@example.com',
    });
    expect(r.linked).toBe(false);
    expect(r.link_token).toBe('lt-1');
    expect(r.email).toBe('new@example.com');
    expect(r.user).toBeUndefined();
  });
});
