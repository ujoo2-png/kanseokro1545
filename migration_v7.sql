-- migration_v7.sql
-- v1.15.7: 유지보수, 알림, 리포트 기능 추가

-- 1. maintenance_categories (유지보수 항목 분류)
CREATE TABLE IF NOT EXISTS maintenance_categories (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'repair' CHECK (category IN ('repair','inspection','renovation','other')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE maintenance_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_all_maintenance_categories ON maintenance_categories;
CREATE POLICY anon_all_maintenance_categories ON maintenance_categories
  FOR ALL USING (true) WITH CHECK (true);

-- UNIQUE constraint on name for ON CONFLICT support and deduplication
ALTER TABLE maintenance_categories ADD CONSTRAINT maintenance_categories_name_key UNIQUE (name);

-- 2. maintenance_records (유지보수 실시 기록)
CREATE TABLE IF NOT EXISTS maintenance_records (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  unit_id BIGINT REFERENCES units(id) ON DELETE CASCADE,
  category_id BIGINT REFERENCES maintenance_categories(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','completed','cancelled')),
  priority TEXT DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','emergency')),
  cost NUMERIC DEFAULT 0,
  vendor TEXT,
  vendor_contact TEXT,
  scheduled_date DATE,
  completed_date DATE,
  result TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE maintenance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY anon_all_maintenance_records ON maintenance_records
  FOR ALL USING (true) WITH CHECK (true);

-- 3. notifications (알림 발송 이력)
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  type TEXT NOT NULL DEFAULT 'internal'
    CHECK (type IN ('internal','sms','kakao','push')),
  recipient TEXT NOT NULL,
  title TEXT,
  content TEXT,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed')),
  sent_at TIMESTAMPTZ,
  error_log TEXT,
  ref_type TEXT,
  ref_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY anon_all_notifications ON notifications
  FOR ALL USING (true) WITH CHECK (true);

-- 4. 기본 유지보수 항목 카테고리
INSERT INTO maintenance_categories (name, category) VALUES
  ('에어컨 점검', 'inspection'),
  ('도배', 'renovation'),
  ('배관 수리', 'repair'),
  ('전기 수리', 'repair'),
  ('가스 점검', 'inspection'),
  ('냉장고 교체', 'repair'),
  ('세탁기 교체', 'repair'),
  ('TV/거실장 교체', 'repair'),
  ('침대 교체', 'repair'),
  ('옷장 교체', 'repair'),
  ('도어락 교체', 'repair'),
  ('방역', 'inspection'),
  ('기타', 'other')
ON CONFLICT (name) DO NOTHING;

-- 5. units 테이블에 billing_type 컬럼 추가 (통합 청구 / 개별 신고)
ALTER TABLE units ADD COLUMN IF NOT EXISTS billing_type TEXT DEFAULT 'integrated' CHECK (billing_type IN ('integrated','individual'));
