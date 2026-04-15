import re, sys, os, json

files = {
    'unified_api.js': open('unified_api.js', encoding='utf-8', errors='replace').read(),
    'orchestrator.js': open('orchestrator.js', encoding='utf-8', errors='replace').read(),
    'agent_tower.js': open('agent_tower.js', encoding='utf-8', errors='replace').read(),
    'memory_matrix.py': open('memory_matrix.py', encoding='utf-8', errors='replace').read(),
    'memory_matrix_v2.py': open('memory_matrix_v2.py', encoding='utf-8', errors='replace').read(),
}

import_patterns = [
    re.compile(r"require\s*\(\s*['\"]([^'\"]+)['\"]\s*\)"),
    re.compile(r"import\s+.*?\s+from\s+['\"]([^'\"]+)['\"]"),
    re.compile(r"^\s*import\s+['\"]([^'\"]+)['\"]"),
    re.compile(r"^\s*from\s+([^\s]+)\s+import"),
]

broken = []
for fname, content in files.items():
    lines = content.split('\n')
    for i, line in enumerate(lines, 1):
        for pat in import_patterns:
            for m in pat.finditer(line):
                mod = m.group(1)
                if mod.startswith('.') or mod.startswith('..'):
                    p = mod.replace('/', os.sep)
                    if p.endswith('.js') or p.endswith('.py'):
                        target = p
                    else:
                        target = p + ('.js' if fname.endswith('.js') else '.py')
                    base = os.path.dirname(os.path.abspath(fname)) if not fname.startswith('/') else os.path.dirname(fname)
                    check = os.path.normpath(os.path.join(base, target))
                    if not os.path.exists(check):
                        broken.append((fname, i, line.strip(), mod, check))

print('=== BROKEN IMPORTS/REQUIRES ===')
for b in broken[:10]:
    print(f"{b[0]}:{b[1]} -> {b[3]} (missing: {b[4]})")

port_pat = re.compile(r'(localhost|127\.0\.0\.1)\s*:\s*(\d+)')
url_pat = re.compile(r'https?://[^\s"\']+')
print('\n=== HARDCODED PORTS/URLS ===')
for fname, content in files.items():
    lines = content.split('\n')
    for i, line in enumerate(lines, 1):
        for m in port_pat.finditer(line):
            print(f"{fname}:{i} {m.group(0)}")
        for m in url_pat.finditer(line):
            print(f"{fname}:{i} {m.group(0)}")

print('\n=== UNCALLED FUNCTIONS (same file) ===')
func_pat_js = re.compile(r'(?:async\s+)?function\s+(\w+)\s*\(')
func_pat_py = re.compile(r'(?:async\s+)?def\s+(\w+)\s*\(')
for fname, content in files.items():
    lines = content.split('\n')
    funcs = {}
    for i, line in enumerate(lines, 1):
        pat = func_pat_js if fname.endswith('.js') else func_pat_py
        for m in pat.finditer(line):
            funcs[m.group(1)] = i
    for func, decl_line in funcs.items():
        calls = re.findall(r'(?<![A-Za-z0-9_])' + re.escape(func) + r'\s*\(', content)
        if len(calls) <= 1:
            print(f"{fname}:{decl_line} {func}() never called")

print('\n=== UNDEFINED VARIABLE REFERENCES (heuristic) ===')
var_pat_js = re.compile(r'\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*')
ref_pat_js = re.compile(r'\b([A-Za-z_][A-Za-z0-9_]*)\b')
globals_js = set(['console','process','require','module','exports','Buffer','JSON','Math','Date','Promise','Set','Map','Error','String','Number','Array','Object','RegExp','setTimeout','setInterval','clearTimeout','clearInterval','fetch','URL','http','https','net','url','path','fs','os','spawn','exec','execSync','WebSocket','EventEmitter'])
globals_py = set(['os','sys','json','time','uuid','gzip','pickle','hashlib','threading','re','OrderedDict','defaultdict','dataclass','field','List','Dict','Optional','Any','Callable','Set','Tuple','datetime','timedelta','print','len','range','sum','max','min','abs','float','int','str','dict','list','set','tuple','open','Exception','True','False','None'])
for fname, content in files.items():
    lines = content.split('\n')
    assigned = set()
    refs = {}
    for i, line in enumerate(lines, 1):
        code = line.split('#')[0].split('//')[0]
        if fname.endswith('.js'):
            for m in var_pat_js.finditer(code):
                assigned.add(m.group(1))
            for m in ref_pat_js.finditer(code):
                v = m.group(1)
                if v not in assigned and v not in globals_js and not v[0].isdigit():
                    if v not in refs:
                        refs[v] = (i, line.strip())
        else:
            m = re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*', code)
            if m:
                assigned.add(m.group(1))
            for m in ref_pat_js.finditer(code):
                v = m.group(1)
                if v not in assigned and v not in globals_py and not v[0].isdigit() and v not in {'self','cls','super'}:
                    if v not in refs:
                        refs[v] = (i, line.strip())
    for v, (i, line) in list(refs.items())[:20]:
        print(f"{fname}:{i} {v} referenced, never assigned")
