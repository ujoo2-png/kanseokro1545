"""
버전 범프 스크립트 — store.js의 APP_VERSION 기준으로 모든 파일 일괄 업데이트
사용법: python3 bump_version.py
"""
import re, os

BASE = os.path.dirname(os.path.abspath(__file__))

# 1. store.js에서 APP_VERSION 읽기
store_path = os.path.join(BASE, 'js', 'store.js')
with open(store_path) as f:
    store_src = f.read()
m = re.search(r"APP_VERSION\s*=\s*'([^']+)'", store_src)
if not m:
    raise Exception('APP_VERSION not found in js/store.js')
version = m.group(1)
print(f'Target version: {version}')

# 2. 업데이트할 파일 목록 (변경할 old → new 쌍)
#    - 루트 파일들은 참조되지 않으므로 js/ 디렉터리 파일들만 업데이트
#    - app.js/js/app.js: 주석의 현재 버전 문자열만 변경 (역사 이력은 유지)
targets = []

# index.html — <p class="subtitle">관리자 시스템 vX.Y.Z</p>
targets.append({
    'path': os.path.join(BASE, 'index.html'),
    'pattern': r'(관리자 시스템 )v\d+\.\d+\.\d+',
    'replacement': r'\g<1>' + version,
})

# js/auth.js — 관리자 시스템 vX.Y.Z
targets.append({
    'path': os.path.join(BASE, 'js', 'auth.js'),
    'pattern': r'(관리자 시스템 )v\d+\.\d+\.\d+',
    'replacement': r'\g<1>' + version,
})

# js/app.js — 첫 2줄 주석 버전
targets.append({
    'path': os.path.join(BASE, 'js', 'app.js'),
    'pattern': r'(\* 간석로1545 관리자 시스템 )v\d+\.\d+\.\d+',
    'replacement': r'\g<1>' + version,
})
targets.append({
    'path': os.path.join(BASE, 'js', 'app.js'),
    'pattern': r'(\* v)\d+\.\d+\.\d+ \(2026-06\)',
    'replacement': r'\g<1>' + version + ' (2026-06)',
})

# css/style.css
targets.append({
    'path': os.path.join(BASE, 'css', 'style.css'),
    'pattern': r'(\* 간석로1545 관리자 시스템 )v\d+\.\d+\.\d+',
    'replacement': r'\g<1>' + version,
})

# store.js 자체 주석
targets.append({
    'path': os.path.join(BASE, 'js', 'store.js'),
    'pattern': r'(관리자 시스템 )v\d+\.\d+\.\d+',
    'replacement': r'\g<1>' + version,
})

# mobile JS bundle — unicode escape로 된 한글 포함 (바이너리 처리)
mobile_bundle = os.path.join(BASE, 'mobile', '_expo', 'static', 'js', 'web')
if os.path.isdir(mobile_bundle):
    for fn in os.listdir(mobile_bundle):
        if fn.startswith('index-') and fn.endswith('.js'):
            path = os.path.join(mobile_bundle, fn)
            old_v = 'v' + '\\d+\\.\\d+\\.\\d+'
            with open(path, 'rb') as f:
                c = f.read()
            # find version bytes in the file
            import re as re2
            match = re2.search(rb'v\d+\.\d+\.\d+', c)
            if match:
                old_bytes = match.group()
                new_bytes = version.encode()
                if old_bytes != new_bytes:
                    c = c.replace(old_bytes, new_bytes, 1)
                    with open(path, 'wb') as f:
                        f.write(c)
                    print(f'  ✓ {fn} (binary)')
                else:
                    print(f'  - {fn} (already {version})')
            else:
                print(f'  ✗ {fn} (no version found)')

# 3. 실행
updated = []
for t in targets:
    with open(t['path']) as f:
        src = f.read()
    before = src
    src = re.sub(t['pattern'], t['replacement'], src)
    if src != before:
        with open(t['path'], 'w') as f:
            f.write(src)
        updated.append(os.path.relpath(t['path'], BASE))
        print(f'  ✓ {os.path.relpath(t["path"], BASE)}')
    else:
        # no match? check if maybe already updated
        if version in before:
            print(f'  - {os.path.relpath(t["path"], BASE)} (already {version})')
        else:
            print(f'  ✗ {os.path.relpath(t["path"], BASE)} (pattern not found)')

print(f'\nDone. {len(updated)} files updated to {version}')
