data = open('E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/cognitive_spine.py', 'rb').read()
lines = data.split(b'\n')
for i in range(323, 330):
    print(repr(lines[i]))
