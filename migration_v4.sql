-- migration_v4.sql - users RLS 무한루프 수정 + 모든 정책 통합
-- Supabase Dashboard → SQL Editor → 실행

DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Admins can insert/update/delete" ON users;
DROP POLICY IF EXISTS "Anon can select users" ON users;
DROP POLICY IF EXISTS "Anon can read limited user fields" ON users;
DROP POLICY IF EXISTS "Authenticated can manage bills" ON bills;
DROP POLICY IF EXISTS "Authenticated can manage payments" ON payments;
DROP POLICY IF EXISTS "Authenticated can manage notices" ON notices;
DROP POLICY IF EXISTS "Authenticated can manage inquiries" ON inquiries;
DROP POLICY IF EXISTS "Authenticated can manage units" ON units;
DROP POLICY IF EXISTS "Authenticated users can CRUD" ON buildings;
DROP POLICY IF EXISTS "Authenticated users can CRUD" ON contracts;
DROP POLICY IF EXISTS "Authenticated users can CRUD" ON meters;
DROP POLICY IF EXISTS "Authenticated users can CRUD" ON prepaids;
DROP POLICY IF EXISTS "Authenticated users can CRUD" ON deposit_deductions;

-- users: anon SELECT만 허용 (모바일 로그인용), authenticated만 수정
CREATE POLICY "anon_select_users" ON users FOR SELECT USING (true);
CREATE POLICY "auth_all_users" ON users FOR ALL USING (auth.role() = 'authenticated');

-- data tables: authenticated만 접근
CREATE POLICY "auth_all_bills" ON bills FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_payments" ON payments FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_notices" ON notices FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_inquiries" ON inquiries FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_units" ON units FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_buildings" ON buildings FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_contracts" ON contracts FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_meters" ON meters FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_prepaids" ON prepaids FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_deposit_deductions" ON deposit_deductions FOR ALL USING (auth.role() = 'authenticated');
