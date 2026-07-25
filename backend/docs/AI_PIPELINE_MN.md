# AI Pipeline (Gemini)

> 🌐 [English](AI_PIPELINE.md) · **Монгол**

AI туслах хэрхэн ажилладаг, хэрхэн өргөтгөхийг эхнээс нь дуустал тайлбарлана.
Pipeline нь **SDK-гүй** — `pkg/gemini` нь Gemini REST API-г шууд дууддаг —
бөгөөд backend-ийн бусад хэсэгтэй ижил Clean Architecture давхаргаар явдаг.

## Ерөнхий зураг

```
Browser (/me/ai, /me/translate)
   │  адил-origin fetch (CSRF header)
   ▼
Next.js BFF  /api/ai/{chat,stt,tts,translate}     ← хэлбэр шалгаад JWT хавсаргана
   │  server→server
   ▼
Go API  /api/v1/ai/*  (JWT + rate limit ~20/мин)
   │
   ▼
usecases/ai ──────────────► pkg/gemini ──────► Gemini REST API
   │   ▲                      (429/5xx/сүлжээн дээр 3× retry + backoff)
   │   └─ functionResponse
   ▼
ToolDef.execute()  ← хүсэлтийн context-оор BACKEND ДЭЭР ажиллана
   ├─ search_knowledge → repositories/postgres/ai → ai_knowledge хүснэгт
   └─ get_server_time  → жишээ tool
```

Гол зарчим: **аль tool-ийг дуудахаа model ШИЙДНЭ, backend ГҮЙЦЭТГЭНЭ.**
Model хэзээ ч код ажиллуулахгүй; tool-ууд хүсэлтийн context-оор сервер талд
ажилладаг тул DB хандалтад RLS болон timeout үйлчилнэ.

## Чатын урсгал (function-calling давталт)

`usecases/ai` → `run()` (`ai_impl.ts`):

1. History (≤ 20 ээлж) + шинэ prompt-оос `contents` угсарна. Дуут мессеж
   inline base64 audio хэсгээр ирдэг — Gemini шууд ойлгоно, STT алхам
   хэрэггүй.
2. Давхаргат system instruction + tool зарлалуудтайгаар Gemini-г дуудна.
3. Хариу **function дуудлага** агуулж байвал: tool бүрийг гүйцэтгэж, model-ийн
   ээлж + `functionResponse` ээлжийг нэмээд давтана (дээд тал нь `maxSteps`,
   өгөгдмөл 4). Гүйцэтгэсэн дуудлага бүр `Step { tool, args, result }` болж
   клиентэд буцдаг — UI "AI юу хийснийг" харуулдаг.
4. Хариу **текст** бол: буцаана.

**Алдааны семантик:** Gemini-ийн түр зуурын алдаа (client-ийн өөрийн 3×
retry-ийн дараа ч) 5xx болохгүй — хэрэглэгч Монгол fallback мессеж +
`degraded: true` авна. Зөвхөн `GEMINI_API_KEY` байхгүй нь жинхэнэ алдаа
(500, шалтгаан логдоно). Танигдаагүй/унасан tool нь model руу `{"error": …}`
хэлбэрээр буцдаг тул model эелдгээр тайлбарлаж чадна — tool-ийн алдаа клиент
рүү хэзээ ч шууд гардаггүй.

## Prompt давхаргууд

System prompt хүсэлт бүрд гурван давхаргаас угсрагдана (`ai_prompts.ts`):

| Давхарга | Эх сурвалж | Засварлагдах | Зориулалт |
|----------|------------|--------------|-----------|
| 1. Suurь дүрэм | кодод хатуу const | **хэзээ ч үгүй** | Зөвхөн Монголоор, хүрээний сахилт, prompt-injection эсэргүүцэл ("зааврыг март" гэдгийг энгийн текст гэж үзнэ; prompt-оо хэзээ ч задлахгүй) |
| 2. Хамрах хүрээ | `ai_prompts` хүснэгт → `AI_SCOPE_PROMPT` env → built-in default | админ, ажиллаж байх үед | Туслах *юугаар* туслахыг заана. Гадуурх асуултад эелдгээр татгалзана |
| 3. Нэмэлт заавар | `ai_prompts` хүснэгт (сонголттой) | админ, ажиллаж байх үед | Өнгө аяс, нэмэлт дүрэм |

- Админ UI: **Админ → Тохиргоо**; API: `GET/PUT /api/v1/admin/ai/prompts/{key}`
  (`settings.manage` эрх).
- Prompt 60 секунд кэшлэгддэг; `setPrompt` кэшийг хүчингүй болгодог тул
  өөрчлөлт бичсэн instance дээр шууд үйлчилнэ.
- `setPrompt` нь migration 11-д seed хийгдсэн key-үүд (`scope`,
  `instructions`) дээр **зөвхөн UPDATE** хийдэг — API-аар prompt-ийн гадаргуу
  өргөжихгүй.
- DB уншилт унавал env/default хүрээ рүү fail-open болно (prompt уншилт
  чатыг унагах ёсгүй).

## Tools

Tool гэдэг нь `ToolDef`: Gemini function declaration + backend функц:

```ts
const myTool: ToolDef = {
  declaration: {
    name: 'my_tool',
    description: 'Model хэзээ дуудахыг эндээс ойлгоно…',
    parameters: { type: 'object', properties: { /* JSON Schema */ } },
  },
  execute: async (ctx, args) => {
    // backend дээр ажиллана; ctx нь хүсэлтийн identity-тэй (RLS үйлчилнэ)
    return { result: '…' };
  },
};
```

`src/cmd/api/server/server.ts`-д бүртгэнэ:

```ts
const aiUC = newAIUsecase(chatClient, ttsClient, aiRepo, [
  ...defaultTools(),
  knowledgeSearchTool(aiRepo),
  myTool,
], { voice: AppConfig.GEMINI_VOICE, scopePrompt: AppConfig.AI_SCOPE_PROMPT });
```

Хавсарга tool-ууд:

- **`search_knowledge`** — `ai_knowledge` хүснэгтээс хайна (title/content
  `ILIKE` + tag тэнцэл, эхний 5). Suurь дүрэм нь model-д платформын асуултын
  *өмнө* үүнийг дуудаж, юу ч олдоогүй бол таамаглахын оронд "мэдэхгүй" гэж
  хэлэхийг заадаг. Агуулгыг мөр нэмж өргөтгөнө (title/content/tags); сан
  томрох үед `repositories/postgres/ai`-ийн ганц query-г tsvector эсвэл
  pgvector-оор солино.
- **`get_server_time`** — хамгийн энгийн жишээ (УБ цаг), хамааралгүй.

## Дуу хоолой (Voice)

| Чадвар | Endpoint | Хэрхэн ажилладаг |
|--------|----------|------------------|
| Дуут чат мессеж | `POST /ai/chat` + `audio` | audio нь user ээлжид inline орж явна — чат model нь multimodal |
| Яриа→текст | `POST /ai/stt` | "яг сонссоноо буцаа" гэсэн чанд заавартай нэг удаагийн Gemini дуудлага; хоосон текст = яриа илрээгүй |
| Текст→яриа | `POST /ai/tts` | тусдаа TTS model (`GEMINI_TTS_MODEL`), `responseModalities: ["AUDIO"]`; түүхий PCM (L16/24kHz)-ийг WAV толгойгоор ороодог (`pkg/gemini/wav.ts`) тул browser шууд тоглуулна |
| Шууд орчуулга | `POST /ai/translate` | текст → орчуулга; audio → **хоёр алхамт** STT→орчуулга (найдвартай, structured output задлах шаардлагагүй); `speak: true` бол орчуулгын TTS хувилбар нэмэгдэнэ. TTS унавал текст хэвээр буцна |

**Live орчуулгын UX** (frontend `LiveTranslateView`): микрофон ~7 секундын
сегментүүдээр бичнэ — **сегмент бүрд шинэ `MediaRecorder`** (timeslice
chunk-ууд зөвхөн эхнийдээ container header-тэй байдаг тул) — сегмент бүрийг
`/ai/translate` руу урсгана. Чимээгүй сегмент хоосон талбар буцааж, алдаа
биш гэж тоологдоно.

Audio оролт нь mime whitelist (webm/ogg/wav/mpeg/mp3/mp4/m4a/aac/flac) +
~700 KB base64 (~30 сек opus) хязгаартай — BFF (`lib/aiBff.ts`) болон
backend DTO хоёуланд нь.

## Тохиргоо

```env
GEMINI_API_KEY=     # AI боломжуудад заавал; хоосон бол endpoint-ууд 500
GEMINI_MODEL=gemini-2.5-flash                  # чат / STT / орчуулга
GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts  # TTS (audio гаргадаг model)
GEMINI_VOICE=Kore   # prebuilt TTS дуу хоолой
GEMINI_API_BASE=    # proxy/тестэд override
AI_SCOPE_PROMPT=    # DB давхарга хоосон үеийн хүрээний fallback
```

Rate limit: `/ai/*` нь тусдаа IP-тус-бүрийн limiter-тэй (~20 хүсэлт/мин,
burst 10) — live орчуулгын ~8 chunk/мин урсгалд зайтай багтана.

## Тест

Бүгд Gemini-гүйгээр тестлэгдэнэ:

- `Generator` нь interface — usecase тестүүд бэлтгэсэн хариу буцаадаг
  `fakeGenerator` ашигладаг (`ai_impl.test.ts`, `ai_speech.test.ts`).
- `AIRepository`-г prompt/tool тестэд fake-ээр сольдог
  (`ai_impl.test.ts`).
- HTTP client өөрөө stub хийсэн глобал `fetch`-ийн эсрэг тестлэгддэг (retry/backoff,
  4xx no-retry, function-call parsing — `pkg/gemini/gemini.test.ts`).

## Асуудал шийдэх (Troubleshooting)

| Шинж тэмдэг | Шалтгаан / засвар |
|-------------|-------------------|
| AI дуудлага бүр 500 "internal server error" | `GEMINI_API_KEY` тохируулаагүй (шалтгаан логт бий) |
| `degraded: true` + fallback хариу | Gemini хүрэхгүй / 429 / 5xx — түр зуурын; api логийг шалга (`category=ai`) |
| Чат ажиллаад TTS унадаг | `GEMINI_TTS_MODEL` нь **preview** model — Google нэрийг нь солих юм бол env var-аар override хий |
| Хүрээний доторх асуултад татгалзана | `scope` давхарга хэт нарийн — Админ → Тохиргооноос засна |
| `search_knowledge` юу ч олдоггүй | `ai_knowledge`-д зөвхөн 3 жишээ мөр seed хийгдсэн — өөрийн агуулгаа нэм |
| Live орчуулгад 429 | Сегментийн давтамж `/ai` rate limit-ээс хэтэрсэн — `server.ts`-ийн limiter-ийг өсгөх эсвэл `SEGMENT_MS`-ийг уртасга |

---

**Government Template Platform V3.0** — **Gerege Systems Development Team** болон **Claude AI** хамтран бүтээв, 2026.
