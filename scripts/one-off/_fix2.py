p = "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/cognitive_spine.py"
with open(p, "rb") as f:
    data = f.read()
start = data.find(b'head_bytes = (')
end = data.find(b').encode("ascii")', start) + len(b').encode("ascii")')
print("start:", start, "end:", end)
print("broken bytes:", data[start:end])
clean = b'        head_bytes = ("\\r\\n".join(head) + "\\r\\n\\r\\n").encode("ascii")\r\n'
print("clean bytes:", clean)
new = data[:start] + clean + data[end:]
with open(p, "wb") as f:
    f.write(new)
print("wrote:", len(new))
