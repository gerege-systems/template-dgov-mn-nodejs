// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { Application } from '../../../domain/application.js';

/**
 * ApplicationResponse нь админд харагдах апп. `secret` нь ЗӨВХӨН create/rotate/
 * set хариунд байна — бусад үед талбар огт ОРОХГҮЙ (хадгалагдсан нь hash).
 */
export interface ApplicationResponse {
  id: string;
  client_id: string;
  name: string;
  app_type: string;
  tags: string[];
  redirect_uris: string[];
  enabled: boolean;
  service_ids: string[];
  secret?: string;
  created_at: Date;
  updated_at?: Date;
}

export function applicationResponse(a: Application): ApplicationResponse {
  const out: ApplicationResponse = {
    id: a.id,
    client_id: a.clientId,
    name: a.name,
    app_type: a.appType,
    // null биш ҮРГЭЛЖ массив — клиент `.map` шууд дуудна.
    tags: a.tags,
    redirect_uris: a.redirectUris,
    enabled: a.enabled,
    service_ids: a.serviceIds,
    created_at: a.createdAt,
  };
  if (a.secret !== '') out.secret = a.secret;
  if (a.updatedAt !== null) out.updated_at = a.updatedAt;
  return out;
}

export const applicationListResponse = (list: Application[]): ApplicationResponse[] =>
  list.map(applicationResponse);
