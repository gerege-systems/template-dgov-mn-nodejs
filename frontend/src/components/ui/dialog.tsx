"use client";

import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// Хөнгөн, хараат бус (radix/tailwind-гүй) modal — Gerege-ийн CSS хувьсагчдаар
// загварчилсан. radix Dialog-ийн API гадаргууг (Dialog/Trigger/Content/Header/
// Title/Description) хадгална — тиймээс DriveFiles/DropboxFiles-ийг өөрчлөхгүй
// ашиглана. Контролтой (open + onOpenChange) ажиллана.

interface DialogCtx {
  open: boolean;
  setOpen: (o: boolean) => void;
}
const Ctx = React.createContext<DialogCtx | null>(null);

function useDialogCtx(): DialogCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('Dialog дэд бүрэлдэхүүнийг <Dialog> дотор ашиглана уу.');
  return ctx;
}

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={{ open, setOpen: onOpenChange }}>{children}</Ctx.Provider>;
}

// asChild — radix-тэй нийцтэй байхын тулд ганц child element-д onClick холбоно.
export function DialogTrigger({
  children,
}: {
  asChild?: boolean;
  children: React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>;
}) {
  const ctx = useDialogCtx();
  return React.cloneElement(children, {
    onClick: (e: React.MouseEvent) => {
      children.props.onClick?.(e);
      ctx.setOpen(true);
    },
  });
}

export function DialogContent({
  className,
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const ctx = useDialogCtx();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!ctx.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ctx.setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [ctx.open, ctx]);

  if (!ctx.open || !mounted) return null;

  return createPortal(
    <div className="dlg-overlay" onClick={() => ctx.setOpen(false)}>
      <div
        className={`dlg-content${className ? ` ${className}` : ''}`}
        style={style}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="dlg-close"
          onClick={() => ctx.setOpen(false)}
          aria-label="Хаах"
        >
          <X size={16} />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function DialogHeader({ children }: { children: React.ReactNode }) {
  return <div className="dlg-header">{children}</div>;
}

export function DialogTitle({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <h2 className="dlg-title" style={style}>
      {children}
    </h2>
  );
}

export function DialogDescription({ children }: { children: React.ReactNode }) {
  return <p className="dlg-desc">{children}</p>;
}
