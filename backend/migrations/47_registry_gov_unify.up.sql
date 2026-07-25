-- Government Template Platform V3.0
-- Үйлчилгээний ХОЁР зэрэгцээ каталогийг НЭГТГЭНЭ.
--
-- Асуудал: migration 44 нь иргэний порталын ажлын каталог (gov_services), 45 нь
-- CPSV-AP паспортын регистр (registry_services) үүсгэсэн боловч хоёулаа ижил
-- бодит үйлчилгээг тус тусдаа, өөр өөр кодоор тодорхойлж байсан. Паспорт
-- нийтлэхэд иргэний хүсэлт гаргадаг үйлчилгээ өөрчлөгддөггүй — нэг үйлчилгээг
-- хоёр газар тэжээх шаардлагатай болж байв.
--
-- Шийдэл — РЕГИСТР нь ЦОРЫН ГАНЦ ЭХ СУРВАЛЖ:
--   registry_services  = мастер паспорт (тайлбар + үйл ажиллагааны тохиргоо)
--   gov_services       = түүний АЖЛЫН ПРОЕКЦ; паспорт нийтлэхэд автоматаар
--                        үүсэж/шинэчлэгдэнэ (registry_service_id-аар холбоотой)
--   registry_life_events = амьдралын үйл явдлын мастер (gov_life_events устана)
--
-- gov_services-ийг ГАРААР засахаа болино — паспортоо засаад дахин нийтэлнэ.
-- gov_applications нь gov_services руу заасан хэвээр (workflow өөрчлөгдөхгүй).

-- ---------------------------------------------------------------------------
-- 1. Амьдралын үйл явдал — регистрийг мастер болгож ЕХ-ны кодоор баяжуулна
-- ---------------------------------------------------------------------------

ALTER TABLE registry_life_events
    -- ЕХ-ны хяналттай толийн код: life → ox8/life-event/LE (BIR, RES…),
    -- business → m58/business-event/BE (STBU…). Хоосон бол зөвхөн үндэсний.
    ADD COLUMN IF NOT EXISTS eu_code  TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS en_label TEXT NOT NULL DEFAULT '';

-- 44-д байсан үйл явдлуудыг регистрт нэгтгэнэ (кодыг регистрийн ТОМ үсгийн
-- хэв маягт оруулав). Аль хэдийн байгаа кодыг давхардуулахгүй.
INSERT INTO registry_life_events(code, name, kind, description, lead_agency, sort_order, eu_code, en_label) VALUES
    ('RESIDENCE', 'Оршин суух',        'life', 'Оршин суух хаяг, бүртгэлийн лавлагаа.',   'УБЕГ', 15, 'RES',  'Residence'),
    ('STUDYING',  'Суралцах',          'life', 'Боловсрол, тэтгэлэг, диплом баталгаажуулалт.', 'БШУЯ', 25, 'STU',  'Studying'),
    ('WORKING',   'Ажил эрхлэх',       'life', 'Хөдөлмөр эрхлэлт, татвар, нийгмийн даатгал.',  'ХНХЯ', 35, 'WOR',  'Working'),
    ('MOVING',    'Шилжин суурьших',   'life', 'Хаяг өөрчлөх, шилжилт хөдөлгөөн.',        'УБЕГ', 45, 'MOV',  'Moving'),
    ('VEHICLE',   'Тээврийн хэрэгсэл', 'life', 'Тээврийн хэрэгсэл бүртгэх, жолоочийн эрх.', 'ЗТХЯ', 55, 'DRV',  'Driving a vehicle'),
    ('HEALTH',    'Эрүүл мэнд',        'life', 'Эрүүл мэндийн даатгал, тусламж үйлчилгээ.', 'ЭМЯ',  65, 'FEHP', 'Facing an emergency / health problem')
ON CONFLICT (code) DO NOTHING;

-- Регистрийн анхны үйл явдлуудад ЕХ-ны код онооно.
UPDATE registry_life_events SET eu_code = 'BIR',  en_label = 'Birth'                        WHERE code = 'BIRTH'      AND eu_code = '';
UPDATE registry_life_events SET eu_code = 'CRS',  en_label = 'Changing relationship status' WHERE code = 'MARRIAGE'   AND eu_code = '';
UPDATE registry_life_events SET eu_code = 'RET',  en_label = 'Retiring'                     WHERE code = 'RETIREMENT' AND eu_code = '';
UPDATE registry_life_events SET eu_code = 'STBU', en_label = 'Starting a business'          WHERE code = 'BIZ_START'  AND eu_code = '';
-- JOB_LOSS нь ЕХ-ны толинд шууд дүйцэхгүй — үндэсний өргөтгөл хэвээр (eu_code='').

-- ── Паспорт ↔ үйл явдал (N:N) ──────────────────────────────────────────────
-- registry_services.life_event_id нь ГОЛ үйл явдлыг заана; нэг үйлчилгээ
-- хэд хэдэн журнейд хамаарч болох тул энэ хүснэгт нэмэгдэв
-- (жишээ: оршин суугаа газрын лавлагаа нь "Оршин суух" ба "Шилжин суурьших"
-- хоёуланд хэрэгтэй).
CREATE TABLE IF NOT EXISTS registry_service_events (
    service_id uuid NOT NULL REFERENCES registry_services(id)    ON DELETE CASCADE,
    event_id   uuid NOT NULL REFERENCES registry_life_events(id) ON DELETE CASCADE,
    PRIMARY KEY (service_id, event_id)
);

-- Одоо байгаа гол үйл явдлыг N:N хүснэгтэд тусгана.
INSERT INTO registry_service_events(service_id, event_id)
SELECT id, life_event_id FROM registry_services WHERE life_event_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Паспортад ҮЙЛ АЖИЛЛАГААНЫ талбарууд — эдгээр нь ажлын каталог руу буудаг
--    тохиргоо. Регистр мастер болсон тул ЭНД амьдарна.
-- ---------------------------------------------------------------------------

ALTER TABLE registry_services
    ADD COLUMN IF NOT EXISTS category        TEXT    NOT NULL DEFAULT '',
    -- НҮБ COFOG 1999 + ЕХ main-activity + SDG Annex II procedure код.
    ADD COLUMN IF NOT EXISTS cofog_code      TEXT    NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS cofog_label     TEXT    NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS main_activity   TEXT    NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS sdg_code        TEXT    NOT NULL DEFAULT '',
    -- cv:processingTime — ISO 8601 duration (max_days-ийн машин уншихуйц хэлбэр).
    ADD COLUMN IF NOT EXISTS processing_time TEXT    NOT NULL DEFAULT '',
    -- cpsv:produces → CPSV-AP Output толь (output нь чөлөөт тайлбар хэвээр).
    ADD COLUMN IF NOT EXISTS output_type     TEXT    NOT NULL DEFAULT 'Declaration',
    -- Гаралт лавлагаа бол ямар төрлийн gov_references үүсгэхийг заана.
    ADD COLUMN IF NOT EXISTS output_ref_type TEXT    NOT NULL DEFAULT '',
    -- eIDAS баталгаажилтын түвшин.
    ADD COLUMN IF NOT EXISTS assurance_level TEXT    NOT NULL DEFAULT 'substantial',
    -- ГОЛ ШИЛЖҮҮЛЭГ: auto = бүртгэлээс шууд олгоно, manual = менежер хянана.
    ADD COLUMN IF NOT EXISTS fulfilment      TEXT    NOT NULL DEFAULT 'manual',
    -- Автоматжуулах эрх зүйн шалгуур (VwVfG §35a-ийн загвар): үнэлэх эрх ба
    -- үнэлгээний зай ХОЁУЛАА байхгүй үед л fulfilment='auto' зөв байна.
    ADD COLUMN IF NOT EXISTS has_discretion  BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS has_assessment  BOOLEAN NOT NULL DEFAULT true,
    -- Байгууллагын үйлчилгээний норм (max_days нь хуулийн дээд хугацаа).
    ADD COLUMN IF NOT EXISTS sla_hours       INT     NOT NULL DEFAULT 72,
    ADD COLUMN IF NOT EXISTS tacit_approval  BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS online          BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE registry_services
    DROP CONSTRAINT IF EXISTS registry_services_fulfilment_chk,
    DROP CONSTRAINT IF EXISTS registry_services_output_type_chk,
    DROP CONSTRAINT IF EXISTS registry_services_assurance_chk;
ALTER TABLE registry_services
    ADD CONSTRAINT registry_services_fulfilment_chk
        CHECK (fulfilment IN ('auto','manual')),
    ADD CONSTRAINT registry_services_output_type_chk
        CHECK (output_type IN ('Declaration','Physical object','Code',
                               'Financial obligation','Financial benefit',
                               'Recognition','Permit')),
    ADD CONSTRAINT registry_services_assurance_chk
        CHECK (assurance_level IN ('low','substantial','high'));

-- ---------------------------------------------------------------------------
-- 3. Ажлын каталогийг паспорттой холбоно
-- ---------------------------------------------------------------------------

ALTER TABLE gov_services
    -- UNIQUE: нэг паспорт → яг нэг ажлын үйлчилгээ. NULL зөвшөөрөгдөнө
    -- (паспортгүй хуучин мөр байвал), гэхдээ доорх backfill бүгдийг холбоно.
    ADD COLUMN IF NOT EXISTS registry_service_id uuid UNIQUE REFERENCES registry_services(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 4. Backfill — одоо байгаа өгөгдлийг алдалгүй нэгтгэнэ
-- ---------------------------------------------------------------------------

-- 4a. Давхцаж буй хоёр паспортыг ажлын үйлчилгээтэйгээ ижилтгэнэ. Паспортын
--     баялаг талбаруудыг (target_group, steps_count, annual_volume, нотолгоо,
--     хувилбарын түүх) ХАДГАЛЖ, зөвхөн код + үйл ажиллагааны тохиргоог нь
--     ажлын каталогоос авна. Ингэснээр хувилбарын түүх тасрахгүй.
UPDATE registry_services r SET
    code            = g.code,
    category        = g.category,
    cofog_code      = g.cofog_code,
    cofog_label     = g.cofog_label,
    main_activity   = g.main_activity,
    sdg_code        = g.sdg_code,
    processing_time = g.processing_time,
    output_type     = g.output_type,
    output_ref_type = g.output_ref_type,
    assurance_level = g.assurance_level,
    fulfilment      = g.fulfilment,
    has_discretion  = g.has_discretion,
    has_assessment  = g.has_assessment,
    sla_hours       = g.sla_hours,
    tacit_approval  = g.tacit_approval,
    online          = g.online,
    max_days        = GREATEST(r.max_days, g.processing_days),
    updated_at      = now()
FROM gov_services g
WHERE (r.code = 'RS_CIVIL_ID' AND g.code = 'MN-0133-001')
   OR (r.code = 'RS_BIZ_REG'  AND g.code = 'MN-0411-001');

-- 4b. Үлдсэн ажлын үйлчилгээ бүрд паспорт үүсгэнэ (нийтлэгдсэн төлөвтэй —
--     эдгээр нь аль хэдийн ажиллаж байгаа тул ноорог гэж үзэх нь буруу).
INSERT INTO registry_services
    (code, name, description, authority, legal_basis, output, channels, fee,
     max_days, proactivity, status, version, published_at,
     category, cofog_code, cofog_label, main_activity, sdg_code, processing_time,
     output_type, output_ref_type, assurance_level, fulfilment,
     has_discretion, has_assessment, sla_hours, tacit_approval, online)
SELECT
    g.code, g.name, g.description, g.agency, g.legal_basis, g.name,
    CASE WHEN g.online THEN ARRAY['e-mongolia'] ELSE ARRAY['office'] END,
    g.fee, g.processing_days,
    -- Шууд олгогддог үйлчилгээ нь тодорхойлолтоороо "once_only" шатанд байна:
    -- иргэнээс дахин баримт шаардалгүй, бүртгэлээс уншиж олгодог.
    CASE WHEN g.fulfilment = 'auto' THEN 'once_only' ELSE 'online' END,
    'published', 1, now(),
    g.category, g.cofog_code, g.cofog_label, g.main_activity, g.sdg_code,
    g.processing_time, g.output_type, g.output_ref_type, g.assurance_level,
    g.fulfilment, g.has_discretion, g.has_assessment, g.sla_hours,
    g.tacit_approval, g.online
FROM gov_services g
WHERE NOT EXISTS (SELECT 1 FROM registry_services r WHERE r.code = g.code);

-- 4c. Ажлын каталогийг паспорттой холбоно (кодоор).
UPDATE gov_services g SET registry_service_id = r.id
FROM registry_services r
WHERE r.code = g.code AND g.registry_service_id IS NULL;

-- 4d. Паспортын үйл явдлын холбоосыг 44-ийн N:N хүснэгтээс шилжүүлнэ.
INSERT INTO registry_service_events(service_id, event_id)
SELECT g.registry_service_id, rle.id
FROM gov_service_events gse
JOIN gov_services g       ON g.id = gse.service_id
JOIN gov_life_events gle  ON gle.code = gse.event_code
JOIN registry_life_events rle ON rle.code = upper(gle.code)
WHERE g.registry_service_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Паспортын гол үйл явдлыг (life_event_id) хоосон бол эхнийхээр нь бөглөнө.
UPDATE registry_services r SET life_event_id = sub.event_id
FROM (
    SELECT service_id, min(event_id::text)::uuid AS event_id
    FROM registry_service_events GROUP BY service_id
) sub
WHERE sub.service_id = r.id AND r.life_event_id IS NULL;

-- 4e. Ажлын каталогт байхгүй, зөвхөн паспортоор оршиж буй НИЙТЛЭГДСЭН
--     үйлчилгээг ажлын каталогт буулгана (RS_PENSION гэх мэт). Ингэснээр
--     "нийтлэгдсэн бол иргэн хүсэлт гаргаж чадна" гэсэн дүрэм тогтоно.
INSERT INTO gov_services
    (code, name, category, agency, description, fee, processing_days, online,
     cofog_code, cofog_label, main_activity, sdg_code, processing_time,
     output_type, output_ref_type, evidence, legal_basis, assurance_level,
     lifecycle, fulfilment, has_discretion, has_assessment, sla_hours,
     tacit_approval, enabled, registry_service_id)
SELECT
    r.code, r.name, r.category, r.authority, r.description, r.fee, r.max_days,
    'e-mongolia' = ANY(r.channels),
    r.cofog_code, r.cofog_label, r.main_activity, r.sdg_code, r.processing_time,
    r.output_type, r.output_ref_type, '[]'::jsonb, r.legal_basis, r.assurance_level,
    'active', r.fulfilment, r.has_discretion, r.has_assessment, r.sla_hours,
    r.tacit_approval, true, r.id
FROM registry_services r
WHERE r.status = 'published'
  AND NOT EXISTS (SELECT 1 FROM gov_services g WHERE g.registry_service_id = r.id);

-- ---------------------------------------------------------------------------
-- 5. 44-ийн давхардсан үйл явдлын хүснэгтүүдийг устгана — мастер нь регистр
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS gov_service_events;
DROP TABLE IF EXISTS gov_life_events;
