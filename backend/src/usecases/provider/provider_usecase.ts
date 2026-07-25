// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// usecases/provider нь платформыг OIDC provider болгосон login/consent/logout
// цөм. `/oauth2/auth` нь browser-ыг энд (нэвтрэх/зөвшөөрөх хуудас руу)
// challenge-тэй чиглүүлдэг; энэ usecase нь challenge-ыг уншиж, иргэнийг
// платформын ОДОО БАЙГАА eID нэвтрэлтээр (session) баталгаажуулж, subject-ээр
// user ID-г тэмдэглэнэ.

import { badRequest, forbidden, internalCause, unauthorized } from '../../apperror/index.js';
import type { OAuthClientRepository } from '../../datasources/repositories/interface/oauth.js';
import { ChallengeConsent, ChallengeLogin } from '../../domain/oauth.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import type { OIDCService } from '../oidc/oidc_service.js';
import type { UsersUsecase } from '../users/users_usecase.js';

/** LoginInfo нь login хуудсанд харуулах login хүсэлтийн товч. */
export interface LoginInfo {
  challenge: string;
  clientId: string;
  clientName: string;
  requestedScope: string[];
  subject: string;
  /**
   * skip нь дахин eID шаардахгүй гэдгийг илэрхийлнэ. Бидний загварт нэвтрэлт нь
   * платформын session тул энэ нь ҮРГЭЛЖ false — session байвал frontend шууд
   * accept руу шилждэг.
   */
  skip: boolean;
}

/** ConsentInfo нь consent хуудсанд харуулах зөвшөөрлийн хүсэлтийн товч. */
export interface ConsentInfo {
  challenge: string;
  clientId: string;
  clientName: string;
  subject: string;
  requestedScope: string[];
  /**
   * skip нь consent UI-г алгасах эсэх (first-party апп эсвэл өмнө нь санагдсан
   * зөвшөөрөл хүссэн бүх scope-ыг хамарсан).
   */
  skip: boolean;
}

/** ProviderUsecase нь OIDC provider-ийн login/consent/logout зохицуулалт. */
export interface ProviderUsecase {
  getLogin(ctx: Ctx, challenge: string): Promise<LoginInfo>;
  acceptLogin(ctx: Ctx, userId: string, challenge: string): Promise<string>;
  rejectLogin(ctx: Ctx, challenge: string, reason: string): Promise<string>;
  /**
   * loginAppContext нь login_challenge-аас нэвтэрч буй RP апп-ийн (нэр, домэйн)-г
   * буцаана — eID push-д дамжуулна. Base SSO / first-party / хоосон/буруу
   * challenge үед хоосон (нэвтрэлтийг блоклохгүй, fail-open).
   */
  loginAppContext(ctx: Ctx, challenge: string): Promise<{ rpApp: string; rpAppUrl: string }>;
  getConsent(ctx: Ctx, challenge: string): Promise<ConsentInfo>;
  acceptConsent(ctx: Ctx, userId: string, challenge: string, grantScope: string[]): Promise<string>;
  rejectConsent(ctx: Ctx, challenge: string, reason: string): Promise<string>;
  acceptLogout(ctx: Ctx, challenge: string): Promise<string>;
}

/** redirectOrigin нь эхний хүчинтэй redirect_uri-ийн origin-г буцаана. */
function redirectOrigin(uris: string[]): string {
  for (const raw of uris) {
    try {
      const u = new URL(raw.trim());
      if (u.protocol !== '' && u.host !== '') return `${u.protocol}//${u.host}`;
    } catch {
      continue;
    }
  }
  return '';
}

class ProviderUsecaseImpl implements ProviderUsecase {
  private readonly firstParty: Set<string>;
  private readonly issuer: string;

  constructor(
    private readonly oidc: OIDCService,
    private readonly clients: OAuthClientRepository,
    private readonly users: UsersUsecase,
    firstPartyClients: string[],
    issuer: string,
  ) {
    this.firstParty = new Set(firstPartyClients);
    this.issuer = issuer.replace(/\/+$/, '');
  }

  async getLogin(ctx: Ctx, challenge: string): Promise<LoginInfo> {
    if (challenge.trim() === '') throw badRequest('login_challenge шаардлагатай');
    const c = await this.oidc.loginChallenge(ctx, challenge);
    const { name } = await this.clientDisplay(ctx, c.clientId);
    return {
      challenge,
      clientId: c.clientId,
      clientName: name,
      requestedScope: c.requestedScopes,
      subject: '',
      skip: false,
    };
  }

  async loginAppContext(ctx: Ctx, challenge: string): Promise<{ rpApp: string; rpAppUrl: string }> {
    if (challenge.trim() === '') return { rpApp: '', rpAppUrl: '' };
    let clientId: string;
    try {
      clientId = (await this.oidc.loginChallenge(ctx, challenge)).clientId;
    } catch {
      // Resolve чадсангүй — base гэж үзэж хоосон (fail-open).
      return { rpApp: '', rpAppUrl: '' };
    }
    // First-party client (base SSO / өөрийн web) → rp_app хоосон: "SSO өөрөө".
    if (this.firstParty.has(clientId)) return { rpApp: '', rpAppUrl: '' };
    const { name, origin } = await this.clientDisplay(ctx, clientId);
    return { rpApp: name, rpAppUrl: origin };
  }

  /** clientDisplay нь апп-ийн харагдах нэр болон эхний redirect origin-ыг буцаана. */
  private async clientDisplay(
    ctx: Ctx,
    clientId: string,
  ): Promise<{ name: string; origin: string }> {
    try {
      const c = await this.clients.get(ctx, clientId);
      const name = c.clientName.trim() === '' ? c.clientId : c.clientName.trim();
      return { name, origin: redirectOrigin(c.redirectUris) };
    } catch {
      return { name: clientId, origin: '' };
    }
  }

  async acceptLogin(ctx: Ctx, userId: string, challenge: string): Promise<string> {
    if (challenge === '') throw badRequest('login_challenge шаардлагатай');
    if (userId === '') throw unauthorized('нэвтрээгүй байна');
    // subject нь платформын тогтвортой, opaque per-citizen танигч (user UUID).
    const { consentChallenge } = await this.oidc.acceptLogin(ctx, challenge, userId);
    // Browser-ыг зөвшөөрлийн хуудас руу.
    return `${this.issuer}/oauth/consent?consent_challenge=${encodeURIComponent(consentChallenge)}`;
  }

  async rejectLogin(ctx: Ctx, challenge: string, reason: string): Promise<string> {
    if (challenge === '') throw badRequest('login_challenge шаардлагатай');
    const why = reason === '' ? 'хэрэглэгч нэвтрэлтийг цуцлав' : reason;
    return this.oidc.reject(ctx, ChallengeLogin, challenge, why);
  }

  async getConsent(ctx: Ctx, challenge: string): Promise<ConsentInfo> {
    if (challenge.trim() === '') throw badRequest('consent_challenge шаардлагатай');
    const c = await this.oidc.consentChallenge(ctx, challenge);
    const { name } = await this.clientDisplay(ctx, c.clientId);
    return {
      challenge,
      clientId: c.clientId,
      clientName: name,
      subject: c.subject,
      requestedScope: c.requestedScopes,
      skip: this.firstParty.has(c.clientId) || c.skip,
    };
  }

  async acceptConsent(
    ctx: Ctx,
    userId: string,
    challenge: string,
    grantScope: string[],
  ): Promise<string> {
    if (challenge === '') throw badRequest('consent_challenge шаардлагатай');
    if (userId === '') throw forbidden('нэвтрээгүй байна');
    // Иргэний бүртгэл байгааг ЭНД шалгана (fail-closed). Claims нь token
    // endpoint дээр, тухайн үеийн бодит өгөгдлөөр угсрагдана.
    try {
      await this.users.getById(ctx, { id: userId });
    } catch (err) {
      throw internalCause(err);
    }
    return this.oidc.acceptConsent(ctx, challenge, userId, grantScope);
  }

  async rejectConsent(ctx: Ctx, challenge: string, reason: string): Promise<string> {
    if (challenge === '') throw badRequest('consent_challenge шаардлагатай');
    const why = reason === '' ? 'хэрэглэгч зөвшөөрлийг цуцлав' : reason;
    return this.oidc.reject(ctx, ChallengeConsent, challenge, why);
  }

  async acceptLogout(ctx: Ctx, challenge: string): Promise<string> {
    if (challenge === '') throw badRequest('logout_challenge шаардлагатай');
    return this.oidc.acceptLogout(ctx, challenge);
  }
}

export const newProviderUsecase = (
  oidc: OIDCService,
  clients: OAuthClientRepository,
  users: UsersUsecase,
  firstPartyClients: string[],
  issuer: string,
): ProviderUsecase => new ProviderUsecaseImpl(oidc, clients, users, firstPartyClients, issuer);
