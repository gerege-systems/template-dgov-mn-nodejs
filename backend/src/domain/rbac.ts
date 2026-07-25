// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Эрхийн (permission) түлхүүрүүд — migration 8-ийн seed-тэй таарна. Код доторх
// шалгалтууд эдгээр тогтмолыг ашиглана (мөр шууд бичихгүй). 'admin' role нь
// каталогийн БҮХ эрхийг автоматаар авдаг тул энд тусад нь бичигдээгүй.

/** admin/manager хяналтын самбар үзэх */
export const PermDashboardView = 'dashboard.view';
/** системийн тохиргоо удирдах */
export const PermSettingsManage = 'settings.manage';
/** хэрэглэгч жагсаах/role солих/идэвхжүүлэх */
export const PermUsersManage = 'users.manage';
/** RBAC: role/permission удирдах */
export const PermRolesManage = 'roles.manage';
/** энгийн хэрэглэгчийн өөрийн хэсэг */
export const PermPersonalView = 'personal.view';
/** manager-ийн хэсэг */
export const PermManagerView = 'manager.view';
/** API Gateway (services/routes/consumers/policies) удирдах */
export const PermGatewayManage = 'gateway.manage';
/** Хүсэлт дамжуулах / SLA хяналтын самбар үзэх */
export const PermRelayView = 'relay.view';
/** Relay platform/route чиглүүлэлт удирдах */
export const PermRelayManage = 'relay.manage';
/** Иргэний үйлчилгээний хүсэлт хянаж шийдвэрлэх (менежер) */
export const PermGovReview = 'gov.review';
/** Үйлчилгээний нэгдсэн регистр, once-only самбар үзэх */
export const PermRegistryView = 'registry.view';
/** Үйлчилгээний паспорт/нотолгоо/хувилбар удирдах */
export const PermRegistryManage = 'registry.manage';

/**
 * Permission нь эрхийн каталогийн нэг бичлэг (код дотор тодорхойлогдсон, зөвхөн
 * role-д онооно).
 */
export interface Permission {
  key: string;
  label: string;
  category: string;
}

/**
 * AllPermissions нь эрхийн каталог (seed + listPermissions-д ашиглана). label/
 * category нь admin UI-ийн RBAC matrix-д бүлэглэхэд зориулагдсан.
 */
export const AllPermissions: Permission[] = [
  { key: PermDashboardView, label: 'Хяналтын самбар үзэх', category: 'general' },
  { key: PermSettingsManage, label: 'Тохиргоо удирдах', category: 'general' },
  { key: PermUsersManage, label: 'Хэрэглэгч удирдах', category: 'administration' },
  { key: PermRolesManage, label: 'Эрх (role) удирдах', category: 'administration' },
  { key: PermManagerView, label: 'Менежерийн хэсэг', category: 'management' },
  { key: PermPersonalView, label: 'Хувийн хэсэг', category: 'personal' },
  { key: PermGatewayManage, label: 'API Gateway удирдах', category: 'administration' },
  { key: PermRelayView, label: 'SLA хяналтын самбар үзэх', category: 'administration' },
  {
    key: PermRelayManage,
    label: 'Хүсэлт дамжуулах чиглүүлэлт удирдах',
    category: 'administration',
  },
  { key: PermGovReview, label: 'Иргэний хүсэлт хянах', category: 'management' },
  { key: PermRegistryView, label: 'Үйлчилгээний регистр үзэх', category: 'administration' },
  { key: PermRegistryManage, label: 'Үйлчилгээний регистр удирдах', category: 'administration' },
];

/**
 * Role нь динамик эрх (RBAC). isSystem эрхүүдийг (admin/manager/user) устгаж/
 * түлхүүрийг нь өөрчилж болохгүй — seed-ээр тогтсон.
 */
export interface Role {
  id: number;
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date | null;
}
