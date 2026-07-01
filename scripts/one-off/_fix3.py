p = 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/cognitive_spine.py'
with open(p, 'rb') as f:
    data = f.read()
# broken: 'head_bytes = ("' + CRLF
broken_needle = b'head_bytes = (\"' + bytes([0x0d, 0x0a])
# want: 'head_bytes = ("\\r\\n' (literal 4 chars: \ r \ n)
fixed_repl = b'head_bytes = (\"\\r\\n'
print('count:', data.count(broken_needle))
data2 = data.replace(broken_needle, fixed_repl, 1)
with open(p, 'wb') as f:
    f.write(data2)
print('wrote:', len(data2))
# verify
i = data2.find(b'head_bytes = (')
print('after hex:', ' '.join(f'{b:02x}' for b in data2[i:i+50]))
