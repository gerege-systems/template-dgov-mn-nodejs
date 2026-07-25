"use client";

import React from 'react';
import { LogOut } from 'lucide-react';
import { signOut } from '@/lib/signout';

/** Энэ төхөөрөмж дээрх сессийг хаах товч (server component-д ашиглах client wrapper). */
export default function SignOutButton({ label = 'Энэ төхөөрөмжөөс гарах' }: { label?: string }) {
  return (
    <button className="btn btn--danger" type="button" onClick={() => signOut()}>
      <LogOut size={16} strokeWidth={2} />
      <span>{label}</span>
    </button>
  );
}
