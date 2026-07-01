import io

p = 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/cognitive_spine.py'
with open(p, 'rb') as f:
    data = f.read()

idx = data.find(b'head_bytes')
print("found at", idx)
print("surrounding:")
print(repr(data[idx:idx+200]))
