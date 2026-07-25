// Government Template Platform V3.0
// Gerege Systems Development Team & Claude AI, 2026
//
// Government Template Platform V3.0 — «Цахим засаглалыг бүтээх суурь» нүүр
// (landing) хуудасны маркетингийн текст — mn / en хосоор. Апп-ын үндсэн dict
// (lib/i18n.ts)-ийг бөглөхгүйн тулд landing-ийн урт мөрүүдийг энд төвлөрүүлэв.
// Бүх түлхүүр хоёр хэлэнд адил байх ёстой (i18n.ts-тэй нэг зарчим).

export interface LandingCopy {
  /** Брэнд нэр (nav + footer). Хоосон бол 'Government Template Platform V3.0'. Theme-ээр солино. */
  brand?: string;
  nav: { features: string; security: string; tech: string; docs: string; login: string };
  hero: {
    badge: string;
    titleLead: string;
    titleAccent: string;
    titleTail: string;
    lede: string;
    ctaLogin: string;
    ctaExplore: string;
    stackLabel: string;
    stats: { value: string; label: string }[];
  };
  advantages: {
    heading: string;
    sub: string;
    eidTag: string;
    eidTitle: string;
    eidBody: string;
    googleTitle: string;
    googleBody: string;
    secTitle: string;
    secBody: string;
    ssoTitle: string;
    ssoBody: string;
    signTitle: string;
    signBody: string;
    consentTitle: string;
    consentBody: string;
  };
  tech: {
    heading: string;
    sub: string;
    backendTitle: string;
    backendBody: string;
    frontendTitle: string;
    frontendBody: string;
    aiTitle: string;
    aiBody: string;
    trustTitle: string;
    trustBadge: string;
    trustItems: string[];
  };
  everything: { heading: string; sub: string; items: { title: string; body: string }[] };
  cta: { title: string; sub: string; ctaLogin: string; ctaExplore: string; tagline: string };
  footer: { tagline: string; links: string[]; copyright: string };
}

const mn: LandingCopy = {
  brand: 'Government Template Platform V3.0',
  nav: { features: 'Боломжууд', security: 'Аюулгүй байдал', tech: 'Технологи', docs: 'Баримт', login: 'Нэвтрэх' },
  hero: {
    badge: 'Government Template Platform V3.0 · eID суурьтай · AI-жуулсан · Нээлттэй эх',
    titleLead: 'Цахим засаглалыг',
    titleAccent: 'бүтээх',
    titleTail: 'суурь',
    lede:
      'Government Template Platform V3.0 нь төрийн аливаа цахим үйлчилгээг дээр нь босгож болох, үйлдвэрлэлд бэлэн, аюулгүй байдлаар хатуужуулсан бүрэн стек. Цэвэр архитектур бүхий Go сервер, Next.js BFF нүүр, Gemini AI урсгал, eID нэвтрэлт — бүгд эхний өдрөөс нэгдмэл, туршигдсан хэлбэрээр бэлэн.',
    ctaLogin: 'Government SSO-оор нэвтрэх',
    ctaExplore: 'GitHub дээр үзэх',
    stackLabel: 'Дэмждэг стандартууд',
    stats: [
      { value: 'Clean Arch', label: 'Цэгцтэй, өргөтгөхөд бэлэн бүтэц' },
      { value: 'eID · OIDC', label: 'Цахим үнэмлэх + нээлттэй стандарт' },
      { value: 'AI', label: 'Gemini туслах суулгасан' },
    ],
  },
  advantages: {
    heading: 'Дээр нь бүтээхэд бэлэн, бат бөх суурь',
    sub: 'Иргэн төвтэй, өндөр найдвартай төрийн үйлчилгээний онцлог шаардлагад нийцүүлэн эхнээс нь нямбай, цэгцтэй бүтээв. Та үндсэн дэд бүтцийг бус, үнэ цэнийг л бүтээнэ.',
    eidTag: 'Баталгаажуулалт',
    eidTitle: 'Цахим үнэмлэхээр хормын дотор',
    eidBody:
      'Гар утасны цахим үнэмлэхийн апп руу шууд мэдэгдэл илгээх, эсвэл QR код уншуулан хормын дотор нэвтэрнэ. Нэг утсан дээр ч, компьютер-утас хослуулан ч ажиллана. Нэг ч нууц үг цээжлэх шаардлагагүй — бэлэн, найдвартай нэвтрэлт эхний өдрөөс.',
    googleTitle: 'Google холболт',
    googleBody:
      'Цахим үнэмлэхээрээ нэг удаа баталгаажуулж Google дансаа холбоно. Улмаар нэг товшилтоор, аюулгүй байдлаа огт алдалгүйгээр хурдан нэвтэрнэ.',
    secTitle: 'Өндөр түвшний хамгаалалт',
    secBody:
      'Нэвтрэлтийн түлхүүр зөвхөн серверт хадгалагдаж, хөтчийн код руу хэзээ ч ил гардаггүй. Давхар CSRF хамгаалалт, өгөгдлийн мөр бүрийн хандалтын хяналт (RLS), CSP/HSTS толгой, хүсэлтийн ухаалаг хязгаарлалтаар анхнаасаа бүрхэгдсэн.',
    ssoTitle: 'Нэгдсэн нэвтрэлтийн үйлчилгээ (SSO / OIDC)',
    ssoBody:
      'Платформ өөрөө OpenID Connect үйлчилгээ хангагч болж чадна. Холбогдсон аппликейшнүүд нэвтрэлтээ энэ суурьт даатган, хэрэглэгчийн баталгаажсан мэдээллийг олон улсын нээлттэй стандартаар аюулгүй хүлээн авна. Хэрэглэгч нэг л удаа нэвтэрч, холбогдсон бүх системд орно.',
    signTitle: 'Цахим гарын үсгийн зуучлал',
    signBody:
      'Холбогдсон системүүд платформын eID итгэмжлэлээр дамжуулан баримт бичигт цахим гарын үсэг (PAdES) зуруулж чадна — өөрсдөө тусад нь гэрчилгээ эзэмших шаардлагагүйгээр.',
    consentTitle: 'Зөвшөөрлийг санана',
    consentBody:
      'Аппликейшн бүр таны зөвшөөрлийг зөвхөн анх удаа асууна. Дараа нь дахин төвөг учруулахгүй — жигд, тасралтгүй туршлага.',
  },
  tech: {
    heading: 'Орчин үеийн, батжсан технологийн суурь дээр',
    sub: 'Хурд, найдвар, аюулгүй байдлыг эрхэмлэн, удаан насжих зарчмаар сонгосон бүрэлдэхүүн.',
    backendTitle: 'Сервер тал — Go, Clean Architecture',
    backendBody:
      'Цэвэр архитектур бүхий Go (chi · net/http) сервер, ORM-гүй гар бичмэл SQL (pgx) дээр PostgreSQL, Redis түргэн санах ой. Давхаргууд тод ялгаатай тул шинэ боломжийг эмх цэгцтэй нэмнэ. OAuth2/OIDC-ийг платформ өөрөө (өөрийн Go provider) хангадаг.',
    frontendTitle: 'Хэрэглэгчийн тал — Next.js BFF',
    frontendBody:
      'Хөтч зөвхөн өөрийн эх сурвалжтай харилцаж, серверийн тал нь дотоод системтэй холбогдоно (BFF загвар). Нэвтрэлтийн түлхүүр хэрэглэгчийн код руу хэзээ ч гардаггүй. TanStack Query өгөгдлийн давхарга, mn/en хос хэл, гэрэл/харанхуй загвар бэлэн.',
    aiTitle: 'Gemini хиймэл оюун туслах',
    aiBody:
      'SDK-гүй REST урсгал, серверийн талд ажиллах хэрэгслүүд (function calling), өгөгдлийн сангаас тохируулах цар хүрээ/зааврууд. Асуултад хариулж, шаардлагатай үед монгол хэлээр найдвартай нөөц хариу өгнө.',
    trustTitle: 'Найдварын баталгаа',
    trustBadge: 'ҮЙЛДВЭРЛЭЛД БЭЛЭН',
    trustItems: [
      'Цэвэр архитектур · ORM-гүй pgx SQL',
      'eID баталгаажуулалт + OAuth2/OIDC',
      'Түлхүүр зөвхөн серверт нууцлагдана',
      'Мөр бүрийн хандалтын хяналт (RLS)',
      'CSP · HSTS · CSRF · хязгаарлалт',
    ],
  },
  everything: {
    heading: 'Бүх боломж нэг суурин дээр',
    sub: 'Иргэн ба хөгжүүлэгчдэд эхний өдрөөс бэлэн — доороос нь дахин бүтээх шаардлагагүй.',
    items: [
      { title: 'eID нэвтрэлт', body: 'Регистрийн дугаараар иргэний апп руу мэдэгдэл, QR, App2App.' },
      { title: 'SSO / OIDC хангагч', body: 'Платформ өөрөө нэвтрэлт хангаж, RP-үүдийг холбоно.' },
      { title: 'Google холболт', body: 'Нэг удаа баталгаажуулснаар цаашид түргэн нэвтрэлт.' },
      { title: 'Цахим гарын үсэг', body: 'PAdES PDF гарын үсэг, eID зуучлалаар.' },
      { title: 'Gemini AI туслах', body: 'Чат, дуу хоолой, орчуулга — серверийн хэрэгслүүдтэй.' },
      { title: 'RBAC & супер админ', body: '4 түвшний эрх, динамик роль, аудит бүртгэл.' },
      { title: 'Хоёр хэл · загвар', body: 'Бүх дэлгэц mn/en, гэрэл/харанхуй горим.' },
      { title: 'Олон давхар хамгаалалт', body: 'RLS, CSP/HSTS, CSRF, хүсэлт бүрийн шалгалт.' },
    ],
  },
  cta: {
    title: 'Цахим засаглалаа өнөөдрөөс бүтээж эхэл',
    sub: 'Government Template Platform V3.0 нь дэд бүтцийг бэлэн болгож өгнө — та зөвхөн үйлчилгээгээ бүтээхэд анхаарна. eID-ээр нэвтэрч, бэлэн боломжуудыг өөрөө туршина уу.',
    ctaLogin: 'Government SSO-оор нэвтрэх',
    ctaExplore: 'GitHub дээр үзэх',
    tagline: 'Цэвэр архитектур · Нээлттэй стандарт · Найдвартай хамгаалалт',
  },
  footer: {
    tagline: 'Government Template Platform V3.0 — цахим засаглалыг бүтээх, үйлдвэрлэлд бэлэн суурь. Gerege Systems, 2026.',
    links: ['Үйлчилгээний нөхцөл', 'Нууцлалын бодлого', 'Холбоо барих'],
    copyright: '© 2026 Gerege Systems · Government Template Platform V3.0',
  },
};

const en: LandingCopy = {
  brand: 'Government Template Platform V3.0',
  nav: { features: 'Features', security: 'Security', tech: 'Technology', docs: 'Docs', login: 'Sign in' },
  hero: {
    badge: 'Government Template Platform V3.0 · eID-based · AI-enabled · Open Source',
    titleLead: 'The foundation to',
    titleAccent: 'build digital',
    titleTail: 'governance',
    lede:
      'Government Template Platform V3.0 is a production-ready, security-hardened full stack for building any digital-government service on top. A Clean-Architecture Go backend, a Next.js BFF frontend, a Gemini AI pipeline and eID sign-in — all wired together and ready from day one.',
    ctaLogin: 'Sign in with Government SSO',
    ctaExplore: 'View on GitHub',
    stackLabel: 'Standards supported',
    stats: [
      { value: 'Clean Arch', label: 'Layered, ready to extend' },
      { value: 'eID · OIDC', label: 'Electronic-ID + open standards' },
      { value: 'AI', label: 'Gemini assistant built in' },
    ],
  },
  advantages: {
    heading: 'A solid foundation, ready to build on',
    sub: 'Engineered from the ground up for the demands of citizen-centric, high-assurance government services — so you build value, not plumbing.',
    eidTag: 'Authentication',
    eidTitle: 'Instant eID sign-in',
    eidBody:
      'Push straight to the eID app or scan a QR — App2App on one device, reliable cross-device flows on two. Verified identity with no passwords to remember, working out of the box.',
    googleTitle: 'Google linking',
    googleBody:
      'Link your Google account once behind an eID verification, then sign in with a single tap — convenience without giving up assurance.',
    secTitle: 'Security hardened',
    secBody:
      'Tokens in httpOnly cookies (never exposed to browser JS), double CSRF defense, row-level security (RLS), CSP/HSTS headers and per-IP rate limiting — baked in, not bolted on.',
    ssoTitle: 'SSO provider for third parties (OAuth2 / OIDC)',
    ssoBody:
      'The platform itself can act as an OpenID Connect provider (a built-in Go provider). Relying applications (RPs) delegate sign-in to this foundation and receive verified user data as standard claims.',
    signTitle: 'Signature relay',
    signBody:
      'Third-party RPs can have documents e-signed (PAdES) through the platform’s eID RP credentials — without holding their own eID certificates.',
    consentTitle: 'Remembers consent',
    consentBody:
      'Each application asks for your consent only the first time. After that it never re-prompts — a smooth, uninterrupted experience.',
  },
  tech: {
    heading: 'On a modern, proven stack',
    sub: 'Components chosen for speed, reliability and security — and built to last.',
    backendTitle: 'Go backend · Clean Architecture',
    backendBody:
      'A Clean-Architecture Go (chi · net/http) backend with hand-written SQL (pgx, no ORM) over PostgreSQL and Redis caching. Clear layers make new features easy to add. OAuth2/OIDC is served by a built-in Go provider — no external OAuth server.',
    frontendTitle: 'Next.js frontend (BFF)',
    frontendBody:
      'The browser talks only to same-origin Next.js routes, which proxy to the backend server-side. Tokens never reach client JS. TanStack Query data layer, bilingual mn/en, light/dark themes — all included.',
    aiTitle: 'Gemini AI assistant',
    aiBody:
      'An SDK-free REST pipeline with server-side tools (function calling), DB-configurable scope/instructions and a resilient Mongolian fallback on failure.',
    trustTitle: 'Trust guarantees',
    trustBadge: 'PRODUCTION-READY',
    trustItems: [
      'Clean Architecture · no-ORM pgx SQL',
      'eID identity + OAuth2 / OpenID Connect',
      'httpOnly cookies · CSRF defense',
      'PostgreSQL row-level security (RLS)',
      'CSP · HSTS · rate limiting',
    ],
  },
  everything: {
    heading: 'Every capability on one foundation',
    sub: 'Ready for citizens and developers from day one — no need to rebuild the basics.',
    items: [
      { title: 'eID sign-in', body: 'Push to the citizen app by ID number, QR, App2App.' },
      { title: 'SSO / OIDC provider', body: 'The platform issues sign-in and connects RPs.' },
      { title: 'Google linking', body: 'Fast sign-in after an eID-verified first link.' },
      { title: 'Document signing', body: 'PAdES PDF signing via the eID relay.' },
      { title: 'Gemini AI assistant', body: 'Chat, voice, translation — with server-side tools.' },
      { title: 'RBAC & super admin', body: '4-role model, dynamic roles, hash-chained audit.' },
      { title: 'Bilingual · theming', body: 'Every screen mn/en, light/dark modes.' },
      { title: 'Security headers', body: 'RLS, CSP, HSTS, CSRF and origin checks.' },
    ],
  },
  cta: {
    title: 'Start building digital governance today',
    sub: 'Government Template Platform V3.0 gives you the infrastructure ready-made — so you focus only on your service. Sign in with eID and try the built-in capabilities yourself.',
    ctaLogin: 'Sign in with Government SSO',
    ctaExplore: 'View on GitHub',
    tagline: 'Clean Architecture · Open standards · Secure by design',
  },
  footer: {
    tagline: 'Government Template Platform V3.0 — a production-ready foundation for building digital governance. Gerege Systems, 2026.',
    links: ['Terms of Service', 'Privacy Policy', 'Contact'],
    copyright: '© 2026 Gerege Systems · Government Template Platform V3.0',
  },
};

export const landingCopy: Record<'mn' | 'en', LandingCopy> = { mn, en };
