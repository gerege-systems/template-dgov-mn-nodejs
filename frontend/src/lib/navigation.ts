// Навигацийн туслахууд — server ба client component-уудад хуваалцана.

/**
 * `?next=` redirect параметрийг зөвхөн дотоод зам байвал зөвшөөрнө. Энгийн
 * `startsWith('/')` шалгалт нь protocol-relative `//evil.com` болон `/\evil.com`
 * хаягуудыг гадагш чиглүүлж болзошгүй (open redirect). Тиймээс эдгээрийг
 * хассан внутренний зам биш бол `/`-руу буцаана.
 */
export function safeNext(next: unknown): string {
  return typeof next === 'string' &&
    next.startsWith('/') &&
    !next.startsWith('//') &&
    !next.startsWith('/\\')
    ? next
    : '/';
}
