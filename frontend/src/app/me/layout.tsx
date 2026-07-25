import React from 'react';
import AreaShell from '@/components/AreaShell';

export const dynamic = 'force-dynamic';

export default function MeLayout({ children }: { children: React.ReactNode }) {
  return <AreaShell next="/me/dashboard">{children}</AreaShell>;
}
