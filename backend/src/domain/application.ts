// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

/**
 * Application нь API Gateway consumer + SSO RP-ийг НЭГТГЭСЭН загвар. Апп бүр
 * яг НЭГ OAuth2 client-тэй тохирно; тусдаа UUID байхгүй — client_id нь танигч.
 *
 * secret нь ЗӨВХӨН create/rotate/set хариунд дүүрнэ; DB-д hash л хадгалагдана.
 */
export interface Application {
  id: string;
  /** clientId нь OAuth2 client_id. */
  clientId: string;
  name: string;
  /** web | spa | native | m2m */
  appType: string;
  tags: string[];
  redirectUris: string[];
  enabled: boolean;
  createdBy: string;
  /** serviceIds нь зөвшөөрсөн gateway service-үүд (svc:* scope-оос сэргээгдэнэ). */
  serviceIds: string[];
  /** secret нь зөвхөн create/rotate хариунд; хадгалагдахгүй. */
  secret: string;
  createdAt: Date;
  updatedAt: Date | null;
}

/**
 * AppTypes нь зөвшөөрөгдсөн апп төрлүүд. web/spa/native = authorization_code
 * RP, m2m = client_credentials (API-to-API).
 */
export const AppTypes = new Set(['web', 'spa', 'native', 'm2m']);

/** appUsesRedirect нь тухайн төрөл redirect_uri шаарддаг эсэхийг хэлнэ. */
export const appUsesRedirect = (appType: string): boolean =>
  appType === 'web' || appType === 'spa' || appType === 'native';

/**
 * appIsPublic нь тухайн төрөл public (PKCE, secret-ГҮЙ) client эсэхийг заана.
 * spa/native нь browser/төхөөрөмжид ажилладаг тул secret нууцалж чадахгүй.
 */
export const appIsPublic = (appType: string): boolean => appType === 'spa' || appType === 'native';
