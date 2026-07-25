import React from 'react';
import AreaShell from '@/components/AreaShell';

export const dynamic = 'force-dynamic';

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return <AreaShell next="/manager/dashboard">{children}</AreaShell>;
}
