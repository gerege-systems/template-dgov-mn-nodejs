// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import net from 'node:net';

import { trustedProxiesList } from '../../config/config.js';
import type { Middleware, Request } from '../types.js';

interface CidrNet {
  /** Хаягийн эхлэл, байтаар (IPv4 = 4 байт, IPv6 = 16 байт). */
  base: Buffer;
  /** Префиксийн урт (бит). */
  bits: number;
}

let trustedNets: CidrNet[] | null = null;

/** ipToBuffer нь IPv4/IPv6 текст хаягийг байт болгоно (IPv4-mapped-ийг задална). */
function ipToBuffer(ip: string): Buffer | null {
  const trimmed = ip.trim().replace(/^\[|\]$/g, '');
  // ::ffff:1.2.3.4 хэлбэрийг IPv4 болгож хураана — Node нь IPv4 холболтыг ийм
  // хэлбэрээр өгдөг тул TRUSTED_PROXIES дахь энгийн IPv4 бичлэгтэй таарахгүй
  // байх алдааг энэ засна.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed);
  const value = mapped?.[1] ?? trimmed;

  if (net.isIPv4(value)) {
    const parts = value.split('.').map(Number);
    if (parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
    return Buffer.from(parts);
  }
  if (net.isIPv6(value)) return ipv6ToBuffer(value);
  return null;
}

function ipv6ToBuffer(ip: string): Buffer | null {
  const [head, tail] = ip.split('::') as [string, string | undefined];
  const headGroups = head === '' ? [] : head.split(':');
  const tailGroups = tail === undefined || tail === '' ? [] : tail.split(':');
  if (tail === undefined && headGroups.length !== 8) return null;
  const fillCount = 8 - headGroups.length - tailGroups.length;
  if (fillCount < 0) return null;
  const groups = [
    ...headGroups,
    ...Array<string>(tail === undefined ? 0 : fillCount).fill('0'),
    ...tailGroups,
  ];
  if (groups.length !== 8) return null;

  const buf = Buffer.alloc(16);
  for (let i = 0; i < 8; i += 1) {
    const g = groups[i] ?? '0';
    const n = Number.parseInt(g === '' ? '0' : g, 16);
    if (!Number.isInteger(n) || n < 0 || n > 0xffff) return null;
    buf.writeUInt16BE(n, i * 2);
  }
  return buf;
}

/**
 * trustedProxyNets нь TRUSTED_PROXIES config-г нэг удаа задлан CIDR жагсаалт
 * болгож кэшэлнэ. Дан IP-г /32 (IPv4) эсвэл /128 (IPv6) болгоно.
 */
function trustedProxyNets(): CidrNet[] {
  if (trustedNets !== null) return trustedNets;
  const nets: CidrNet[] = [];
  for (const rawEntry of trustedProxiesList()) {
    let entry = rawEntry.trim();
    if (entry === '') continue;
    if (!entry.includes('/')) {
      const buf = ipToBuffer(entry);
      if (!buf) continue;
      entry += buf.length === 4 ? '/32' : '/128';
    }
    const [addr, maskStr] = entry.split('/') as [string, string | undefined];
    const base = ipToBuffer(addr);
    const bits = Number(maskStr);
    if (!base || !Number.isInteger(bits) || bits < 0 || bits > base.length * 8) continue;
    nets.push({ base, bits });
  }
  trustedNets = nets;
  return nets;
}

/** resetTrustedProxyCache нь тестүүдэд config өөрчилсний дараа кэшийг цэвэрлэнэ. */
export function resetTrustedProxyCache(): void {
  trustedNets = null;
}

function ipInTrusted(ipStr: string, nets: CidrNet[]): boolean {
  const ip = ipToBuffer(ipStr);
  if (!ip) return false;
  for (const n of nets) {
    if (n.base.length !== ip.length) continue;
    let bitsLeft = n.bits;
    let ok = true;
    for (let i = 0; i < ip.length && bitsLeft > 0; i += 1) {
      const take = Math.min(8, bitsLeft);
      const mask = take === 8 ? 0xff : (0xff << (8 - take)) & 0xff;
      if (((ip[i] ?? 0) & mask) !== ((n.base[i] ?? 0) & mask)) {
        ok = false;
        break;
      }
      bitsLeft -= take;
    }
    if (ok) return true;
  }
  return false;
}

/**
 * clientIP нь хүсэлтийн жинхэнэ клиент IP-г аюулгүйгээр тодорхойлно.
 * X-Forwarded-For-д ЗӨВХӨН холболт өөрөө итгэмжит proxy (TRUSTED_PROXIES) байх
 * үед итгэнэ — тэр үед XFF-г баруунаас зүүн тийш гүйж, итгэмжит hop-уудыг
 * алгасаад анхны итгэмжгүй (= жинхэнэ клиент) хаягийг буцаана. Итгэмжит proxy
 * тохируулаагүй эсвэл peer итгэмжгүй бол холболтын хаягийг шууд буцаана —
 * ингэснээр халдагч XFF тавиад rate-limit/audit-г хуурч чадахгүй.
 */
export function clientIP(req: Request): string {
  const remote = (req.socket.remoteAddress ?? '').replace(/^::ffff:/i, '');
  const nets = trustedProxyNets();
  if (nets.length === 0 || !ipInTrusted(remote, nets)) return remote;

  const xff = req.get('x-forwarded-for');
  if (!xff) return remote;
  const parts = xff.split(',');
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const ip = (parts[i] ?? '').trim();
    if (ip === '') continue;
    if (ipInTrusted(ip, nets)) continue;
    return ip;
  }
  return remote;
}

/** clientIPMiddleware нь тодорхойлсон IP-г хүсэлтэд нэг удаа тооцоолж кэшэлнэ. */
export function clientIPMiddleware(): Middleware {
  return (req, _res, next) => {
    req.clientIp = clientIP(req);
    next();
  };
}
