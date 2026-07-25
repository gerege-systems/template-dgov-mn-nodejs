// Нууц үгийн хүчийг client талд үнэлэх — backend-ийн `strongpassword` дүрэмтэй
// тэгшитгэсэн: доод тал нь 12 тэмдэгт + том + жижиг үсэг + тоо + тусгай тэмдэгт.
// Энэ нь зөвхөн UX-ийн санал хүсэлт; эцсийн шийдвэрийг backend гаргана (422).

export interface PasswordChecks {
  length: boolean; // ≥ 12 тэмдэгт
  lower: boolean;  // жижиг үсэг
  upper: boolean;  // том үсэг
  number: boolean; // тоо
  special: boolean; // тусгай тэмдэгт
}

export type PasswordLevel = 'weak' | 'fair' | 'strong';

export interface PasswordStrength {
  checks: PasswordChecks;
  /** Хангасан шалгуурын тоо (0–5). */
  metCount: number;
  /** Бүх 5 шалгуур хангагдсан эсэх — backend хүлээн авах нөхцөл. */
  valid: boolean;
  level: PasswordLevel;
  /** Монгол шошго (UI-д харуулах). */
  label: string;
}

/** Тус бүрийн объектив шалгуурыг тооцоолно. */
export function passwordChecks(pw: string): PasswordChecks {
  return {
    length: pw.length >= 12,
    lower: /[a-z]/.test(pw),
    upper: /[A-Z]/.test(pw),
    number: /[0-9]/.test(pw),
    // Үсэг/тоо/хоосон зайнаас бусад бүх тэмдэгтийг тусгай гэж үзнэ.
    special: /[^A-Za-z0-9\s]/.test(pw),
  };
}

/**
 * Шалгуурын үр дүнг хэрэглэгчид ойлгомжтой түвшин/шошго болгоно.
 *
 * Энэ нь UX-ийн шийдэл — хэр чанга/уян болгох вэ гэдгийг энд тохируулна.
 * Одоогийн бодлого: 5-аас бага шалгуур = weak, 4 = fair, бүгд = strong.
 */
export function evaluatePassword(pw: string): PasswordStrength {
  const checks = passwordChecks(pw);
  const metCount = Object.values(checks).filter(Boolean).length;
  const valid = metCount === 5;

  let level: PasswordLevel;
  let label: string;
  if (pw.length === 0) {
    level = 'weak';
    label = '';
  } else if (valid) {
    level = 'strong';
    label = 'Хүчтэй';
  } else if (metCount >= 4) {
    level = 'fair';
    label = 'Дунд зэрэг';
  } else {
    level = 'weak';
    label = 'Сул';
  }

  return { checks, metCount, valid, level, label };
}
