// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import fs from 'node:fs';
import path from 'node:path';

import {
  EnvironmentDevelopment,
  EnvironmentProduction,
  ErrEmptyVar,
  ErrLoadConfig,
} from '../constants/index.js';

/**
 * Config нь бүх орчны хувьсагчийн төрөлжсөн дүр төрх. Талбарын нэрс нь Go
 * template-ийн mapstructure түлхүүрүүдтэй нэг нэгээрээ таарна.
 */
export interface Config {
  PORT: number;
  ENVIRONMENT: string;
  DEBUG: boolean;

  DB_POSTGRE_DRIVER: string;
  DB_POSTGRE_DSN: string;
  DB_POSTGRE_URL: string;

  DB_MAX_OPEN_CONNS: number;
  DB_MAX_IDLE_CONNS: number;
  DB_CONN_MAX_LIFE_MINS: number;

  JWT_SECRET: string;
  JWT_EXPIRED: number;
  JWT_ISSUER: string;
  /** хоног */
  JWT_REFRESH_EXPIRED: number;

  OTP_MAX_ATTEMPTS: number;

  // GeregeCloud Verify API (verify.gecloud.mn) — бүх email/SMS OTP-г (бүртгэл
  // баталгаажуулах, нууц үг сэргээх) энэ үйлчилгээгээр илгээж/шалгана. SMTP огт
  // ашиглахгүй. VERIFY_API_KEY production-д заавал шаардлагатай.
  VERIFY_API_BASE: string;
  VERIFY_API_KEY: string;
  VERIFY_CHANNEL: string;

  // Gerege Verify / XYP (xyp.dgov.mn) — улсын бүртгэлээс байгууллагын мэдээлэл
  // авах лавлагаа API. HTTP Basic Auth. Креденшлгүй бол eID байгууллага холбох
  // функц идэвхгүй болно (boot-ыг эвдэхгүй; сонголттой).
  XYP_API_BASE: string;
  XYP_CLIENT_ID: string;
  XYP_CLIENT_SECRET: string;

  // Gerege Space — апп-ын өөрийн SFTP хадгалалт. Хэрэглэгч бүр квоттой.
  GSPACE_HOST: string;
  GSPACE_PORT: number;
  GSPACE_USER: string;
  GSPACE_PASSWORD: string;
  GSPACE_BASE_PATH: string;
  GSPACE_QUOTA_BYTES: number;
  // GSPACE_HOST_KEY — SFTP host-ийн хүлээгдэж буй нийтийн түлхүүр (known_hosts
  // мөрийн формат). Тохируулбал host key-г баталгаажуулна (MITM-аас хамгаална);
  // production-д ЗААВАЛ шаардлагатай.
  GSPACE_HOST_KEY: string;

  // eID identity provider (RP contract) — энэ template нь Relying Party.
  // "Login with eID" нь цорын ганц нэвтрэх арга.
  EID_BASE_URL: string;
  EID_RP_UUID: string;
  EID_RP_NAME: string;
  EID_RP_SECRET: string;
  EID_CERT_LEVEL: string;
  EID_CALLBACK_URL: string;
  EID_DISPLAY_TEXT: string;
  // SIGN_RELAY_TOKEN — 3 дагч RP dan-аар ДАМЖИН eID гарын үсэг зурахад ашиглах
  // shared token. Хоосон бол relay идэвхгүй.
  SIGN_RELAY_TOKEN: string;

  // PDF гарын үсгийн (PAdES) серверийн БАЙНГЫН Document-Signer гэрчилгээ +
  // ECDSA түлхүүрийн PEM файлын зам. Production-д ЗААВАЛ (fail-closed).
  SIGN_SIGNER_CERT_FILE: string;
  SIGN_SIGNER_KEY_FILE: string;

  // Google OAuth — Google account-ийг eID хэрэглэгчид холбох нэвтрэлт.
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;

  BCRYPT_COST: number;

  // Gemini AI pipeline (/api/v1/ai/*) — REST-ээр шууд дуудна (SDK-гүй).
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  GEMINI_TTS_MODEL: string;
  GEMINI_VOICE: string;
  GEMINI_API_BASE: string;
  // AI_SCOPE_PROMPT нь AI туслахын хамрах хүрээний env fallback — DB-ийн 'scope'
  // prompt давхарга хоосон/уншигдахгүй үед хэрэглэгдэнэ.
  AI_SCOPE_PROMPT: string;

  // OTel — OTEL_EXPORTER хоосон бол tracing идэвхгүй болно (noop provider).
  OTEL_EXPORTER: string;
  OTEL_SAMPLE_RATIO: number;

  REDIS_HOST: string;
  REDIS_PASS: string;
  REDIS_EXPIRED: number;

  // OBSERVABILITY_TOKEN нь production-д /metrics ба /swagger/doc.json операторын
  // endpoint-уудыг хамгаалах bearer token. Хоосон бол эдгээр endpoint
  // production-д 404 буцаана (бүрэн хаалттай).
  OBSERVABILITY_TOKEN: string;

  ALLOWED_ORIGINS: string;

  // TRUSTED_PROXIES нь итгэмжит урвуу proxy-гийн IP/CIDR жагсаалт. Зөвхөн
  // эдгээрээс ирсэн холболтын X-Forwarded-For-д итгэнэ. Хоосон (өгөгдмөл) =
  // XFF-д огт итгэхгүй (rate-limit/audit spoofing-ийн эсрэг fail-safe).
  TRUSTED_PROXIES: string;

  // INTEGRATION_ENC_KEY нь хэрэглэгчийн 3 дагч OAuth токеныг storage-д
  // хадгалахын өмнө AES-256-GCM-ээр шифрлэх нууц түлхүүр.
  INTEGRATION_ENC_KEY: string;

  // Gerege Core (core.gerege.mn) — user/organization find.
  CORE_API_BASE: string;
  CORE_API_TOKEN: string;

  // SUPERADMIN_EMAIL нь bootstrap: тохируулсан бол boot үед энэ и-мэйлтэй
  // хэрэглэгчийг super admin болгож ахиулна.
  SUPERADMIN_EMAIL: string;

  // Government SSO (sso.dgov.mn, OIDC) — гадаад SSO provider-т нэвтрэх RP.
  SSO_ISSUER: string;
  SSO_CLIENT_ID: string;
  SSO_CLIENT_SECRET: string;
  SSO_REDIRECT_URI: string;
  SSO_SCOPE: string;
  SSO_NATIVE_CLIENT_ID: string;
  SSO_EID_PROXY_BASE_URL: string;

  // RELAY_DEMO_MODE нь platform-хоорондын хүсэлт дамжуулах demo simulator-ыг
  // идэвхжүүлнэ. Production-д унтраана (false).
  RELAY_DEMO_MODE: boolean;

  // --- OIDC PROVIDER тал (энэ платформ нь ӨӨРӨӨ SSO provider) ---
  OAUTH_ISSUER: string;
  SSO_STATE_KEY: string;
  SSO_FIRSTPARTY_CLIENTS: string;
  SSO_ADMIN_API_KEYS: string;
  SSO_ADMIN_SUBS: string;
}

/** AppConfig нь process-ийн хэмжээнд ашиглагдах цорын ганц тохиргооны утга. */
export const AppConfig: Config = blankConfig();

function blankConfig(): Config {
  return {
    PORT: 0,
    ENVIRONMENT: '',
    DEBUG: false,
    DB_POSTGRE_DRIVER: '',
    DB_POSTGRE_DSN: '',
    DB_POSTGRE_URL: '',
    DB_MAX_OPEN_CONNS: 0,
    DB_MAX_IDLE_CONNS: 0,
    DB_CONN_MAX_LIFE_MINS: 0,
    JWT_SECRET: '',
    JWT_EXPIRED: 0,
    JWT_ISSUER: '',
    JWT_REFRESH_EXPIRED: 0,
    OTP_MAX_ATTEMPTS: 0,
    VERIFY_API_BASE: '',
    VERIFY_API_KEY: '',
    VERIFY_CHANNEL: '',
    XYP_API_BASE: '',
    XYP_CLIENT_ID: '',
    XYP_CLIENT_SECRET: '',
    GSPACE_HOST: '',
    GSPACE_PORT: 0,
    GSPACE_USER: '',
    GSPACE_PASSWORD: '',
    GSPACE_BASE_PATH: '',
    GSPACE_QUOTA_BYTES: 0,
    GSPACE_HOST_KEY: '',
    EID_BASE_URL: '',
    EID_RP_UUID: '',
    EID_RP_NAME: '',
    EID_RP_SECRET: '',
    EID_CERT_LEVEL: '',
    EID_CALLBACK_URL: '',
    EID_DISPLAY_TEXT: '',
    SIGN_RELAY_TOKEN: '',
    SIGN_SIGNER_CERT_FILE: '',
    SIGN_SIGNER_KEY_FILE: '',
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
    BCRYPT_COST: 0,
    GEMINI_API_KEY: '',
    GEMINI_MODEL: '',
    GEMINI_TTS_MODEL: '',
    GEMINI_VOICE: '',
    GEMINI_API_BASE: '',
    AI_SCOPE_PROMPT: '',
    OTEL_EXPORTER: '',
    OTEL_SAMPLE_RATIO: 0,
    REDIS_HOST: '',
    REDIS_PASS: '',
    REDIS_EXPIRED: 0,
    OBSERVABILITY_TOKEN: '',
    ALLOWED_ORIGINS: '',
    TRUSTED_PROXIES: '',
    INTEGRATION_ENC_KEY: '',
    CORE_API_BASE: '',
    CORE_API_TOKEN: '',
    SUPERADMIN_EMAIL: '',
    SSO_ISSUER: '',
    SSO_CLIENT_ID: '',
    SSO_CLIENT_SECRET: '',
    SSO_REDIRECT_URI: '',
    SSO_SCOPE: '',
    SSO_NATIVE_CLIENT_ID: '',
    SSO_EID_PROXY_BASE_URL: '',
    RELAY_DEMO_MODE: false,
    OAUTH_ISSUER: '',
    SSO_FIRSTPARTY_CLIENTS: '',
    SSO_STATE_KEY: '',
    SSO_ADMIN_API_KEYS: '',
    SSO_ADMIN_SUBS: '',
  };
}

/** splitCSVConfig нь таслалаар салгаж, хоосон/зайг арилгаж массив болгоно. */
function splitCSVConfig(s: string): string[] {
  if (s.trim() === '') return [];
  return s
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '');
}

export const ssoFirstPartyClientsList = (): string[] =>
  splitCSVConfig(AppConfig.SSO_FIRSTPARTY_CLIENTS);
export const ssoAdminAPIKeysList = (): string[] => splitCSVConfig(AppConfig.SSO_ADMIN_API_KEYS);
export const ssoAdminSubsList = (): string[] => splitCSVConfig(AppConfig.SSO_ADMIN_SUBS);
export const trustedProxiesList = (): string[] => splitCSVConfig(AppConfig.TRUSTED_PROXIES);

/**
 * issuer нь OIDC issuer-ийг буцаана. Сүүлийн slash-ыг ХАСНА — issuer нь
 * id_token-ий `iss`-тэй ЯГ таарах ёстой.
 */
export function issuer(): string {
  return AppConfig.OAUTH_ISSUER.trim().replace(/\/+$/, '');
}

/** providerConfigured нь OIDC provider-ийн гол тохиргоо бүрдсэн эсэхийг мэдээлнэ. */
export function providerConfigured(): boolean {
  return issuer() !== '' && AppConfig.SSO_STATE_KEY.length >= 32;
}

/**
 * allowedOriginsList нь CORS origin-уудыг буцаана. Зөвхөн хоосон БА орчин
 * production биш үед ["*"] утгыг анхдагчаар авна.
 */
export function allowedOriginsList(): string[] {
  if (AppConfig.ALLOWED_ORIGINS === '') {
    if (AppConfig.ENVIRONMENT === EnvironmentProduction) return [];
    return ['*'];
  }
  return splitCSVConfig(AppConfig.ALLOWED_ORIGINS);
}

/**
 * parseDotEnv нь .env файлын мөрүүдийг key/value болгон задлана. Тайлбар (#),
 * хоосон мөр, `export ` угтварыг зохицуулж, хос/сондгой хашилтыг хуулна.
 */
export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const body = line.startsWith('export ') ? line.slice('export '.length) : line;
    const eq = body.indexOf('=');
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    let value = body.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

// Go-ийн viper.AddConfigPath-тай ижил хайх замууд. .env файл БАЙХГҮЙ байх нь
// алдаа БИШ — контейнер / 12-factor орчинд тохиргоог зөвхөн environment-ээс
// уншина.
const envSearchPaths = ['.env', path.join('src', 'config', '.env'), '/.env'];

function loadEnvFiles(): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const p of envSearchPaths) {
    try {
      if (!fs.existsSync(p)) continue;
      Object.assign(merged, parseDotEnv(fs.readFileSync(p, 'utf8')));
      break;
    } catch {
      throw ErrLoadConfig;
    }
  }
  return merged;
}

type Source = Record<string, string | undefined>;

const str = (src: Source, key: string): string => (src[key] ?? '').trim();

const num = (src: Source, key: string): number => {
  const raw = str(src, key);
  if (raw === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};

const bool = (src: Source, key: string): boolean => {
  const raw = str(src, key).toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
};

/**
 * sslModeOf нь Postgres холболтын мөрөөс sslmode утгыг гаргана — URL хэлбэр
 * (postgres://...?sslmode=verify-full) болон keyword/DSN хэлбэр
 * (host=... sslmode=verify-full) хоёуланг дэмжинэ. sslmode байхгүй бол ""
 * буцаана (libpq нь баталгаажуулдаггүй "prefer"-ийг өгөгдмөлөөр авах тул
 * production guard үүнийг найдваргүйд тооцно).
 */
export function sslModeOf(conn: string): string {
  try {
    const u = new URL(conn);
    if (u.protocol === 'postgres:' || u.protocol === 'postgresql:') {
      return (u.searchParams.get('sslmode') ?? '').trim().toLowerCase();
    }
  } catch {
    // URL биш — keyword/DSN хэлбэрээр үргэлжлүүлнэ.
  }
  for (const field of conn.split(/\s+/)) {
    const eq = field.indexOf('=');
    if (eq <= 0) continue;
    if (field.slice(0, eq).trim().toLowerCase() === 'sslmode') {
      return field
        .slice(eq + 1)
        .trim()
        .toLowerCase();
    }
  }
  return '';
}

/** applyDefaults нь сонголттой config утгуудад зохистой анхдагч утгуудыг олгоно. */
function applyDefaults(explicitlySet: (key: string) => boolean): void {
  // RELAY_DEMO_MODE default = true (template scaffold): тодорхой унтраагаагүй
  // бол demo simulator идэвхтэй.
  if (!explicitlySet('RELAY_DEMO_MODE')) AppConfig.RELAY_DEMO_MODE = true;
  if (AppConfig.DB_MAX_OPEN_CONNS === 0) AppConfig.DB_MAX_OPEN_CONNS = 25;
  if (AppConfig.DB_MAX_IDLE_CONNS === 0) AppConfig.DB_MAX_IDLE_CONNS = 5;
  if (AppConfig.DB_CONN_MAX_LIFE_MINS === 0) AppConfig.DB_CONN_MAX_LIFE_MINS = 15;
  if (AppConfig.OTP_MAX_ATTEMPTS === 0) AppConfig.OTP_MAX_ATTEMPTS = 5;
  // 12 ≈ 2026 оны үеийн CPU дээр 100–200 мс.
  if (AppConfig.BCRYPT_COST === 0) AppConfig.BCRYPT_COST = 12;
  if (AppConfig.JWT_REFRESH_EXPIRED === 0) AppConfig.JWT_REFRESH_EXPIRED = 7;
  if (AppConfig.GEMINI_TTS_MODEL === '') {
    AppConfig.GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts';
  }
  // eID RP-ийн өгөгдмөл утгууд — IdP-ийн нийтийн endpoint болон бүртгэгдсэн
  // callback URL тул орчин болгонд найдвартай ажиллана.
  if (AppConfig.EID_BASE_URL === '') AppConfig.EID_BASE_URL = 'https://eidmongolia.mn/v3';
  if (AppConfig.EID_RP_NAME === '') AppConfig.EID_RP_NAME = 'template-web';
  // Нэвтрэлтэд ADVANCED — хамгийн нийцтэй (ADVANCED/QUALIFIED/QSCD бүгдийг
  // хүлээн авна).
  if (AppConfig.EID_CERT_LEVEL === '') AppConfig.EID_CERT_LEVEL = 'ADVANCED';
  if (AppConfig.EID_CALLBACK_URL === '') {
    AppConfig.EID_CALLBACK_URL = 'https://node.template.dgov.mn/login/verify';
  }
  if (AppConfig.EID_DISPLAY_TEXT === '') AppConfig.EID_DISPLAY_TEXT = 'node.template.dgov.mn';
  if (AppConfig.CORE_API_BASE === '') AppConfig.CORE_API_BASE = 'https://core.gerege.mn';
  if (AppConfig.XYP_API_BASE === '') AppConfig.XYP_API_BASE = 'https://xyp.dgov.mn';
  if (AppConfig.GSPACE_PORT === 0) AppConfig.GSPACE_PORT = 22;
  if (AppConfig.GSPACE_BASE_PATH === '') AppConfig.GSPACE_BASE_PATH = 'gerege-space';
  if (AppConfig.GSPACE_QUOTA_BYTES === 0) AppConfig.GSPACE_QUOTA_BYTES = 2 << 20; // 2 MB
  // Government SSO (RP/consumer) default-ууд.
  if (AppConfig.SSO_ISSUER === '') AppConfig.SSO_ISSUER = 'https://sso.dgov.mn';
  if (AppConfig.SSO_SCOPE === '') AppConfig.SSO_SCOPE = 'openid profile email';
  if (AppConfig.SSO_NATIVE_CLIENT_ID === '') {
    AppConfig.SSO_NATIVE_CLIENT_ID = 'template-dgov-mn-nodejs-ios';
  }
  // OTel-ийн sample ratio нь зөвхөн exporter тохируулагдсан БА оператор ratio-г
  // тодорхой зааж өгөөгүй үед 1.0 утгыг анхдагчаар авна.
  if (AppConfig.OTEL_SAMPLE_RATIO === 0 && AppConfig.OTEL_EXPORTER !== '') {
    AppConfig.OTEL_SAMPLE_RATIO = 1.0;
  }
}

/**
 * initializeAppConfig нь .env файл (байвал) болон process.env-ээс тохиргоог
 * уншиж, default-уудыг тавьж, дараа нь бүх шалгалтыг гүйцэтгэнэ. Алдаа гарвал
 * throw хийнэ — boot fail-closed байх ёстой.
 */
export function initializeAppConfig(): void {
  const fileEnv = loadEnvFiles();
  // process.env нь .env файлыг дардаг (12-factor: орчин нь тэргүүн эрхтэй).
  const src: Source = { ...fileEnv, ...process.env };
  const explicitlySet = (key: string): boolean =>
    Object.prototype.hasOwnProperty.call(fileEnv, key) ||
    Object.prototype.hasOwnProperty.call(process.env, key);

  Object.assign(AppConfig, blankConfig());

  AppConfig.PORT = num(src, 'PORT');
  AppConfig.ENVIRONMENT = str(src, 'ENVIRONMENT');
  AppConfig.DEBUG = bool(src, 'DEBUG');

  AppConfig.DB_POSTGRE_DRIVER = str(src, 'DB_POSTGRE_DRIVER');
  AppConfig.DB_POSTGRE_DSN = str(src, 'DB_POSTGRE_DSN');
  AppConfig.DB_POSTGRE_URL = str(src, 'DB_POSTGRE_URL');
  AppConfig.DB_MAX_OPEN_CONNS = num(src, 'DB_MAX_OPEN_CONNS');
  AppConfig.DB_MAX_IDLE_CONNS = num(src, 'DB_MAX_IDLE_CONNS');
  AppConfig.DB_CONN_MAX_LIFE_MINS = num(src, 'DB_CONN_MAX_LIFE_MINS');

  AppConfig.JWT_SECRET = str(src, 'JWT_SECRET');
  AppConfig.JWT_EXPIRED = num(src, 'JWT_EXPIRED');
  AppConfig.JWT_ISSUER = str(src, 'JWT_ISSUER');
  AppConfig.JWT_REFRESH_EXPIRED = num(src, 'JWT_REFRESH_EXPIRED');

  AppConfig.OTP_MAX_ATTEMPTS = num(src, 'OTP_MAX_ATTEMPTS');

  AppConfig.VERIFY_API_BASE = str(src, 'VERIFY_API_BASE');
  AppConfig.VERIFY_API_KEY = str(src, 'VERIFY_API_KEY');
  AppConfig.VERIFY_CHANNEL = str(src, 'VERIFY_CHANNEL');

  AppConfig.XYP_API_BASE = str(src, 'XYP_API_BASE');
  AppConfig.XYP_CLIENT_ID = str(src, 'XYP_CLIENT_ID');
  AppConfig.XYP_CLIENT_SECRET = str(src, 'XYP_CLIENT_SECRET');

  AppConfig.GSPACE_HOST = str(src, 'GSPACE_HOST');
  AppConfig.GSPACE_PORT = num(src, 'GSPACE_PORT');
  AppConfig.GSPACE_USER = str(src, 'GSPACE_USER');
  AppConfig.GSPACE_PASSWORD = str(src, 'GSPACE_PASSWORD');
  AppConfig.GSPACE_BASE_PATH = str(src, 'GSPACE_BASE_PATH');
  AppConfig.GSPACE_QUOTA_BYTES = num(src, 'GSPACE_QUOTA_BYTES');
  AppConfig.GSPACE_HOST_KEY = str(src, 'GSPACE_HOST_KEY');

  AppConfig.EID_BASE_URL = str(src, 'EID_BASE_URL');
  AppConfig.EID_RP_UUID = str(src, 'EID_RP_UUID');
  AppConfig.EID_RP_NAME = str(src, 'EID_RP_NAME');
  AppConfig.EID_RP_SECRET = str(src, 'EID_RP_SECRET');
  AppConfig.EID_CERT_LEVEL = str(src, 'EID_CERT_LEVEL');
  AppConfig.EID_CALLBACK_URL = str(src, 'EID_CALLBACK_URL');
  AppConfig.EID_DISPLAY_TEXT = str(src, 'EID_DISPLAY_TEXT');
  AppConfig.SIGN_RELAY_TOKEN = str(src, 'SIGN_RELAY_TOKEN');

  AppConfig.SIGN_SIGNER_CERT_FILE = str(src, 'SIGN_SIGNER_CERT_FILE');
  AppConfig.SIGN_SIGNER_KEY_FILE = str(src, 'SIGN_SIGNER_KEY_FILE');

  AppConfig.GOOGLE_CLIENT_ID = str(src, 'GOOGLE_CLIENT_ID');
  AppConfig.GOOGLE_CLIENT_SECRET = str(src, 'GOOGLE_CLIENT_SECRET');

  AppConfig.BCRYPT_COST = num(src, 'BCRYPT_COST');

  AppConfig.GEMINI_API_KEY = str(src, 'GEMINI_API_KEY');
  AppConfig.GEMINI_MODEL = str(src, 'GEMINI_MODEL');
  AppConfig.GEMINI_TTS_MODEL = str(src, 'GEMINI_TTS_MODEL');
  AppConfig.GEMINI_VOICE = str(src, 'GEMINI_VOICE');
  AppConfig.GEMINI_API_BASE = str(src, 'GEMINI_API_BASE');
  AppConfig.AI_SCOPE_PROMPT = str(src, 'AI_SCOPE_PROMPT');

  AppConfig.OTEL_EXPORTER = str(src, 'OTEL_EXPORTER');
  AppConfig.OTEL_SAMPLE_RATIO = num(src, 'OTEL_SAMPLE_RATIO');

  AppConfig.REDIS_HOST = str(src, 'REDIS_HOST');
  AppConfig.REDIS_PASS = str(src, 'REDIS_PASS');
  AppConfig.REDIS_EXPIRED = num(src, 'REDIS_EXPIRED');

  AppConfig.OBSERVABILITY_TOKEN = str(src, 'OBSERVABILITY_TOKEN');
  AppConfig.ALLOWED_ORIGINS = str(src, 'ALLOWED_ORIGINS');
  AppConfig.TRUSTED_PROXIES = str(src, 'TRUSTED_PROXIES');
  AppConfig.INTEGRATION_ENC_KEY = str(src, 'INTEGRATION_ENC_KEY');

  AppConfig.CORE_API_BASE = str(src, 'CORE_API_BASE');
  AppConfig.CORE_API_TOKEN = str(src, 'CORE_API_TOKEN');
  AppConfig.SUPERADMIN_EMAIL = str(src, 'SUPERADMIN_EMAIL');

  AppConfig.SSO_ISSUER = str(src, 'SSO_ISSUER');
  AppConfig.SSO_CLIENT_ID = str(src, 'SSO_CLIENT_ID');
  AppConfig.SSO_CLIENT_SECRET = str(src, 'SSO_CLIENT_SECRET');
  AppConfig.SSO_REDIRECT_URI = str(src, 'SSO_REDIRECT_URI');
  AppConfig.SSO_SCOPE = str(src, 'SSO_SCOPE');
  AppConfig.SSO_NATIVE_CLIENT_ID = str(src, 'SSO_NATIVE_CLIENT_ID');
  AppConfig.SSO_EID_PROXY_BASE_URL = str(src, 'SSO_EID_PROXY_BASE_URL');

  AppConfig.RELAY_DEMO_MODE = bool(src, 'RELAY_DEMO_MODE');

  AppConfig.OAUTH_ISSUER = str(src, 'OAUTH_ISSUER');
  AppConfig.SSO_STATE_KEY = str(src, 'SSO_STATE_KEY');
  AppConfig.SSO_FIRSTPARTY_CLIENTS = str(src, 'SSO_FIRSTPARTY_CLIENTS');
  AppConfig.SSO_ADMIN_API_KEYS = str(src, 'SSO_ADMIN_API_KEYS');
  AppConfig.SSO_ADMIN_SUBS = str(src, 'SSO_ADMIN_SUBS');

  applyDefaults(explicitlySet);

  // шалгалт
  if (
    AppConfig.PORT === 0 ||
    AppConfig.ENVIRONMENT === '' ||
    AppConfig.JWT_SECRET === '' ||
    AppConfig.JWT_EXPIRED === 0 ||
    AppConfig.JWT_ISSUER === '' ||
    AppConfig.REDIS_HOST === '' ||
    AppConfig.REDIS_PASS === '' ||
    AppConfig.REDIS_EXPIRED === 0 ||
    AppConfig.DB_POSTGRE_DRIVER === ''
  ) {
    throw ErrEmptyVar;
  }

  if (AppConfig.PORT < 1 || AppConfig.PORT > 65535) {
    throw new Error(`PORT must be between 1 and 65535, got ${AppConfig.PORT}`);
  }
  // ACCESS токены амьдрах хугацаа. Дээд хязгаарыг 24ц болгож бариулав: урт TTL
  // нь revocation-ийн цонхыг уртасгана. Урт сессийг refresh токен зохицуулна.
  if (AppConfig.JWT_EXPIRED < 1 || AppConfig.JWT_EXPIRED > 24) {
    throw new Error(`JWT_EXPIRED must be between 1 and 24 hours, got ${AppConfig.JWT_EXPIRED}`);
  }
  if (AppConfig.JWT_REFRESH_EXPIRED < 1 || AppConfig.JWT_REFRESH_EXPIRED > 365) {
    throw new Error(
      `JWT_REFRESH_EXPIRED must be between 1 and 365 days, got ${AppConfig.JWT_REFRESH_EXPIRED}`,
    );
  }
  if (AppConfig.JWT_SECRET.length < 32) {
    throw new Error(
      `JWT_SECRET must be at least 32 characters (got ${AppConfig.JWT_SECRET.length}) — HS256 requires 256-bit entropy`,
    );
  }
  if (AppConfig.REDIS_EXPIRED < 1) {
    throw new Error(`REDIS_EXPIRED must be at least 1 minute, got ${AppConfig.REDIS_EXPIRED}`);
  }
  if (
    AppConfig.DB_MAX_OPEN_CONNS < 1 ||
    AppConfig.DB_MAX_IDLE_CONNS < 0 ||
    AppConfig.DB_MAX_IDLE_CONNS > AppConfig.DB_MAX_OPEN_CONNS
  ) {
    throw new Error(
      `invalid DB pool config: open=${AppConfig.DB_MAX_OPEN_CONNS} idle=${AppConfig.DB_MAX_IDLE_CONNS}`,
    );
  }
  if (AppConfig.OTP_MAX_ATTEMPTS < 1) {
    throw new Error(`OTP_MAX_ATTEMPTS must be >= 1, got ${AppConfig.OTP_MAX_ATTEMPTS}`);
  }
  // bcrypt-ийн cost хязгаар нь 4..31; Go template 10..31-ийг шаарддаг.
  if (AppConfig.BCRYPT_COST < 10 || AppConfig.BCRYPT_COST > 31) {
    throw new Error(`BCRYPT_COST must be between 10 and 31, got ${AppConfig.BCRYPT_COST}`);
  }

  switch (AppConfig.ENVIRONMENT) {
    case EnvironmentDevelopment:
      if (AppConfig.DB_POSTGRE_DSN === '') throw ErrEmptyVar;
      break;
    case EnvironmentProduction: {
      if (AppConfig.DB_POSTGRE_URL === '') throw ErrEmptyVar;
      // secure_system_guide §3.5: production-д DB холболт заавал баталгаажсан
      // TLS-тэй байх ёстой. sslmode=verify-full нь server сертификатыг CA +
      // hostname-ээр шалгаж MITM-аас хамгаална; disable/require/allow/prefer нь
      // сертификатыг шалгахгүй тул production-д хориглоно.
      const mode = sslModeOf(AppConfig.DB_POSTGRE_URL);
      if (mode !== 'verify-full' && mode !== 'verify-ca') {
        throw new Error(
          `production DB_POSTGRE_URL must use sslmode=verify-full (got "${mode}") — secure_system_guide §3.5`,
        );
      }
      if (AppConfig.ALLOWED_ORIGINS === '') {
        throw new Error('ALLOWED_ORIGINS must be set in production (comma-separated origins)');
      }
      // Бүх email/SMS OTP нь GeregeCloud Verify-ээр явдаг тул production-д
      // VERIFY_API_KEY заавал шаардлагатай.
      if (AppConfig.VERIFY_API_KEY === '') {
        throw new Error('VERIFY_API_KEY must be set in production (GeregeCloud Verify OTP)');
      }
      break;
    }
    default:
      throw new Error(
        `ENVIRONMENT must be 'development' or 'production', got "${AppConfig.ENVIRONMENT}"`,
      );
  }
}
