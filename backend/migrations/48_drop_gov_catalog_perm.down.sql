-- Government Template Platform V3.0
-- 'gov.catalog' эрхийг сэргээнэ (migration 44-ийн байдлаар). Оноолт нь
-- сэргэхгүй — тухайн үед ямар ч role-д оноогдоогүй байсан.

INSERT INTO permissions(key, label, category)
VALUES ('gov.catalog', 'Үйлчилгээний каталог удирдах', 'administration')
ON CONFLICT (key) DO NOTHING;
