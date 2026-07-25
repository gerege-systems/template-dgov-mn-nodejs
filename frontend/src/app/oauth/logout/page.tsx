// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React from 'react';
import { useSearchParams } from 'react-router-dom';

import OAuthLogoutClient from './OAuthLogoutClient';

/** RP-initiated logout-ийн баталгаажуулах хуудас. */
export default function OAuthLogoutPage(): React.ReactElement {
  const [searchParams] = useSearchParams();
  return (
    <section className="signin-card" aria-labelledby="logout-title">
      <OAuthLogoutClient challenge={searchParams.get('logout_challenge') ?? ''} />
    </section>
  );
}
