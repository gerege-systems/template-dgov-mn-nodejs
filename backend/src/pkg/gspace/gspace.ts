// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// pkg/gspace нь "Gerege Space" — апп-ын өөрийн SFTP хадгалалтын client.
//
// Хэрэглэгч бүр өөрийн хавтастай (basePath/users/<userId>/) бөгөөд квот
// шалгалт usecase давхаргад хийгдэнэ. OAuth-гүй: апп НЭГ SFTP данс (нууц
// env-д) ашиглаж, файлыг хэрэглэгч-тус-бүрийн ЗАМААР тусгаарлана. Тиймээс
// замын сегментийг ариутгах (safeSegment) нь энэ модулийн ХАМГИЙН чухал
// хамгаалалт — эс бөгөөс "../" агуулсан нэр өөр хэрэглэгчийн хавтас руу
// гарна.

import SftpClient from 'ssh2-sftp-client';
import { basename } from 'node:path/posix';
// ⚠️ ssh2 нь CommonJS модуль тул ESM-ээс НЭРЛЭСЭН импорт (`import { utils }`)
// ажиллах үед унана — TypeScript үүнийг барьдаггүй (тэр зөвхөн .d.ts-ийг хардаг).
// Default импортоор аваад задлах нь ганц найдвартай зам.
import ssh2 from 'ssh2';

const { utils: sshUtils } = ssh2;

/** ErrGSpaceNotConfigured нь SFTP host/user/password тохируулаагүй үед буцна. */
export class ErrGSpaceNotConfigured extends Error {
  constructor() {
    super('gspace: SFTP storage not configured');
    this.name = 'ErrGSpaceNotConfigured';
  }
}

/** FileInfo нь хэрэглэгчийн Gerege Space дахь нэг файл. */
export interface FileInfo {
  name: string;
  size: number;
  modTime: Date;
}

/** GSpaceConfig нь SFTP холболтын тохиргоо. */
export interface GSpaceConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  /** home-оос харьцангуй үндсэн хавтас (ж: "gerege-space"). */
  basePath: string;
  /**
   * hostKey — host-ийн хүлээгдэж буй нийтийн түлхүүр (authorized_keys/
   * known_hosts мөрийн формат). Тохируулбал host key-г ЗААВАЛ баталгаажуулна.
   */
  hostKey: string;
  /**
   * allowInsecureHostKey — hostKey хоосон үед host key-г шалгахгүй байхыг
   * зөвшөөрнө. ЗӨВХӨН development-д true; production-д hostKey заавал.
   */
  allowInsecureHostKey: boolean;
}

/** GSpaceClient нь SFTP хадгалалтын хийсвэрлэл (тестэд mock тавихад хялбар). */
export interface GSpaceClient {
  /** configured нь SFTP тохируулагдсан эсэхийг хэлнэ. */
  configured(): boolean;
  /** list нь хэрэглэгчийн файлуудыг буцаана (хавтас байхгүй бол хоосон). */
  list(userId: string): Promise<FileInfo[]>;
  /** usage нь хэрэглэгчийн нийт эзэлхүүнийг (байт) буцаана. */
  usage(userId: string): Promise<number>;
  /** upload нь файлыг хэрэглэгчийн хавтаст (байхгүй бол үүсгэж) бичнэ. */
  upload(userId: string, name: string, data: Buffer): Promise<void>;
  /** download нь файлын агуулгыг буцаана. */
  download(userId: string, name: string): Promise<Buffer>;
  /** deleteFile нь файлыг устгана. */
  deleteFile(userId: string, name: string): Promise<void>;
}

/**
 * safeSegment нь замын НЭГ сегментийг (файл/хэрэглэгч) аюулгүй болгоно —
 * зөвхөн суурь нэр, ".."/"/"-гүй. Энэ бол path-traversal-ийн эсрэг гол хаалт:
 * backslash-ийг урьдчилан slash болгож, Windows маягийн замыг ч барина.
 */
export function safeSegment(s: string): string {
  const normalized = s.trim().replaceAll('\\', '/');
  const base = basename(normalized);
  if (base === '.' || base === '..' || base === '/' || base === '') return '';
  return base;
}

/** joinPath нь POSIX замыг угсарна (SFTP сервер ҮРГЭЛЖ POSIX). */
const joinPath = (...parts: string[]): string => parts.filter((p) => p !== '').join('/');

class GSpaceClientImpl implements GSpaceClient {
  private readonly cfg: GSpaceConfig;

  constructor(cfg: GSpaceConfig) {
    this.cfg = {
      ...cfg,
      port: cfg.port === 0 ? 22 : cfg.port,
      basePath: cfg.basePath.trim() === '' ? 'gerege-space' : cfg.basePath,
    };
  }

  configured(): boolean {
    return this.cfg.host !== '' && this.cfg.user !== '' && this.cfg.password !== '';
  }

  private userDir(userId: string): string {
    return joinPath(this.cfg.basePath, 'users', safeSegment(userId));
  }

  /**
   * connectOptions нь ssh2-ийн холболтын тохиргоог бүрдүүлнэ. hostKey өгсөн бол
   * host key-г ЗААВАЛ баталгаажуулна (MITM-аас хамгаална); хоосон бөгөөд
   * allowInsecureHostKey=true (зөвхөн dev) бол шалгахгүй; аль нь ч биш бол алдаа.
   */
  private connectOptions(): SftpClient.ConnectOptions {
    const opts: SftpClient.ConnectOptions = {
      host: this.cfg.host,
      port: this.cfg.port,
      username: this.cfg.user,
      password: this.cfg.password,
      readyTimeout: 12_000,
    };

    const hk = this.cfg.hostKey.trim();
    if (hk !== '') {
      const parsed = sshUtils.parseKey(hk);
      if (parsed instanceof Error) {
        throw new Error(
          'gspace: GSPACE_HOST_KEY-г задлаж чадсангүй (authorized_keys формат байх ёстой)',
        );
      }
      const expected = parsed.getPublicSSH();
      opts.hostVerifier = (key: Buffer): boolean => key.equals(expected);
      return opts;
    }
    if (this.cfg.allowInsecureHostKey) return opts;
    throw new Error(
      'gspace: GSPACE_HOST_KEY тохируулаагүй — production-д SFTP host key заавал шаардлагатай (MITM-аас хамгаалах)',
    );
  }

  /** withSFTP нь холболт үүсгэж, fn-д client дамжуулаад ЗААВАЛ хаана. */
  private async withSFTP<T>(fn: (sc: SftpClient) => Promise<T>): Promise<T> {
    if (!this.configured()) throw new ErrGSpaceNotConfigured();
    const sc = new SftpClient();
    // Дуудлага бүрд шинэ холболт — файлын үйлдэл ховор тул pool шаардлагагүй.
    await sc.connect(this.connectOptions());
    try {
      return await fn(sc);
    } finally {
      await sc.end().catch(() => undefined);
    }
  }

  async list(userId: string): Promise<FileInfo[]> {
    return await this.withSFTP(async (sc) => {
      const dir = this.userDir(userId);
      let entries;
      try {
        entries = await sc.list(dir);
      } catch {
        // Хавтас хараахан үүсээгүй бол хоосон жагсаалт — АЛДАА БИШ.
        return [];
      }
      return entries
        .filter((e) => e.type === '-')
        .map((e) => ({ name: e.name, size: e.size, modTime: new Date(e.modifyTime) }));
    });
  }

  async usage(userId: string): Promise<number> {
    const files = await this.list(userId);
    return files.reduce((total, f) => total + f.size, 0);
  }

  async upload(userId: string, name: string, data: Buffer): Promise<void> {
    const fn = safeSegment(name);
    if (fn === '') throw new Error('gspace: invalid file name');
    await this.withSFTP(async (sc) => {
      const dir = this.userDir(userId);
      await sc.mkdir(dir, true);
      await sc.put(data, joinPath(dir, fn));
    });
  }

  async download(userId: string, name: string): Promise<Buffer> {
    const fn = safeSegment(name);
    if (fn === '') throw new Error('gspace: invalid file name');
    return await this.withSFTP(async (sc) => {
      const out = await sc.get(joinPath(this.userDir(userId), fn));
      if (Buffer.isBuffer(out)) return out;
      throw new Error('gspace: unexpected download result');
    });
  }

  async deleteFile(userId: string, name: string): Promise<void> {
    const fn = safeSegment(name);
    if (fn === '') throw new Error('gspace: invalid file name');
    await this.withSFTP((sc) => sc.delete(joinPath(this.userDir(userId), fn)));
  }
}

export const newGSpaceClient = (cfg: GSpaceConfig): GSpaceClient => new GSpaceClientImpl(cfg);
