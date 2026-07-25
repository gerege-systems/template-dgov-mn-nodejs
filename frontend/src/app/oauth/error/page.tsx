// eID based AI enabled Government Template Platform V3.0
// OIDC provider алдааны хуудас — Hydra URLS_ERROR энд чиглүүлнэ.
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function OAuthErrorPage(props: {
  searchParams: Promise<{ error?: string; error_description?: string }>;
}) {
  const sp = await props.searchParams;
  return (
    <section className="signin-card">
      <div className="form-grid">
        <div>
          <h1>Нэвтрэлтийн алдаа</h1>
          <p className="signin-card__lede" style={{ marginTop: 6, fontSize: 14 }}>
            {sp.error_description || sp.error || 'Тодорхойгүй алдаа'}
          </p>
        </div>
        <Link className="btn btn--secondary btn--lg btn--block" href="/">
          Нүүр хуудас руу буцах
        </Link>
      </div>
    </section>
  );
}
