# Versioning Convention — 절대 규칙

**버전 표시는 `init()` 하나만 존재한다. 그 외에 어떤 버전 표시 코드도 있으면 안 된다.**

- **단일 소스**: `store.js`의 `APP_VERSION`이 유일한 진실 공급원이다.
- **단일 표시점**: `app.js`의 `init()`에서 `document.getElementById('version-label').textContent = '관리자 시스템 ' + Store.version` 한 줄만으로 표시한다.
- **DOMContentLoaded 금지**: `index.html`에 inline `<script>`로 버전을 설정하지 않는다. `init()`이 항상 실행된다.
- **fallback 금지**: 어떤 경우에도 `v1.x.x`를 하드코딩하지 않는다. `Store.version`이 유일한 값이다.
- **로그인창**: `auth.js`에서 `${Store.version}`으로 동적 표시한다. 마찬가지로 하드코딩 금지.
- **버전 범프 시**: `store.js`의 `APP_VERSION` 한 줄만 수정한다. 그 외 어떤 파일도 건드리지 않는다.
- **검증**: `git diff`로 `store.js`만 변경되었는지 확인한다. `index.html`/`auth.js`/기타 파일이 변경되면 잘못된 것이다.

# Supabase Merge Convention

- **로컬 우선 병합**: `_loadFromSupabase()`에서 Supabase 데이터를 로컬에 병합할 때는 `{ ...remote, ...local }` 순서로 병합하여 로컬 값이 우선한다. Supabase에 없는 필드(예: `hasAC`)가 로컬에서 삭제되는 것을 방지한다.
- **컬럼 추가 SQL**: 재실행 가능해야 하며 (`ADD COLUMN IF NOT EXISTS`), 누락된 컬럼이 있으면 `migration_v7.sql`에 추가한다.

# Date Type Safety

- **검침 날짜는 항상 문자열**: `Store._migrateMeterDates()`가 `init()` 시 number→string 변환을 수행한다.
- **`.slice()`/`.localeCompare()` 호출 전 `String()` 래핑**: `m.date`가 number일 수 있으므로 `String(m.date || '').slice(...)` / `String(a.date).localeCompare(String(b.date))` 패턴을 강제한다.
- **`_myear(m)` 헬퍼**: `report.js`에서 `String(m.date || '').slice(0, 7)`를 추상화한 공용 함수. 새 차트 추가 시 이 헬퍼를 사용한다.
