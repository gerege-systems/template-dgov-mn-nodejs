import React from 'react';
import Link from 'next/link';
import { ServerCrash, RefreshCw } from 'lucide-react';
import SigninShell from './SigninShell';

/**
 * Backend түр хүрэхгүй (503/5xx) үед хамгаалагдсан хэсэгт харуулах бүрхүүл.
 * Сессиэ шатааж /login руу шидэхийн оронд (энэ нь давталт үүсгэдэг) энгийн
 * "дахин оролдох" мэдэгдэл харуулж, cookie-г хэвээр үлдээнэ.
 */
export default function BackendUnavailable() {
  return (
    <SigninShell>
      <section className="signin-card signin-card--narrow" style={{ textAlign: 'center' }}>
        <ServerCrash size={40} strokeWidth={1.75} style={{ color: 'var(--muted)', margin: '0 auto' }} aria-hidden="true" />
        <h1 style={{ marginTop: 12 }}>Түр холбогдож чадсангүй</h1>
        <p className="signin-card__lede" style={{ marginTop: 8 }}>
          Сервертэй холбогдоход түр саатал гарлаа. Хэсэг хугацааны дараа дахин
          оролдоно уу — таны нэвтрэлт хэвээр байна.
        </p>
        <Link className="btn btn--primary btn--lg btn--block" href="/me/dashboard" style={{ marginTop: 16 }}>
          <RefreshCw size={18} strokeWidth={2} />
          <span>Дахин оролдох</span>
        </Link>
      </section>
    </SigninShell>
  );
}
