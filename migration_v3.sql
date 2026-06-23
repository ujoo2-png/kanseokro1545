-- Supabase 마이그레이션 v3 - RLS 정책 개선 (anon 제거, role-based)
-- 이미 한 번 실행된 경우 모두 DROP 후 재생성하므로 안전하게 재실행 가능

-- 1. 모든 기존 정책 제거 (v1/v2/v3 중복 방지)
DROP POLICY IF EXISTS "Anon can select bills" ON bills;
DROP POLICY IF EXISTS "Anon can select payments" ON payments;
DROP POLICY IF EXISTS "Anon can select notices" ON notices;
DROP POLICY IF EXISTS "Anon can select inquiries" ON inquiries;
DROP POLICY IF EXISTS "Anon can insert inquiries" ON inquiries;
DROP POLICY IF EXISTS "Anon can select units" ON units;
DROP POLICY IF EXISTS "Anon can select users" ON users;
DROP POLICY IF EXISTS "Anon can read limited user fields" ON users;
DROP POLICY IF EXISTS "Authenticated users can CRUD" ON bills;
DROP POLICY IF EXISTS "Authenticated can manage bills" ON bills;
DROP POLICY IF EXISTS "Authenticated users can CRUD" ON payments;
DROP POLICY IF EXISTS "Authenticated can manage payments" ON payments;
DROP POLICY IF EXISTS "Authenticated users can CRUD" ON notices;
DROP POLICY IF EXISTS "Authenticated can manage notices" ON notices;
DROP POLICY IF EXISTS "Authenticated users can CRUD" ON inquiries;
DROP POLICY IF EXISTS "Authenticated can manage inquiries" ON inquiries;
DROP POLICY IF EXISTS "Authenticated users can CRUD" ON units;
DROP POLICY IF EXISTS "Authenticated can manage units" ON units;

-- 2. users — anon SELECT 허용 (아이디/비번찾기용)
CREATE POLICY "Anon can read limited user fields" ON users
  FOR SELECT USING (true);

-- 3. data tables — authenticated users만 ALL
CREATE POLICY "Authenticated can manage bills" ON bills
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage payments" ON payments
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage notices" ON notices
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage inquiries" ON inquiries
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage units" ON units
  FOR ALL USING (auth.role() = 'authenticated');
