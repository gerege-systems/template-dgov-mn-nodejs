// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// pkg/google нь Google OAuth 2.0 (authorization-code) client юм. Энэ апп-д
// Google нь ЦОРЫН ГАНЦ нэвтрэх арга БИШ — eID-ээр баталгаажсан хэрэглэгчид
// холбогддог нэмэлт нэвтрэлт. client_secret нь ЗӨВХӨН server талд байна.

/** ErrNotConfigured нь GOOGLE_CLIENT_ID/SECRET тохируулаагүй үед. */
export class ErrNotConfigured extends Error {
  constructor() {
    super('google: OAuth тохируулаагүй (GOOGLE_CLIENT_ID/SECRET)');
    this.name = 'ErrNotConfigured';
  }
}

const authEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
const tokenEndpoint = 'https://oauth2.googleapis.com/token';
const maxRespBytes = 64 << 10;
const httpTimeoutMs = 15_000;

/** GoogleUser нь id_token-оос задалсан Google профайл. */
export interface GoogleUser {
  /** Google-ийн давтагдашгүй account id */
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string;
}

/**
 * GoogleClient нь auth usecase-д хэрэгтэй хэсэг — тестэд хуурамчаар тавихад
 * хялбар байхаар нарийн interface болгов.
 */
export interface GoogleClient {
  configured(): boolean;
  exchange(code: string, redirectUri: string, signal?: AbortSignal): Promise<GoogleUser>;
  authCodeURL(state: string, redirectUri: string): string;
}

function snippet(raw: string): string {
  const s = raw.trim();
  return s.length > 200 ? s.slice(0, 200) : s;
}

/**
 * parseIdToken нь id_token (JWT)-ийн payload-оос профайлыг задална.
 *
 * Гарын үсгийг ШАЛГАХГҮЙ — токен нь Google-ийн token endpoint-оос TLS-ээр,
 * client_secret-ээр танигдсан хүсэлтийн хариуд ШУУД ирсэн (клиентээр дамжаагүй)
 * тул эх сурвалж нь аль хэдийн батлагдсан. Хэрэв id_token-ыг browser-аас
 * хүлээж авбал (implicit flow) гарын үсэг шалгах нь ЗААВАЛ байх байсан.
 */
export function parseIdToken(idToken: string): GoogleUser {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('google: malformed id_token');

  let claims: {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  try {
    claims = JSON.parse(Buffer.from(parts[1] ?? '', 'base64url').toString('utf8')) as typeof claims;
  } catch {
    throw new Error('google: id_token payload decode failed');
  }
  if (!claims.sub) throw new Error('google: invalid id_token claims');

  return {
    sub: claims.sub,
    email: claims.email ?? '',
    emailVerified: claims.email_verified === true,
    name: claims.name ?? '',
    picture: claims.picture ?? '',
  };
}

class GoogleClientImpl implements GoogleClient {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  configured(): boolean {
    return this.clientId !== '' && this.clientSecret !== '';
  }

  /** authCodeURL нь consent дэлгэцийн URL-ийг бүтээнэ (client_id нь нууц биш). */
  authCodeURL(state: string, redirectUri: string): string {
    const q = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
    });
    return `${authEndpoint}?${q.toString()}`;
  }

  /** exchange нь authorization code-ийг id_token руу солиж профайлыг буцаана. */
  async exchange(code: string, redirectUri: string, signal?: AbortSignal): Promise<GoogleUser> {
    if (!this.configured()) throw new ErrNotConfigured();

    const form = new URLSearchParams({
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const timeout = AbortSignal.timeout(httpTimeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    let res: Response;
    try {
      res = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        signal: combined,
      });
    } catch (err) {
      throw new Error(`google: token http: ${err instanceof Error ? err.message : String(err)}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const raw = buf.subarray(0, maxRespBytes).toString('utf8');
    if (res.status >= 300) {
      throw new Error(`google: token exchange failed: status ${res.status}: ${snippet(raw)}`);
    }

    let tok: { id_token?: string };
    try {
      tok = JSON.parse(raw) as { id_token?: string };
    } catch {
      throw new Error('google: no id_token in response');
    }
    if (!tok.id_token) throw new Error('google: no id_token in response');
    return parseIdToken(tok.id_token);
  }
}

export function newGoogleClient(clientId: string, clientSecret: string): GoogleClient {
  return new GoogleClientImpl(clientId, clientSecret);
}
