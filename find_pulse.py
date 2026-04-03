import json, datetime

with open(r'E:\god folder\02_ACTIVE_PROJECTS\here_it_is_10_years_combo\conversations.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

keywords = ['pulse', 'pulsesworld', 'pulsw', 'pulsee']
results = []

for conv in data:
    t = conv.get('title', '').lower()
    for kw in keywords:
        if kw in t:
            ct = conv.get('create_time', 0)
            dt = datetime.datetime.fromtimestamp(ct).strftime('%Y-%m-%d') if ct else '?'
            results.append((dt, conv.get('title', '?')))
            break

if results:
    for dt, title in results:
        print(f'[{dt}] {title}')
else:
    print('No PulseWorld found in titles. Trying full text search...')
    for conv in data:
        msgs = []
        mapping = conv.get('mapping', {})
        for node_id, node in mapping.items():
            msg = node.get('message')
            if not msg:
                continue
            if msg.get('author', {}).get('role') == 'user':
                parts = msg.get('content', {}).get('parts', [])
                for p in parts:
                    if isinstance(p, str) and any(kw in p.lower() for kw in keywords):
                        ct = conv.get('create_time', 0)
                        dt = datetime.datetime.fromtimestamp(ct).strftime('%Y-%m-%d') if ct else '?'
                        print(f'[{dt}] {conv.get("title", "?")[:60]}')
                        print(f'  USER: {p[:150]}...')
                        break