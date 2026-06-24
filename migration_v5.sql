-- migration_v5.sql - 누락 컬럼 추가 + 모바일 anon SELECT 정책
-- Supabase Dashboard → SQL Editor → 실행

-- 1. 누락된 컬럼 추가
ALTER TABLE bills ADD COLUMN IF NOT EXISTS welfare_type text DEFAULT '';
ALTER TABLE prepaids ADD COLUMN IF NOT EXISTS date date DEFAULT CURRENT_DATE;
ALTER TABLE prepaids ADD COLUMN IF NOT EXISTS memo text DEFAULT '';
ALTER TABLE deposit_deductions ADD COLUMN IF NOT EXISTS contract_id bigint DEFAULT 0;
ALTER TABLE deposit_deductions ADD COLUMN IF NOT EXISTS memo text DEFAULT '';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS file_type text DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS security_question text DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS security_answer text DEFAULT '';

-- 2. 모바일 앱에서 읽을 수 있도록 anon SELECT 정책 추가
CREATE POLICY "anon_select_bills" ON bills FOR SELECT USING (true);
CREATE POLICY "anon_select_payments" ON payments FOR SELECT USING (true);
CREATE POLICY "anon_select_notices" ON notices FOR SELECT USING (true);
CREATE POLICY "anon_select_inquiries" ON inquiries FOR SELECT USING (true);
CREATE POLICY "anon_select_units" ON units FOR SELECT USING (true);
