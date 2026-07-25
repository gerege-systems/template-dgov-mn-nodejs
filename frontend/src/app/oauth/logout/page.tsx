// eID based AI enabled Government Template Platform V3.0
import OAuthLogoutClient from './OAuthLogoutClient';

export const dynamic = 'force-dynamic';

export default async function OAuthLogoutPage(props: {
  searchParams: Promise<{ logout_challenge?: string }>;
}) {
  const { logout_challenge: challenge } = await props.searchParams;
  return (
    <section className="signin-card" aria-labelledby="logout-title">
      <OAuthLogoutClient challenge={challenge ?? ''} />
    </section>
  );
}
