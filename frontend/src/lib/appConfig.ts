// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { useQuery } from '@tanstack/react-query';

import { getJSON } from './client';

/**
 * AppConfig нь API-аас ирэх НУУЦ БИШ тохиргоо. BFF байхгүй тул build үед
 * шигтгэсэн env-ийн оронд ажиллах үед уншина — нэг дүрсийг олон орчинд
 * ашиглах боломж (12-factor).
 */
export interface PublicConfig {
  google_client_id: string;
  issuer: string;
  features: { google_login: boolean; sso: boolean; ai: boolean; sign: boolean };
  /** integrations нь аль гуравдагч талын үйлчилгээ ХОЛБОХ боломжтойг заана. */
  integrations: Record<string, boolean>;
}

const fallback: PublicConfig = {
  google_client_id: '',
  issuer: '',
  features: { google_login: false, sso: false, ai: false, sign: false },
  integrations: {},
};

/** useAppConfig нь нийтийн тохиргоог (кэштэй) буцаана. */
export function useAppConfig(): PublicConfig {
  const query = useQuery({
    queryKey: ['config'],
    queryFn: () => getJSON<PublicConfig>('/config'),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return query.data ?? fallback;
}
