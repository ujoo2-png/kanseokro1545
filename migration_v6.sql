-- migration_v6.sql - anon ALL 정책 (admin web이 Supabase Auth 없이 CRUD 가능하도록)
-- ※ 보안: anon key를 가진任何人都 CRUD 가능 (폐쇄 관리 시스템이므로 허용)
-- Supabase Dashboard → SQL Editor → 실행

DROP POLICY IF EXISTS "anon_select_users" ON users;
DROP POLICY IF EXISTS "auth_all_users" ON users;
DROP POLICY IF EXISTS "auth_all_bills" ON bills;
DROP POLICY IF EXISTS "auth_all_payments" ON payments;
DROP POLICY IF EXISTS "auth_all_notices" ON notices;
DROP POLICY IF EXISTS "auth_all_inquiries" ON inquiries;
DROP POLICY IF EXISTS "auth_all_units" ON units;
DROP POLICY IF EXISTS "auth_all_buildings" ON buildings;
DROP POLICY IF EXISTS "auth_all_contracts" ON contracts;
DROP POLICY IF EXISTS "auth_all_meters" ON meters;
DROP POLICY IF EXISTS "auth_all_prepaids" ON prepaids;
DROP POLICY IF EXISTS "auth_all_deposit_deductions" ON deposit_deductions;
DROP POLICY IF EXISTS "anon_select_bills" ON bills;
DROP POLICY IF EXISTS "anon_select_payments" ON payments;
DROP POLICY IF EXISTS "anon_select_notices" ON notices;
DROP POLICY IF EXISTS "anon_select_inquiries" ON inquiries;
DROP POLICY IF EXISTS "anon_select_units" ON units;

-- 기존 anon_all_* 정책이 있으면 먼저 제거 (재실행 안전)
DROP POLICY IF EXISTS "anon_all_users" ON users;
DROP POLICY IF EXISTS "anon_all_bills" ON bills;
DROP POLICY IF EXISTS "anon_all_payments" ON payments;
DROP POLICY IF EXISTS "anon_all_notices" ON notices;
DROP POLICY IF EXISTS "anon_all_inquiries" ON inquiries;
DROP POLICY IF EXISTS "anon_all_units" ON units;
DROP POLICY IF EXISTS "anon_all_buildings" ON buildings;
DROP POLICY IF EXISTS "anon_all_contracts" ON contracts;
DROP POLICY IF EXISTS "anon_all_meters" ON meters;
DROP POLICY IF EXISTS "anon_all_prepaids" ON prepaids;
DROP POLICY IF EXISTS "anon_all_deposit_deductions" ON deposit_deductions;

-- 모든 테이블에 anon ALL 정책 (SELECT/INSERT/UPDATE/DELETE 모두 허용)
CREATE POLICY "anon_all_users" ON users FOR ALL USING (true);
CREATE POLICY "anon_all_bills" ON bills FOR ALL USING (true);
CREATE POLICY "anon_all_payments" ON payments FOR ALL USING (true);
CREATE POLICY "anon_all_notices" ON notices FOR ALL USING (true);
CREATE POLICY "anon_all_inquiries" ON inquiries FOR ALL USING (true);
CREATE POLICY "anon_all_units" ON units FOR ALL USING (true);
CREATE POLICY "anon_all_buildings" ON buildings FOR ALL USING (true);
CREATE POLICY "anon_all_contracts" ON contracts FOR ALL USING (true);
CREATE POLICY "anon_all_meters" ON meters FOR ALL USING (true);
CREATE POLICY "anon_all_prepaids" ON prepaids FOR ALL USING (true);
CREATE POLICY "anon_all_deposit_deductions" ON deposit_deductions FOR ALL USING (true);
