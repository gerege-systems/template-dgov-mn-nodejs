// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Session давхарга. Токен нь httpOnly cookie-д тул SPA түүнийг ХАРАХГҮЙ —
// "нэвтэрсэн эсэх" нь `GET /users/me`-ийн хариугаар л тодорхойлогдоно.
// Хариуг TanStack Query нэг удаа татаж кэшилдэг тул хуудас солиход дахин
// хүсэлт явахгүй.

import React, { createContext, useContext } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { ApiError, getJSON } from './client';
import { toSessionUser, type BackendUser, type SessionUser } from './types';

/** meQueryKey нь session кэшийн түлхүүр (гарах үед цэвэрлэнэ). */
export const meQueryKey = ['session', 'me'] as const;
/** permissionsQueryKey нь RBAC эрхийн кэшийн түлхүүр. */
export const permissionsQueryKey = ['session', 'permissions'] as const;

/**
 * fetchMe нь одоогийн session-ийг уншина. 401 нь "нэвтрээгүй" — АЛДАА БИШ
 * (null буцна) тул хамгаалалтын давхарга түүнийг нэвтрэх хуудас руу чиглүүлнэ.
 */
async function fetchMe(): Promise<SessionUser | null> {
  try {
    // ⚠️ `GET /users/me` нь дугтуйн `data`-г ДАХИН нэг давхар боодог:
    //     { status, message, data: { user: { … } }, request_id }
    // `getJSON` нь `data`-г буцаадаг тул ЭНД `.user`-ыг задлах ёстой. Үүнийг
    // алгасвал талбар бүр `undefined` болж, UI нь хоосон нэр · "?" аватар ·
    // хоосон и-мэйл харуулна — 401 ч биш, алдаа ч биш, зүгээр л хоосон.
    const res = await getJSON<{ user: BackendUser }>('/users/me');
    return toSessionUser(res.user);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return null;
    throw err;
  }
}

/** fetchPermissions нь нэвтэрсэн хэрэглэгчийн RBAC эрхүүдийг уншина. */
async function fetchPermissions(): Promise<string[]> {
  try {
    const res = await getJSON<{ permissions?: string[] }>('/rbac/me');
    return res.permissions ?? [];
  } catch {
    // Эрх уншиж чадсангүй — хоосон (fail-closed: UI юу ч нээхгүй).
    return [];
  }
}

interface SessionValue {
  me: SessionUser | null;
  loading: boolean;
  /** refresh нь session-ийг дахин уншина (профайл зассаны дараа г.м.). */
  refresh: () => Promise<void>;
  /** clear нь кэшийг цэвэрлэнэ (гарсны дараа). */
  clear: () => void;
}

const SessionContext = createContext<SessionValue>({
  me: null,
  loading: true,
  refresh: async () => undefined,
  clear: () => undefined,
});

/** SessionProvider нь session-ийг НЭГ удаа татаж бүх дэд модульд түгээнэ. */
export function SessionProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const qc = useQueryClient();
  const query: UseQueryResult<SessionUser | null> = useQuery({
    queryKey: meQueryKey,
    queryFn: fetchMe,
    staleTime: 60_000,
    retry: false,
  });

  const value: SessionValue = {
    me: query.data ?? null,
    loading: query.isLoading,
    refresh: async () => {
      // Нэвтрэлт дуусмагц энэ функц session-ийг ЗААВАЛ ШИНЭЭР уншина.
      //
      // `invalidateQueries` хангалтгүй: тэр нь зөвхөн "хуучирсан" гэж тэмдэглэдэг.
      // Мөн зүгээр `refetchQueries` ч эрсдэлтэй — callback хуудас ачаалагдах үед
      // `GET /users/me` НИСЛЭГТ явж байсан (тэр үед cookie хараахан тавигдаагүй
      // тул 401 буцаана). Тэр хуучин хариу дараа нь ирж кэшийг `null` болгож
      // дарж бичвэл RequireAuth хэрэглэгчийг login руу буцаана — яг л
      // "нэвтэрсэн атлаа нэвтрээгүй" гацаа.
      //
      // Тиймээс эхлээд нислэгт байгааг ЦУЦАЛЖ (үр дүнг нь үл тоомсорлож),
      // дараа нь шинэ хүсэлт явуулж дуустал хүлээнэ.
      await qc.cancelQueries({ queryKey: meQueryKey });
      await qc.refetchQueries({ queryKey: meQueryKey });
    },
    clear: () => {
      qc.setQueryData(meQueryKey, null);
      qc.removeQueries({ queryKey: permissionsQueryKey });
    },
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** useSession нь одоогийн session-ийг (болон ачаалж буй эсэхийг) буцаана. */
export const useSession = (): SessionValue => useContext(SessionContext);

/**
 * useMe нь ЗААВАЛ нэвтэрсэн хуудсанд хэрэглэгчийг буцаана. Хамгаалалтын
 * давхарга (RequireAuth) нэвтрээгүй үед энэ хүртэл хүргэдэггүй.
 */
export function useMe(): SessionUser {
  const { me } = useSession();
  if (!me) throw new Error('useMe: session байхгүй — RequireAuth дотор хэрэглэнэ үү');
  return me;
}

/** usePermissions нь RBAC эрхийн жагсаалтыг (кэштэй) буцаана. */
export function usePermissions(): string[] {
  const { me } = useSession();
  const query = useQuery({
    queryKey: permissionsQueryKey,
    queryFn: fetchPermissions,
    enabled: me !== null,
    staleTime: 60_000,
  });
  return query.data ?? [];
}
