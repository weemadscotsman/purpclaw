import json, datetime

with open(r'E:\god folder\02_ACTIVE_PROJECTS\here_it_is_10_years_combo\conversations.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

def extract_all_messages(conv):
    msgs = []
    mapping = conv.get('mapping', {})
    for node_id, node in mapping.items():
        msg = node.get('message')
        if not msg:
            continue
        author = msg.get('author', {}).get('role', 'unknown')
        content = msg.get('content', {})
        parts = content.get('parts', [])
        if parts:
            text = parts[0]
            if isinstance(text, str) and len(text) > 15:
                msgs.append({'role': author, 'text': text[:500]})
    return msgs

print('=== PERSONAL / EMOTIONAL THEMES ===')
personal_keywords = ['family', 'son', 'dad', 'mum', 'mother', 'father', 'wife', 'girlfriend', 'boyfriend', 'alone', 'tired', 'depressed', 'anxious', 'stressed', 'lonely', 'grief', 'loss', 'health', 'money problems', 'can\'t afford', 'struggle', 'failed', 'failure', 'sorry', 'apologise', 'help me', 'scared', 'worried', 'upset']

for conv in data:
    msgs = extract_all_messages(conv)
    full_text = ' '.join([m['text'] for m in msgs]).lower()
    for kw in personal_keywords:
        if kw.lower() in full_text:
            ct = conv.get('create_time', 0)
            dt = datetime.datetime.fromtimestamp(ct).strftime('%Y-%m-%d') if ct else '?'
            print(f"[{dt}] {conv.get('title', '?')[:60]}")
            print(f'  Match: "{kw}"')
            # print first user message
            for m in msgs:
                if m['role'] == 'user':
                    print(f'  USER: {m["text"][:200]}')
                    break
            print()
            break

print()
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
    # get unique first words of titles to see topics
    topics = {}
    for conv in year_convs:
        t = conv.get('title', '?')[:60]
        # rough categorization
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
        elif any(w in t_lower for w in ['family', 'son', 'home']):
            cat = 'PERSONAL'
        else:
            cat = 'OTHER'
        topics[cat] = topics.get(cat, 0) + 1
    for cat, cnt in sorted(topics.items(), key=lambda x: -x[1]):
        print(f'  {cat}: {cnt} conversations')