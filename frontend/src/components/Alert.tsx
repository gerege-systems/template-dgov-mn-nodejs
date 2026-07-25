import React from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

type Kind = 'danger' | 'info' | 'success';

const ICON = {
  danger: AlertCircle,
  info: Info,
  success: CheckCircle2,
} as const;

/** Inline алдаа / мэдээлэл / амжилтын banner. globals.css дахь .alert ашиглана. */
export default function Alert({ kind, children }: { kind: Kind; children: React.ReactNode }) {
  const Icon = ICON[kind];
  return (
    <div className={`alert alert--${kind}`} role={kind === 'danger' ? 'alert' : 'status'}>
      <Icon size={16} strokeWidth={2} />
      <span>{children}</span>
    </div>
  );
}
