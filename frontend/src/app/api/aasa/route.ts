// Apple App Site Association (AASA) — iOS Universal Links. eID App2App-ийн буцах
// callback (/auth/eid/callback)-ыг TemplateApp (mn.gerege.temp) руу чиглүүлнэ:
// eID апп callback-ыг Safari-д UIApplication.open-ээр нээхэд iOS апп суусан бол
// browser-гүйгээр шууд апп руу route хийнэ. `/.well-known/apple-app-site-association`
// руу next.config rewrite-ээр холбогдоно (dot-folder-ийн оронд найдвартай).
export const dynamic = 'force-static';

const APP_ID = 'CQTHTD6YJQ.mn.gerege.temp'; // <TeamID>.<bundleId>

export async function GET() {
  const body = {
    applinks: {
      apps: [],
      details: [
        {
          appID: APP_ID,
          appIDs: [APP_ID],
          // eID буцах callback (query-тэй) — Universal Link-ээр апп руу.
          paths: ['/auth/eid/callback', '/auth/eid/callback?*', '/app/eid/callback*'],
          components: [
            { '/': '/auth/eid/callback', comment: 'eID App2App return' },
            { '/': '/auth/eid/callback', '?': { sessionId: '*' }, comment: 'eID return with session' },
            { '/': '/app/eid/callback*', comment: 'app callback bridge' },
          ],
        },
      ],
    },
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
  });
}
