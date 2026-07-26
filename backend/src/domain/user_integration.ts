// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

/**
 * UserIntegration нь хэрэглэгчийн гуравдагч этгээдийн үйлчилгээтэй (Google
 * Drive/Meet, Dropbox) холбосон OAuth токеныг төлөөлнө.
 *
 * accessToken/refreshToken нь storage давхаргад ШИФРЛЭГДСЭН байдаг — домэйн нь
 * зөвхөн утгыг зөөдөг, шифрлэлтийг usecase давхарга хариуцна.
 */
export interface UserIntegration {
  id: string;
  userId: string;
  /** "google-drive" | "dropbox" | "google-meet" */
  provider: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}

/**
 * IntegrationProviders нь хүлээн зөвшөөрөх провайдерын id-ууд. Танихгүй утга
 * DB-д ХҮРЭХГҮЙ — эс бөгөөс жагсаалт хяналтгүй өснө.
 */
export const IntegrationProviders = new Set(['google-drive', 'dropbox', 'google-meet']);
