// eID based AI enabled Government Template Platform V3.0
// OIDC provider алдааны хуудас — Hydra URLS_ERROR энд чиглүүлнэ.
import { Link, useSearchParams } from 'react-router-dom';


export default function OAuthErrorPage() {
  const [sp] = useSearchParams();
  return (
    <section className="signin-card">
      <div className="form-grid">
        <div>
          <h1>Нэвтрэлтийн алдаа</h1>
          <p className="signin-card__lede" style={{ marginTop: 6, fontSize: 14 }}>
            {sp.get('error_description') ?? sp.get('error') ?? 'Тодорхойгүй алдаа'}
          </p>
        </div>
        <Link className="btn btn--secondary btn--lg btn--block" to="/">
          Нүүр хуудас руу буцах
        </Link>
      </div>
    </section>
  );
}
