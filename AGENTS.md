# Versioning Convention

- **단일 소스**: `store.js`의 `APP_VERSION`이 유일한 진실 공급원이다.
- **표시 방식**: `auth.js`/`index.html` 등 모든 UI는 `Store.version`을 동적으로 읽는다 (`DOMContentLoaded` 이후). 절대 하드코딩하지 않는다.
- **버전 범프 시**: `store.js`의 `APP_VERSION` 한 줄만 수정하면 모든 화면에 자동 반영된다. `sed`로 문자열 일괄 치환하지 않는다.
- **중복 제거**: 기존에 하드코딩된 버전 문자열이 있다면 제거하고 `Store.version` 참조로 대체한다.
- **검증**: bump 후 `git diff`로 `store.js`만 변경되었는지 확인한다.

# Supabase Merge Convention

- **로컬 우선 병합**: `_loadFromSupabase()`에서 Supabase 데이터를 로컬에 병합할 때는 `{ ...remote, ...local }` 순서로 병합하여 로컬 값이 우선한다. Supabase에 없는 필드(예: `hasAC`)가 로컬에서 삭제되는 것을 방지한다.
- **컬럼 추가 SQL**: 재실행 가능해야 하며 (`ADD COLUMN IF NOT EXISTS`), 누락된 컬럼이 있으면 `migration_v7.sql`에 추가한다.
