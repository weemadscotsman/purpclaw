import json, datetime

with open(r'E:\god folder\02_ACTIVE_PROJECTS\here_it_is_10_years_combo\conversations.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

def extract_messages(conv):
    msgs = []
    mapping = conv.get('mapping', {})
    for node_id, node in mapping.items():
        msg = node.get('message')
        if not msg:
            continue
        author = msg.get('author', {}).get('role', 'unknown')
        content = msg.get('content', {})
        parts = content.get('parts', [])
        if parts and author == 'user':
            text = parts[0]
            if isinstance(text, str) and len(text) > 20:
                msgs.append(text[:400])
    return msgs

# 2022 - the origin
print('=== 2022: THE BEGINNING ===')
for conv in data:
    ct = conv.get('create_time', 0)
    if ct:
        year = datetime.datetime.fromtimestamp(ct).year
        if year == 2022:
            print('Title:', conv.get('title', '?'))
            msgs = extract_messages(conv)
            for m in msgs[:5]:
                print('  USER:', m[:300])
            break

print()
print('=== 2023 SAMPLES (first 5 conversations) ===')
count = 0
for conv in data:
    ct = conv.get('create_time', 0)
    if ct:
        year = datetime.datetime.fromtimestamp(ct).year
        if year == 2023:
            count += 1
            if count <= 5:
                print('---')
                print('Title:', conv.get('title', '?'))
                msgs = extract_messages(conv)
                if msgs:
                    print('  USER #1:', msgs[0][:300])
                    if len(msgs) > 1:
                        print('  USER #2:', msgs[1][:300])
                else:
                    print('  (no user messages extracted)')
                print()

print()
print('=== LATER YEARS HIGHLIGHTS ===')
for year in [2024, 2025, 2026]:
    print(f'--- {year} ---')
    count = 0
    for conv in data:
        ct = conv.get('create_time', 0)
        if ct:
            if datetime.datetime.fromtimestamp(ct).year == year:
                count += 1
                if count <= 4:
                    print('Title:', conv.get('title', '?'))
                    msgs = extract_messages(conv)
                    if msgs:
                        print('  USER #1:', msgs[0][:300])
    print()