import { NextResponse } from 'next/server';
import { authedRaw } from '@/lib/api';

export const dynamic = 'force-dynamic';

// GET /api/gspace/download?name=... — файлыг татаж, browser руу дамжуулна.
// Токен зөвхөн server-тал ашиглагдана; хариу нь binary тул түүхий Response-оор.
export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get('name') ?? '';
  if (!name) {
    return NextResponse.json({ ok: false, status: 400, message: 'Файлын нэр дутуу' }, { status: 400 });
  }
  const res = await authedRaw(`/gspace/download?name=${encodeURIComponent(name)}`, { method: 'GET' });
  if (!res.ok) {
    return NextResponse.json({ ok: false, status: res.status, message: 'Файл татаж чадсангүй' }, { status: res.status });
  }
  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('Content-Type') ?? 'application/octet-stream',
      'Content-Disposition': res.headers.get('Content-Disposition') ?? `attachment; filename="${encodeURIComponent(name)}"`,
    },
  });
}
