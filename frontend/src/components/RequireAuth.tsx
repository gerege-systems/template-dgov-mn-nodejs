// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { usePermissions, useSession } from '@/lib/session';

/**
 * RequireAuth нь нэвтрээгүй хэрэглэгчийг нэвтрэх хуудас руу чиглүүлнэ. Session
 * нь httpOnly cookie-д тул "нэвтэрсэн эсэх"-ийг `GET /users/me`-ийн хариугаар
 * шийднэ — ачаалж дуустал юу ч харуулахгүй (гялсхийхээс сэргийлнэ).
 */
export function RequireAuth({ children }: { children?: React.ReactNode }): React.ReactElement | null {
  const { me, loading } = useSession();
  const location = useLocation();

  if (loading) return null;
  if (!me) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children ?? <Outlet />}</>;
}

/**
 * RequirePermission нь RBAC эрх шаардана. Эрхгүй бол нүүр рүү буцаана —
 * админ гадаргууг ил ХАРУУЛАХГҮЙ (жинхэнэ шалгалт нь backend талд).
 */
export function RequirePermission({
  permission,
  children,
}: {
  permission: string;
  children?: React.ReactNode;
}): React.ReactElement | null {
  const { me, loading } = useSession();
  const permissions = usePermissions();
  const location = useLocation();

  if (loading) return null;
  if (!me) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  // Эрхийн жагсаалт ачаалж дуустал хүлээнэ (хоосон бол түр хоосон).
  if (permissions.length === 0) return null;
  if (!permissions.includes(permission)) return <Navigate to="/" replace />;
  return <>{children ?? <Outlet />}</>;
}
