// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// AI prompt давхаргын зөвшөөрөгдсөн түлхүүрүүд. Suurь (base) дүрэм кодод
// хатуу бичигдсэн — DB-ээс зөвхөн эдгээр давхарга тохируулагдана.

/**
 * AIPromptScope нь туслахын ХАМРАХ ХҮРЭЭ — ямар сэдвээр туслахыг
 * тодорхойлно; хүрээнээс гадуурх асуултад туслах татгалздаг.
 */
export const AIPromptScope = 'scope';

/** AIPromptInstructions нь нэмэлт заавар (өнгө аяс, онцлох дүрэм г.м.). */
export const AIPromptInstructions = 'instructions';

/** AIPromptKeys нь зөвшөөрөгдсөн давхаргын жагсаалт (validation-д). */
export const AIPromptKeys: readonly string[] = [AIPromptScope, AIPromptInstructions];

/**
 * AIPrompt нь DB-д хадгалагддаг, ажиллаж байх үед тохируулж болдог нэг
 * prompt давхарга.
 */
export interface AIPrompt {
  key: string;
  content: string;
  updatedAt: Date | null;
}

/** AIKnowledge нь AI туслахын хайдаг мэдлэгийн сангийн нэг бичлэг. */
export interface AIKnowledge {
  id: number;
  title: string;
  content: string;
  tags: string[];
}
