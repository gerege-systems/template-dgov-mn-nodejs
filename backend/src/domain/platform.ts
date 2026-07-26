// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

/**
 * Платформын хандалтын горим.
 *
 * • `public` — SSO/eID-ээр баталгаажсан ХЭН Ч нэвтэрч болно; шинэ иргэнд данс
 *   автоматаар үүснэ.
 * • `private` — ЗӨВХӨН админаас урьдчилан бүртгэсэн (national_id/civil_id-ээр
 *   тохирох) иргэн нэвтэрнэ; бусдад данс үүсэхгүй.
 */
export const AccessModePublic = 'public';
export const AccessModePrivate = 'private';
