// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Docker HEALTHCHECK-д зориулсан жижиг binary — curl/wget суулгах шаардлагагүй
// (distroless/slim image-д тэдгээр байхгүй). /health-д хүрч 200 авбал 0, эс
// бөгөөс 1 кодоор гарна.

const port = process.env.PORT ?? '8080';
const url = `http://127.0.0.1:${port}/health`;

const timeout = AbortSignal.timeout(3_000);

try {
  const res = await fetch(url, { signal: timeout });
  process.exit(res.ok ? 0 : 1);
} catch {
  process.exit(1);
}
