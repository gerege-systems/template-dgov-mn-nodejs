// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// pkg/oidc нь дээд түвшний OIDC provider (жишээ sso.dgov.mn) руу RP-ийн үүргээр
// холбогдох client.
//
//   GET  {issuer}/oauth2/auth              — browser-ийг чиглүүлэх
//   POST {issuer}/oauth2/token             — code / refresh солилцоо
//   GET  {issuer}/userinfo                 — иргэний claims
//   GET  {issuer}/oauth2/sessions/logout   — RP-initiated logout
//
// Confidential урсгал нь HTTP Basic (client_secret_basic); public (PKCE) урсгал
// нь client_id + code_verifier-ийг form-д илгээнэ.

const maxRespBytes = 1 << 20; // 1 MiB
const httpTimeoutMs = 15_000;

/** Tokens нь token endpoint-ийн бүрэн хариу. */
export interface Tokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  /** expiresIn нь access token-ий хүчинтэй хугацаа (секунд). */
  expiresIn: number;
}

/**
 * UserInfo нь /userinfo-оос ирэх иргэний claims. SSO нь eID-ээр нэвтэрсэн
 * иргэнд кирилл нэрийг буцаадаг; латин нэр (given_name_en/family_name_en),
 * регистр (national_id) болон Google холболт нь тухайн scope-д л ирнэ.
 */
export interface UserInfo {
  sub: string;
  name: string;
  given_name: string;
  family_name: string;
  given_name_en: string;
  family_name_en: string;
  email: string;
  email_verified: boolean;
  /** national_id нь регистрийн дугаар; register_number нь иргэний бүртгэлийн дугаар. */
  national_id: string;
  register_number: string;
  google_sub: string;
  google_email: string;
  google_name: string;
  google_picture: string;
}

interface TokenWire {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
}

/** OIDCClient нь RP урсгалуудын хийсвэрлэл (тестэд mock тавихад хялбар). */
export interface OIDCClient {
  /** configured нь SSO нэвтрэлт идэвхтэй эсэхийг мэдээлнэ (аль нэг талбар хоосон бол inert). */
  configured(): boolean;
  /** authCodeUrl нь browser-ийг чиглүүлэх URL-ийг state (+nonce)-тэй байгуулна. */
  authCodeUrl(state: string, nonce: string): string;
  /** exchange нь authorization code-ийг токен болгож солино (confidential). */
  exchange(code: string, signal?: AbortSignal): Promise<Tokens>;
  /** refresh нь refresh_token-оор шинэ токен авна. */
  refresh(refreshToken: string, signal?: AbortSignal): Promise<Tokens>;
  /** exchangePKCE нь PUBLIC client-ийн code-ийг солино (secret-гүй). */
  exchangePKCE(
    clientId: string,
    code: string,
    codeVerifier: string,
    redirectUri: string,
    signal?: AbortSignal,
  ): Promise<Tokens>;
  /** logoutUrl нь RP-initiated logout URL. */
  logoutUrl(idTokenHint: string, postLogout: string): string;
  /** logoutUrlFor нь redirect_uri-ийн origin руу буцах logout URL. */
  logoutUrlFor(idTokenHint: string): string;
  /** userInfo нь access token-оор иргэний claims-ыг авна. */
  userInfo(accessToken: string, signal?: AbortSignal): Promise<UserInfo>;
}

class OIDCClientImpl implements OIDCClient {
  private readonly issuer: string;
  private readonly scope: string;

  constructor(
    issuer: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
    scope: string,
  ) {
    this.issuer = issuer.replace(/\/+$/, '');
    this.scope = scope.trim() === '' ? 'openid profile email' : scope;
  }

  configured(): boolean {
    return (
      this.issuer !== '' &&
      this.clientId !== '' &&
      this.clientSecret !== '' &&
      this.redirectUri !== ''
    );
  }

  authCodeUrl(state: string, nonce: string): string {
    const q = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      scope: this.scope,
      redirect_uri: this.redirectUri,
      state,
    });
    if (nonce !== '') q.set('nonce', nonce);
    return `${this.issuer}/oauth2/auth?${q.toString()}`;
  }

  /** signalWith нь дуудагчийн цуцлалт + өөрийн timeout-ыг нэгтгэнэ. */
  private signalWith(signal?: AbortSignal): AbortSignal {
    const timeout = AbortSignal.timeout(httpTimeoutMs);
    return signal ? AbortSignal.any([signal, timeout]) : timeout;
  }

  /** readCapped нь хариуг хэмжээгээр хязгаарлаж уншина. */
  private static async readCapped(res: Response): Promise<string> {
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.subarray(0, maxRespBytes).toString('utf8');
  }

  /** parseTokens нь token endpoint-ийн хариуг задалж баталгаажуулна. */
  private static parseTokens(body: string): TokenWire {
    let tr: TokenWire;
    try {
      tr = JSON.parse(body) as TokenWire;
    } catch (err) {
      throw new Error(`sso token decode: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!tr.access_token) throw new Error('sso token response missing access_token');
    return tr;
  }

  /**
   * postToken нь confidential client-ийн (client_secret_basic) token endpoint
   * дуудлагыг гүйцэтгэнэ. grant тус бүрийн form-ыг дуудагч бэлдэнэ.
   */
  private async postToken(form: URLSearchParams, signal?: AbortSignal): Promise<TokenWire> {
    // Go нь creds-ийг SetBasicAuth-д өгөхөөсөө ӨМНӨ QueryEscape хийдэг тул
    // тэрхүү (RFC 6749 §2.3.1-ийн) хэлбэрийг яг хуулбарлана — эс бөгөөс тусгай
    // тэмдэгттэй secret-тэй client SSO дээр танигдахгүй болно.
    const basic = Buffer.from(
      `${encodeURIComponent(this.clientId)}:${encodeURIComponent(this.clientSecret)}`,
      'utf8',
    ).toString('base64');

    let res: Response;
    try {
      res = await fetch(`${this.issuer}/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: form.toString(),
        signal: this.signalWith(signal),
      });
    } catch (err) {
      throw new Error(`sso token request: ${err instanceof Error ? err.message : String(err)}`);
    }
    const body = await OIDCClientImpl.readCapped(res);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`sso token endpoint returned ${String(res.status)}`);
    }
    return OIDCClientImpl.parseTokens(body);
  }

  async exchange(code: string, signal?: AbortSignal): Promise<Tokens> {
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
    });
    const tr = await this.postToken(form, signal);
    return {
      accessToken: tr.access_token ?? '',
      idToken: tr.id_token ?? '',
      refreshToken: tr.refresh_token ?? '',
      expiresIn: tr.expires_in ?? 0,
    };
  }

  async refresh(refreshToken: string, signal?: AbortSignal): Promise<Tokens> {
    const form = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    const tr = await this.postToken(form, signal);
    return {
      accessToken: tr.access_token ?? '',
      idToken: tr.id_token ?? '',
      // Provider нь refresh token-ыг эргүүлэхгүй бол ХУУЧНЫГ хадгалж үлдэнэ —
      // эс бөгөөс дараагийн refresh хоосон токеноор явж бүтэлгүйтнэ.
      refreshToken:
        tr.refresh_token === undefined || tr.refresh_token === '' ? refreshToken : tr.refresh_token,
      expiresIn: tr.expires_in ?? 0,
    };
  }

  async exchangePKCE(
    clientId: string,
    code: string,
    codeVerifier: string,
    redirectUri: string,
    signal?: AbortSignal,
  ): Promise<Tokens> {
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    });

    let res: Response;
    try {
      // PUBLIC client — HTTP Basic auth / client_secret БАЙХГҮЙ.
      res = await fetch(`${this.issuer}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: form.toString(),
        signal: this.signalWith(signal),
      });
    } catch (err) {
      throw new Error(`sso token request: ${err instanceof Error ? err.message : String(err)}`);
    }
    const body = await OIDCClientImpl.readCapped(res);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`sso token endpoint returned ${String(res.status)}`);
    }
    const tr = OIDCClientImpl.parseTokens(body);
    return {
      accessToken: tr.access_token ?? '',
      idToken: tr.id_token ?? '',
      refreshToken: tr.refresh_token ?? '',
      expiresIn: tr.expires_in ?? 0,
    };
  }

  logoutUrl(idTokenHint: string, postLogout: string): string {
    const q = new URLSearchParams();
    if (postLogout !== '') q.set('post_logout_redirect_uri', postLogout);
    if (idTokenHint !== '') q.set('id_token_hint', idTokenHint);
    const base = `${this.issuer}/oauth2/sessions/logout`;
    const enc = q.toString();
    return enc === '' ? base : `${base}?${enc}`;
  }

  logoutUrlFor(idTokenHint: string): string {
    let post = '';
    try {
      const u = new URL(this.redirectUri);
      if (u.host !== '') post = `${u.protocol}//${u.host}/`;
    } catch {
      // redirect_uri задлагдахгүй бол post-logout-гүй logout URL үүснэ.
    }
    return this.logoutUrl(idTokenHint, post);
  }

  async userInfo(accessToken: string, signal?: AbortSignal): Promise<UserInfo> {
    let res: Response;
    try {
      res = await fetch(`${this.issuer}/userinfo`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        signal: this.signalWith(signal),
      });
    } catch (err) {
      throw new Error(`sso userinfo request: ${err instanceof Error ? err.message : String(err)}`);
    }
    const body = await OIDCClientImpl.readCapped(res);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`sso userinfo returned ${String(res.status)}`);
    }
    let ui: Partial<UserInfo>;
    try {
      ui = JSON.parse(body) as Partial<UserInfo>;
    } catch (err) {
      throw new Error(`sso userinfo decode: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (ui.sub === undefined || ui.sub === '') throw new Error('sso userinfo missing sub');
    return {
      sub: ui.sub,
      name: ui.name ?? '',
      given_name: ui.given_name ?? '',
      family_name: ui.family_name ?? '',
      given_name_en: ui.given_name_en ?? '',
      family_name_en: ui.family_name_en ?? '',
      email: ui.email ?? '',
      email_verified: ui.email_verified ?? false,
      national_id: ui.national_id ?? '',
      register_number: ui.register_number ?? '',
      google_sub: ui.google_sub ?? '',
      google_email: ui.google_email ?? '',
      google_name: ui.google_name ?? '',
      google_picture: ui.google_picture ?? '',
    };
  }
}

/**
 * newOIDCClient нь issuer (жишээ https://sso.dgov.mn) болон client creds-ээр
 * OIDC client үүсгэнэ. scope хоосон бол "openid profile email".
 */
export const newOIDCClient = (
  issuer: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  scope: string,
): OIDCClient => new OIDCClientImpl(issuer, clientId, clientSecret, redirectUri, scope);
