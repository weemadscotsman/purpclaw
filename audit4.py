import re
fnames = ['unified_api.js','orchestrator.js','agent_tower.js','memory_matrix.py','memory_matrix_v2.py']
contents = {f: open(f, encoding='utf-8', errors='replace').read() for f in fnames}
for fname, content in contents.items():
    lines = content.split('\n')
    assigned = set()
    for line in lines:
        code = line.split('//')[0].split('#')[0]
        for m in re.finditer(r'\b(?:const|let|var|function|async\s+function)\s+([A-Za-z_][A-Za-z0-9_]*)', code):
            assigned.add(m.group(1))
        for m in re.finditer(r'\b([A-Za-z_][A-Za-z0-9_]*)\s*=[^=]', code):
            assigned.add(m.group(1))
        for m in re.finditer(r'\b(?:def|class)\s+([A-Za-z_][A-Za-z0-9_]*)', code):
            assigned.add(m.group(1))
    known = set()
    if fname.endswith('.js'):
        known = set('console process require module exports Buffer JSON Math Date Promise Set Map Error String Number Array Object RegExp setTimeout setInterval clearTimeout clearInterval fetch URL http https net url path fs os spawn exec execSync WebSocket EventEmitter URLSearchParams Intl'.split())
    else:
        known = set('os sys json time uuid gzip pickle hashlib threading re OrderedDict defaultdict dataclass field List Dict Optional Any Callable Set Tuple datetime timedelta print len range sum max min abs float int str dict list set tuple open Exception True False None type super self cls'.split())
    for line in lines:
        code = line.split('//')[0].split('#')[0]
        if fname.endswith('.js'):
            for m in re.finditer(r'require\s*\(\s*[\x27\x22]([^\x27\x22]+)[\x27\x22]\s*\)', code):
                mod = m.group(1).split('/')[-1].replace('.js','')
                known.add(mod)
            for m in re.finditer(r'import\s+(?:\{\s*([^}]+)\s*\}|([A-Za-z_][A-Za-z0-9_]*))\s+from', code):
                names = (m.group(1) or m.group(2) or '').split(',')
                for n in names:
                    known.add(n.strip().split(' as ')[0])
        else:
            for m in re.finditer(r'from\s+([^\s]+)\s+import\s+([^#]+)', code):
                names = m.group(2).split(',')
                for n in names:
                    known.add(n.strip().split(' as ')[0])
            for m in re.finditer(r'import\s+([^\s]+)', code):
                known.add(m.group(1).strip())
    refs = {}
    for i, line in enumerate(lines, 1):
        code = line.split('//')[0].split('#')[0]
        code = re.sub(r"'[^']*'", "''", code)
        code = re.sub(r'"[^"]*"', '""', code)
        code = re.sub(r'`[^`]*`', '``', code)
        for m in re.finditer(r'\b([A-Za-z_][A-Za-z0-9_]*)\b', code):
            v = m.group(1)
            if v not in assigned and v not in known and not v[0].isdigit() and len(v) > 1:
                pos = m.start()
                if pos > 0 and code[pos-1] == '.':
                    continue
                if v in ('if','else','for','while','return','new','try','catch','throw','break','continue','switch','case','default','typeof','instanceof','in','of','await','yield','async','const','let','var','function','class','import','from','as','with','void','delete','true','false','null','undefined','this','super','extends','static','get','set','finally','do','debugger','enum','export','implements','interface','package','private','protected','public','readonly','abstract','boolean','byte','char','double','final','float','goto','int','long','native','short','synchronized','transient','volatile','and','or','not','is','pass','lambda','nonlocal','global','assert','del','elif','except','raise','in','None','True','False'):
                    continue
                if v not in refs:
                    refs[v] = (i, line.strip())
    filtered = {}
    for v, (i, line) in refs.items():
        if i > 25:
            filtered[v] = (i, line)
        elif not v[0].isupper():
            filtered[v] = (i, line)
    real = {}
    for v, (i, line) in filtered.items():
        if line.strip().startswith('*') or line.strip().startswith('/*') or line.strip().startswith('*/'):
            continue
        real[v] = (i, line)
    print('=== ' + fname + ' plausible undefined (filtered) ===')
    for v, (i, line) in sorted(real.items(), key=lambda x: x[1][0])[:15]:
        print(f'{fname}:{i} {v}')
    print()
