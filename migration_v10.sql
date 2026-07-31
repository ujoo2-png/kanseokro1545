-- migration_v10.sql
-- v1.21.0: 유지보수 공사 일정 컬럼 추가 (예정/실제 시작·종료, 완료일)
-- 기존 scheduled_date(예정일)는 시작 예정일로 백필
ALTER TABLE maintenance_records ADD COLUMN IF NOT EXISTS scheduled_start_date DATE;
ALTER TABLE maintenance_records ADD COLUMN IF NOT EXISTS scheduled_end_date DATE;
ALTER TABLE maintenance_records ADD COLUMN IF NOT EXISTS actual_start_date DATE;
ALTER TABLE maintenance_records ADD COLUMN IF NOT EXISTS actual_end_date DATE;
ALTER TABLE maintenance_records ADD COLUMN IF NOT EXISTS completed_date DATE;

UPDATE maintenance_records SET scheduled_start_date = scheduled_date
  WHERE scheduled_start_date IS NULL AND scheduled_date IS NOT NULL;
