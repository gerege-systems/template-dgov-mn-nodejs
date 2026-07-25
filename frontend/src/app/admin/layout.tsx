import React from 'react';
import AreaShell from '@/components/AreaShell';

export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AreaShell next="/admin/dashboard">{children}</AreaShell>;
}
