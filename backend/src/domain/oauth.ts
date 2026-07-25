// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

/**
 * OAuthClient нь бүртгэгдсэн relying party (OAuth2 client).
 *
 * secretHash нь ХЭЗЭЭ Ч энэ процессоос гарахгүй — API хариунд зөвхөн шинээр
 * үүсгэсэн/эргүүлсэн ТҮҮХИЙ secret нэг удаа буцна.
 */
export interface OAuthClient {
  clientId: string;
  clientName: string;
  secretHash: string;
  /** client_secret_basic | client_secret_post | none */
  tokenEndpointAuthMethod: string;
  /** web | spa | native | m2m */
  appType: string;
  grantTypes: string[];
  responseTypes: string[];
  scopes: string[];
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  tags: string[];
  enabled: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date | null;
}

/** Grant / auth method-ийн зөвшөөрөгдсөн утгууд. */
export const GrantAuthorizationCode = 'authorization_code';
export const GrantRefreshToken = 'refresh_token';
export const GrantClientCredentials = 'client_credentials';

export const AuthMethodBasic = 'client_secret_basic';
export const AuthMethodPost = 'client_secret_post';
export const AuthMethodNone = 'none';

/**
 * isPublicClient нь client secret нууцалж ЧАДДАГГҮЙ (spa/native) эсэхийг заана.
 * Public client-д PKCE ЗААВАЛ шаардагдана.
 */
export const isPublicClient = (c: OAuthClient): boolean =>
  c.tokenEndpointAuthMethod === AuthMethodNone;

/** hasGrant нь тухайн grant type зөвшөөрөгдсөн эсэхийг шалгана. */
export const hasGrant = (c: OAuthClient, grant: string): boolean => c.grantTypes.includes(grant);

/** allowsScope нь тухайн scope client-д олгогдсон эсэхийг шалгана. */
export const allowsScope = (c: OAuthClient, scope: string): boolean => c.scopes.includes(scope);

/**
 * filterAllowedScopes нь хүссэн scope-уудаас client-д ОЛГОГДСОНЫГ нь л үлдээнэ
 * (эрх өсгөх боломжгүй). Дараалал нь хүсэлтийнхээр хадгалагдана.
 */
export function filterAllowedScopes(c: OAuthClient, requested: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of requested) {
    if (s === '' || seen.has(s) || !allowsScope(c, s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}
