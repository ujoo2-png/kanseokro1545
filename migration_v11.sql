-- migration_v11.sql
-- v1.22.0: 공지발송 첨부 / 문의 첨부·답변첨부·재답변 / 자료실 / 수납 항목·비고
-- 재실행 가능 (ADD COLUMN IF NOT EXISTS 포함)

-- 1) 공지발송 첨부파일
ALTER TABLE notices ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE notices ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE notices ADD COLUMN IF NOT EXISTS file_data TEXT;

-- 2) 문의 원글 첨부 + 답변 첨부 (재답변/답변수정은 기존 reply/replied_at 사용)
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS answer_file_name TEXT;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS answer_file_type TEXT;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS answer_file_data TEXT;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS reply_file_name TEXT;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS reply_file_type TEXT;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS reply_file_data TEXT;

-- 3) 수납(결제) 항목선택 + 비고란
ALTER TABLE payments ADD COLUMN IF NOT EXISTS item TEXT DEFAULT '기타';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS memo TEXT;

-- 4) 자료실 테이블 (관리자·매니저 접근)
CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT,
  description TEXT,
  file_name TEXT,
  file_type TEXT,
  file_data TEXT,
  created_at DATE
);
