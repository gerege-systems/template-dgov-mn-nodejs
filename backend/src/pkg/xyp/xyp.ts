// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// pkg/xyp нь Gerege Verify (xyp.dgov.mn) байгууллагын лавлагаа API-гийн client.
// Улсын бүртгэлээс (ХУР) байгууллагын мэдээллийг реал-тайм авдаг — RP нь HTTP
// Basic Auth-аар (client_id:client_secret) хандана. Энэ үйлчилгээ зөвхөн эрх
// бүхий client-д мэдээлэл өгдөг тул креденшлийг ЗӨВХӨН серверийн тал хадгална.
//
//   POST /v1/org/lookup  {reg_no}  → {found, organization:{...}}
//   Auth: Authorization: Basic base64(client_id:client_secret)

/** ErrXypNotConfigured нь client_id/secret тохируулаагүй үед буцна. */
export class ErrXypNotConfigured extends Error {
  constructor() {
    super('xyp: client credentials not configured (XYP_CLIENT_ID/XYP_CLIENT_SECRET)');
    this.name = 'ErrXypNotConfigured';
  }
}

/** ErrXypNotFound нь тухайн регистрийн дугаартай байгууллага олдоогүй үед буцна. */
export class ErrXypNotFound extends Error {
  constructor() {
    super('xyp: organization not found');
    this.name = 'ErrXypNotFound';
  }
}

const defaultBase = 'https://xyp.dgov.mn';
const maxRespBytes = 128 << 10;
const httpTimeoutMs = 15_000;

/** Founder нь байгууллагын үүсгэн байгуулагч (иргэн эсвэл хуулийн этгээд). */
export interface Founder {
  name: string;
  reg_no: string;
  /** Иргэн | Хуулийн этгээд */
  type: string;
  share_percent: string;
}

/** StakeHolder нь байгууллагын хувь эзэмшигч / ТУЗ-ийн гишүүн. */
export interface StakeHolder {
  name: string;
  reg_no: string;
  position: string;
}

/** Organization нь /v1/org/lookup-ийн байгууллагын блок. */
export interface Organization {
  reg_no: string;
  name: string;
  type: string;
  capital: string;
  ceo: string;
  ceo_reg_no: string;
  ceo_position: string;
  phone: string;
  address: string;
  industry: string[];
  founders: Founder[];
  stake_holders: StakeHolder[];
}

/** Lookuper нь байгууллагын лавлагааны хийсвэрлэл (тестэд mock тавихад хялбар). */
export interface Lookuper {
  /** lookup нь reg_no-гоор байгууллагыг буцаана. Олдоогүй бол ErrXypNotFound. */
  lookup(regNo: string, signal?: AbortSignal): Promise<Organization>;
}

interface LookupWire {
  found?: boolean;
  organization?: Partial<Organization> | null;
}

/** snippet нь алдааны мессежид тавих хариуны эхний 200 тэмдэгт. */
function snippet(raw: string): string {
  const s = raw.trim();
  return s.length > 200 ? s.slice(0, 200) : s;
}

/** normalize нь дутуу талбартай хариуг бүрэн Organization болгоно. */
function normalize(o: Partial<Organization>): Organization {
  return {
    reg_no: o.reg_no ?? '',
    name: o.name ?? '',
    type: o.type ?? '',
    capital: o.capital ?? '',
    ceo: o.ceo ?? '',
    ceo_reg_no: o.ceo_reg_no ?? '',
    ceo_position: o.ceo_position ?? '',
    phone: o.phone ?? '',
    address: o.address ?? '',
    industry: o.industry ?? [],
    founders: o.founders ?? [],
    stake_holders: o.stake_holders ?? [],
  };
}

class XypClient implements Lookuper {
  private readonly base: string;

  constructor(
    base: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {
    this.base = (base === '' ? defaultBase : base).replace(/\/+$/, '');
  }

  async lookup(regNo: string, signal?: AbortSignal): Promise<Organization> {
    // Креденшлгүй bootstrap-ыг зөвшөөрнө — XYP-гүйгээр апп асаж болно.
    if (this.clientId === '' || this.clientSecret === '') throw new ErrXypNotConfigured();
    const trimmed = regNo.trim();
    if (trimmed === '') throw new Error('xyp: reg_no хоосон байна');

    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`, 'utf8').toString('base64');
    const timeout = AbortSignal.timeout(httpTimeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    let res: Response;
    try {
      res = await fetch(`${this.base}/v1/org/lookup`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ reg_no: trimmed }),
        signal: combined,
      });
    } catch (err) {
      throw new Error(`xyp: http: ${err instanceof Error ? err.message : String(err)}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const raw = buf.subarray(0, maxRespBytes).toString('utf8');
    if (res.status === 404) throw new ErrXypNotFound();
    if (res.status >= 300) throw new Error(`xyp lookup: status ${res.status}: ${snippet(raw)}`);

    let out: LookupWire;
    try {
      out = JSON.parse(raw) as LookupWire;
    } catch {
      throw new Error(`xyp lookup: invalid response: ${snippet(raw)}`);
    }
    // found=false нь "олдсонгүй" — 200-тай ирдэг тул статусаар нь шүүж болохгүй.
    if (out.found !== true || out.organization === undefined || out.organization === null) {
      throw new ErrXypNotFound();
    }
    return normalize(out.organization);
  }
}

/**
 * newXypClient нь XYP client үүсгэнэ. base хоосон бол өгөгдмөл (xyp.dgov.mn);
 * креденшл хоосон бол lookup нь ErrXypNotConfigured буцаана (boot-ыг эвдэхгүй).
 */
export const newXypClient = (base: string, clientId: string, clientSecret: string): Lookuper =>
  new XypClient(base, clientId, clientSecret);
