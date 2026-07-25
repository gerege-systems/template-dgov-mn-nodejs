-- Government Template Platform V3.0
-- 47-г буцаана: gov_services-ийг дахин бие даасан каталог болгож, амьдралын
-- үйл явдлын өөрийн хүснэгтүүдийг (44-ийн бүтэц) сэргээнэ.
--
-- АНХААР — энэ буцаалт нь БҮРЭН СЭРГЭЭЛТ БИШ, зориудаар:
--   * 47-оос ХОЙШ паспортоос буусан ажлын үйлчилгээ (gov_services мөр) энд
--     УСТАХГҮЙ — тэдгээр рүү иргэний хүсэлт заасан байж болно.
--   * 47-ийн 4b алхам ажлын каталогийн 8 үйлчилгээнд паспорт үүсгэсэн; эдгээр
--     паспорт регистрт ҮЛДЭНЭ. Устгавал тэдгээрт дараа нь хийсэн засвар,
--     нотолгооны холбоос, хувилбарын түүх алдагдана.
-- Өөрөөр хэлбэл буцаалт нь ХОЛБООС болон ДАВХАРДСАН хүснэгтийг арилгах ба
-- өгөгдлийг хадгална.

-- 44-ийн үйл явдлын хүснэгтүүдийг сэргээнэ.
CREATE TABLE IF NOT EXISTS gov_life_events (
    code       TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    kind       TEXT NOT NULL DEFAULT 'life',
    eu_code    TEXT NOT NULL DEFAULT '',
    en_label   TEXT NOT NULL DEFAULT '',
    sort_order INT  NOT NULL DEFAULT 0,
    CONSTRAINT gov_life_events_kind_check CHECK (kind IN ('life','business'))
);

CREATE TABLE IF NOT EXISTS gov_service_events (
    service_id uuid NOT NULL REFERENCES gov_services(id)      ON DELETE CASCADE,
    event_code TEXT NOT NULL REFERENCES gov_life_events(code) ON DELETE CASCADE,
    PRIMARY KEY (service_id, event_code)
);

-- Регистрээс үйл явдлуудыг буцаан хуулна (кодыг жижиг үсэг рүү).
INSERT INTO gov_life_events(code, name, kind, eu_code, en_label, sort_order)
SELECT lower(code), name, kind, eu_code, en_label, sort_order
FROM registry_life_events
ON CONFLICT (code) DO NOTHING;

INSERT INTO gov_service_events(service_id, event_code)
SELECT g.id, lower(rle.code)
FROM registry_service_events rse
JOIN registry_life_events rle ON rle.id = rse.event_id
JOIN gov_services g ON g.registry_service_id = rse.service_id
ON CONFLICT DO NOTHING;

-- Холбоосыг салгана.
ALTER TABLE gov_services DROP COLUMN IF EXISTS registry_service_id;

-- Паспорт ↔ үйл явдлын N:N хүснэгт.
DROP TABLE IF EXISTS registry_service_events;

-- Паспортын үйл ажиллагааны талбарууд.
ALTER TABLE registry_services
    DROP CONSTRAINT IF EXISTS registry_services_fulfilment_chk,
    DROP CONSTRAINT IF EXISTS registry_services_output_type_chk,
    DROP CONSTRAINT IF EXISTS registry_services_assurance_chk;

ALTER TABLE registry_services
    DROP COLUMN IF EXISTS category,
    DROP COLUMN IF EXISTS cofog_code,
    DROP COLUMN IF EXISTS cofog_label,
    DROP COLUMN IF EXISTS main_activity,
    DROP COLUMN IF EXISTS sdg_code,
    DROP COLUMN IF EXISTS processing_time,
    DROP COLUMN IF EXISTS output_type,
    DROP COLUMN IF EXISTS output_ref_type,
    DROP COLUMN IF EXISTS assurance_level,
    DROP COLUMN IF EXISTS fulfilment,
    DROP COLUMN IF EXISTS has_discretion,
    DROP COLUMN IF EXISTS has_assessment,
    DROP COLUMN IF EXISTS sla_hours,
    DROP COLUMN IF EXISTS tacit_approval,
    DROP COLUMN IF EXISTS online;

-- Кодыг буцаана (4a-д солигдсон хоёр паспорт).
UPDATE registry_services SET code = 'RS_CIVIL_ID' WHERE code = 'MN-0133-001';
UPDATE registry_services SET code = 'RS_BIZ_REG'  WHERE code = 'MN-0411-001';

ALTER TABLE registry_life_events
    DROP COLUMN IF EXISTS eu_code,
    DROP COLUMN IF EXISTS en_label;

-- 47-д нэмэгдсэн үйл явдлууд (45-ын seed-д байгаагүй).
DELETE FROM registry_life_events
 WHERE code IN ('RESIDENCE','STUDYING','WORKING','MOVING','VEHICLE','HEALTH');
