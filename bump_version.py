"""
버전 범프 스크립트 — store.js의 APP_VERSION 기준으로 모든 파일 일괄 업데이트
사용법: python3 bump_version.py
"""
import re, os

BASE = os.path.dirname(os.path.abspath(__file__))

store_path = os.path.join(BASE, 'store.js')
with open(store_path) as f:
    store_src = f.read()
m = re.search(r"APP_VERSION\s*=\s*'([^']+)'", store_src)
if not m:
    raise Exception('APP_VERSION not found in store.js')
version = m.group(1)
print(f'Target version: {version}')

targets = []

targets.append({
    'path': os.path.join(BASE, 'index.html'),
    'pattern': r'(관리자 시스템 )v\d+\.\d+\.\d+',
    'replacement': r'\g<1>' + version,
})
targets.append({
    'path': os.path.join(BASE, 'auth.js'),
    'pattern': r'(관리자 시스템 )v\d+\.\d+\.\d+',
    'replacement': r'\g<1>' + version,
})
targets.append({
    'path': os.path.join(BASE, 'app.js'),
    'pattern': r'(\* 간석로1545 관리자 시스템 )v\d+\.\d+\.\d+',
    'replacement': r'\g<1>' + version,
})
targets.append({
    'path': os.path.join(BASE, 'app.js'),
    'pattern': r'(\* v)\d+\.\d+\.\d+ \(2026-06\)',
    'replacement': r'\g<1>' + version + ' (2026-06)',
})
targets.append({
    'path': os.path.join(BASE, 'style.css'),
    'pattern': r'(\* 간석로1545 관리자 시스템 )v\d+\.\d+\.\d+',
    'replacement': r'\g<1>' + version,
})
targets.append({
    'path': os.path.join(BASE, 'store.js'),
    'pattern': r'(관리자 시스템 )v\d+\.\d+\.\d+',
    'replacement': r'\g<1>' + version,
})

mobile_bundle = os.path.join(BASE, 'mobile', '_expo', 'static', 'js', 'web')
if os.path.isdir(mobile_bundle):
    for fn in os.listdir(mobile_bundle):
        if fn.startswith('index-') and fn.endswith('.js'):
            path = os.path.join(mobile_bundle, fn)
            with open(path, 'rb') as f:
                c = f.read()
            match = re.search(rb'v\d+\.\d+\.\d+', c)
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
        if version in before:
            print(f'  - {os.path.relpath(t["path"], BASE)} (already {version})')
        else:
            print(f'  ✗ {os.path.relpath(t["path"], BASE)} (pattern not found)')

print(f'\nDone. {len(updated)} files updated to {version}')
