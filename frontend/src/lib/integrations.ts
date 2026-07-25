// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Гуравдагч этгээдийн интеграцийн (Google Drive, Dropbox, Google Meet) UI
// мета мэдээлэл.
//
// ⚠️ ЭНД НУУЦ БАЙХГҮЙ: OAuth-ийн client_id/secret, authorize/token URL, токен
// солилцоо — бүгд API талд (`pkg/oauthproviders`). SPA нь статикаар түгээгддэг
// тул зөвхөн (a) брэндийн нэр, (b) API-аас ирсэн "тохируулагдсан эсэх" төлөв
// хоёрыг л мэднэ. "Холбох" нь `/api/v1/integrations/:id/connect` рүү энгийн
// шилжилт — цаашдын бүхнийг API хийнэ.

export type IntegrationID = 'google-drive' | 'dropbox' | 'google-meet';

export type IntegrationProvider = {
  id: IntegrationID;
  /** Брэндийн нэр (орчуулдаггүй) — UI дээр translate="no". */
  name: string;
};

export const INTEGRATIONS: IntegrationProvider[] = [
  { id: 'google-drive', name: 'Google Drive' },
  { id: 'dropbox', name: 'Dropbox' },
  { id: 'google-meet', name: 'Google Meet' },
];

export function getIntegration(id: string): IntegrationProvider | undefined {
  return INTEGRATIONS.find((p) => p.id === id);
}

/**
 * IntegrationStatus нь UI-д хэрэгтэй бүхэл төлөв: тохируулагдсан эсэх (API-аас)
 * ба тухайн хэрэглэгч холбосон эсэх.
 */
export type IntegrationStatus = {
  id: IntegrationID;
  name: string;
  configured: boolean;
  connected: boolean;
};

/**
 * integrationStatuses нь картуудын төлвийг бүтээнэ.
 *
 * `configured` нь `GET /config`-ийн `integrations` талбараас ирнэ (client id +
 * secret хоёулаа тохируулагдсан үед л true). Тохируулаагүй бол "Удахгүй" гэж
 * харагдана — товч дарж алдаа авахгүй.
 */
export function integrationStatuses(
  connected: Set<string>,
  configured: Record<string, boolean> = {},
): IntegrationStatus[] {
  return INTEGRATIONS.map((p) => ({
    id: p.id,
    name: p.name,
    configured: configured[p.id] === true,
    connected: connected.has(p.id),
  }));
}
