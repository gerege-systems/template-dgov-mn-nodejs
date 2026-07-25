// eID based AI enabled Government Template Platform V3.0
// OIDC provider (RP-facing) дэлгэцүүд — dan-ий ӨӨРИЙН дизайн (SigninShell: брэнд
// topbar + төвлөрсөн signin-card). dan-ий апп login (/login)-той ижил төрх.
import type { ReactNode } from 'react';
import SigninShell from '@/components/SigninShell';

export default function OAuthLayout({ children }: { children: ReactNode }) {
  return <SigninShell>{children}</SigninShell>;
}
