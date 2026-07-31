-- migration_v9.sql
-- v1.19.0: 유지보수 이력 삭제 방지 (재발방지)
--
-- 원인: migration_v7.sql에서
--   unit_id BIGINT REFERENCES units(id) ON DELETE CASCADE
-- 로 생성되어, 세대(units) 삭제 시 해당 세대의 유지보수 기록이
-- 데이터베이스에서 영구 삭제(폭포식 삭제)됨.
-- 앱의 deleteUnit()은 로컬에서 유지보수 기록을 지우지 않으므로
-- 새 기기/초기화 시 '갑자기 3건이 사라진' 것처럼 보임.
--
-- 해결: CASCADE → SET NULL. 세대를 삭제해도 유지보수 기록은 남고
-- unit_id만 NULL이 되어 '세대 ID ?'로 이력이 보존된다.

ALTER TABLE maintenance_records DROP CONSTRAINT IF EXISTS maintenance_records_unit_id_fkey;

ALTER TABLE maintenance_records ADD CONSTRAINT maintenance_records_unit_id_fkey
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL;
