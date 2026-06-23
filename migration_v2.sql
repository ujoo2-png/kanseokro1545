-- Supabase 마이그레이션 v2 - password 컬럼 추가 + 모바일 anon 정책
-- Supabase Dashboard → SQL Editor → 붙여넣기 → Run

-- 1. users 테이블에 password 컬럼 추가 (웹/모바일 호환)
ALTER TABLE users ADD COLUMN IF NOT EXISTS password text DEFAULT '';

-- 2. 모바일 앱 anon SELECT 정책 (개발용)
-- bills
DROP POLICY IF EXISTS "Anon can select bills" ON bills;
CREATE POLICY "Anon can select bills" ON bills FOR SELECT USING (true);

-- payments
DROP POLICY IF EXISTS "Anon can select payments" ON payments;
CREATE POLICY "Anon can select payments" ON payments FOR SELECT USING (true);

-- notices
DROP POLICY IF EXISTS "Anon can select notices" ON notices;
CREATE POLICY "Anon can select notices" ON notices FOR SELECT USING (true);

-- inquiries
DROP POLICY IF EXISTS "Anon can select inquiries" ON inquiries;
CREATE POLICY "Anon can select inquiries" ON inquiries FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anon can insert inquiries" ON inquiries;
CREATE POLICY "Anon can insert inquiries" ON inquiries FOR INSERT WITH CHECK (true);

-- units
DROP POLICY IF EXISTS "Anon can select units" ON units;
CREATE POLICY "Anon can select units" ON units FOR SELECT USING (true);

-- users (username/name/email/role만 조회 가능)
DROP POLICY IF EXISTS "Anon can select users" ON users;
CREATE POLICY "Anon can select users" ON users FOR SELECT USING (true);

-- 3. payments 테이블에 year_month 컬럼 추가 (모바일용)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS year_month text DEFAULT '';
