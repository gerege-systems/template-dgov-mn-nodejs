
// Гуравдагч этгээдийн интеграцийн (Google Drive, Dropbox, Google Meet) OAuth
// бүртгэл. Зөвхөн server талд уншигдана — client ID/secret хэзээ ч browser-т
// гарахгүй. Энэ нь OAuth-ийн "арматур": authorize URL-ийг бүтээх мета мэдээлэл
// энд байх ба токен солилцоог (token exchange) BFF callback route-д хийнэ.
// Тухайн провайдерын client ID env тохируулагдсан үед л "холбох" идэвхжинэ;
// тохируулаагүй бол UI "Удахгүй" төлөвт харагдана.

export type IntegrationID = 'google-drive' | 'dropbox' | 'google-meet';

export type IntegrationProvider = {
  id: IntegrationID;
  // Брэндийн нэр (орчуулдаггүй) — UI дээр translate="no".
  name: string;
  // OAuth 2.0 authorization endpoint.
  authorizeUrl: string;
  // OAuth 2.0 token endpoint (authorization code → access/refresh токен).
  tokenUrl: string;
  // Хүсэх эрхийн хүрээ (scope).
  scope: string;
  // Client ID-г уншина env-ийн нэр (secret биш — secret нь callback-д).
  clientIdEnv: string;
  // Client secret-ийн env нэр (token exchange-д, callback дотор).
  clientSecretEnv: string;
};

export const INTEGRATIONS: IntegrationProvider[] = [
  {
    id: 'google-drive',
    name: 'Google Drive',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    // drive.file — апп зөвхөн ӨӨРИЙН үүсгэсэн файл/хавтсыг (Gerege folder) удирдана:
    // харах/хуулах/нэр солих/устгах. Бусад Drive-д хүрэхгүй (least privilege).
    scope: 'https://www.googleapis.com/auth/drive.file',
    clientIdEnv: 'GOOGLE_DRIVE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_DRIVE_CLIENT_SECRET',
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    authorizeUrl: 'https://www.dropbox.com/oauth2/authorize',
    tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
    // metadata.read — /Gerege хавтсыг жагсаах; content.read/write — татах/хуулах.
    scope: 'files.content.read files.content.write files.metadata.read',
    clientIdEnv: 'DROPBOX_CLIENT_ID',
    clientSecretEnv: 'DROPBOX_CLIENT_SECRET',
  },
  {
    id: 'google-meet',
    name: 'Google Meet',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/meetings.space.created',
    clientIdEnv: 'GOOGLE_MEET_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_MEET_CLIENT_SECRET',
  },
];

export function getIntegration(id: string): IntegrationProvider | undefined {
  return INTEGRATIONS.find((p) => p.id === id);
}

/**
 * isConfigured нь тухайн провайдерыг ХОЛБОХ боломжтой эсэхийг заана.
 *
 * ⚠️ SPA-д одоогоор ҮРГЭЛЖ false: гуравдагч талын OAuth code-ийг солихдоо
 * client secret шаардагддаг тул тэр алхам зөвхөн СЕРВЕР талд байж болно. BFF
 * устсан бөгөөд API нь эдгээр провайдерын OAuth-ийг хараахан хэрэгжүүлээгүй —
 * иймд "холбох" товч харагдахгүй (жагсаах/салгах нь API-аар ажилласаар байна).
 * API талд `/integrations/:provider/connect` нэмэгдмэгц энэ утгыг тэндээс
 * (`/config`) уншина.
 */
export function isConfigured(_p: IntegrationProvider): boolean {
  return false;
}

// IntegrationStatus нь page-аас view руу дамжуулах серилизованих аюулгүй төлөв —
// env утга/токен биш, зөвхөн id + configured (холбох боломжтой эсэх) +
// connected (тухайн хэрэглэгч холбосон эсэх).
export type IntegrationStatus = {
  id: IntegrationID;
  name: string;
  configured: boolean;
  connected: boolean;
};

export function integrationStatuses(connected: Set<string>): IntegrationStatus[] {
  return INTEGRATIONS.map((p) => ({
    id: p.id,
    name: p.name,
    configured: isConfigured(p),
    connected: connected.has(p.id),
  }));
}

export type IntegrationToken = {
  access_token: string;
  refresh_token?: string;
  // Хүчинтэй хугацаа дуусах epoch ms (refresh-ийн шийдвэрт).
  expires_at?: number;
};

// ⚠️ Гуравдагч талын OAuth-ийн token exchange (client_secret шаарддаг) энэ
// модульд ОРОХГҮЙ: SPA нь статикаар түгээгддэг тул ямар ч нууц агуулж болохгүй.
// Тэр алхмыг API талд (`/integrations/:provider/connect|callback`) хэрэгжүүлэх
// хүртэл "холбох" боломж хаалттай — жагсаах/салгах нь API-аар ажиллана.
