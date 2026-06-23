import json, datetime
import sys

# Force UTF-8 output
sys.stdout.reconfigure(encoding='utf-8')

with open(r'E:\god folder\02_ACTIVE_PROJECTS\here_it_is_10_years_combo\conversations.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print('=== YEAR-BY-YEAR BIG THEMES ===')
for year in [2022, 2023, 2024, 2025, 2026]:
    print(f'\n--- {year} ---')
    year_convs = []
    for conv in data:
        ct = conv.get('create_time', 0)
        if ct:
            if datetime.datetime.fromtimestamp(ct).year == year:
                year_convs.append(conv)
    print(f'  {len(year_convs)} conversations')
    topics = {}
    for conv in year_convs:
        t = conv.get('title', '?')[:60]
        t_lower = t.lower()
        if any(w in t_lower for w in ['code', 'build', 'program', 'script', 'bot', 'api', 'app']):
            cat = 'TECH/BUILD'
        elif any(w in t_lower for w in ['design', 'logo', 'brand', 'marketing', 'launch']):
            cat = 'BRAND/BUSINESS'
        elif any(w in t_lower for w in ['trading', 'crypto', 'bitcoin', 'xrp', 'invest']):
            cat = 'TRADING/FINANCE'
        elif any(w in t_lower for w in ['write', 'letter', 'document', 'legal']):
            cat = 'WRITING/LEGAL'
        elif any(w in t_lower for w in ['health', 'medical', 'treatment']):
            cat = 'HEALTH'
        elif any(w in t_lower for w in ['family', 'son', 'home', 'school', 'social care']):
            cat = 'PERSONAL'
        elif any(w in t_lower for w in ['music', 'audio', 'sound']):
            cat = 'AUDIO/MUSIC'
        elif any(w in t_lower for w in ['game', 'vr', 'sim', 'pixel', 'arcade']):
            cat = 'GAMING'
        else:
            cat = 'OTHER'
        topics[cat] = topics.get(cat, 0) + 1
    for cat, cnt in sorted(topics.items(), key=lambda x: -x[1]):
        print(f'  {cat}: {cnt}')

print()
print('=== KEY EDDIE LIFE EVENTS (from titles + first messages) ===')
key_markers = {
    'surgery': [],
    'body failing': [],
    'health crisis': [],
    'family crisis': [],
    'funding struggles': [],
    'son wellbeing': [],
    'financial stress': [],
}
for conv in data:
    t = conv.get('title', '').lower()
    msgs = []
    mapping = conv.get('mapping', {})
    for node_id, node in mapping.items():
        msg = node.get('message')
        if not msg:
            continue
        if msg.get('author', {}).get('role') == 'user':
            parts = msg.get('content', {}).get('parts', [])
            if parts and isinstance(parts[0], str):
                msgs.append(parts[0])
    full = ' '.join(msgs[:3]).lower()
    combined = t + ' ' + full

    ct = conv.get('create_time', 0)
    dt = datetime.datetime.fromtimestamp(ct).strftime('%Y-%m-%d') if ct else '?'

    if 'surgery' in combined or 'operation' in combined:
        print(f"[{dt}] SURGERY: {conv.get('title', '?')[:60]}")
    if 'body' in combined and ('fail' in combined or 'dying' in combined or 'borderline' in combined):
        print(f"[{dt}] BODY CRISIS: {conv.get('title', '?')[:60]}")
    if 'son' in combined and ('school' in combined or 'social care' in combined or 'wellbeing' in combined):
        print(f"[{dt}] SON/SCHOOL: {conv.get('title', '?')[:60]}")
    if any(w in combined for w in ['grant', 'funding', 'cant afford', 'money problems', 'struggling']):
        print(f"[{dt}] MONEY/FUNDING: {conv.get('title', '?')[:60]}")

print()
print('=== 2025 KEY BUILD MOMENTS ===')
for conv in data:
    ct = conv.get('create_time', 0)
    if ct:
        if datetime.datetime.fromtimestamp(ct).year == 2025:
            t = conv.get('title', '?')
            if any(w in t.lower() for w in ['dreamforge', 'echo', 'spine', 'her', 'ai agent', 'autonomous', 'mcp', 'terminal']):
                dt = datetime.datetime.fromtimestamp(ct).strftime('%Y-%m-%d')
                print(f"[{dt}] {t[:80]}")