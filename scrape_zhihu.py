import urllib.request
import json

proxy = urllib.request.ProxyHandler({'http': 'http://127.0.0.1:7890', 'https': 'http://127.0.0.1:7890'})
opener = urllib.request.build_opener(proxy)
opener.addheaders = [
    ('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'),
    ('Accept', 'application/json'),
]
urllib.request.install_opener(opener)

try:
    resp = urllib.request.urlopen('https://www.zhihu.com/api/v4/topstory/hot-lists/total?limit=100', timeout=20)
    data = json.loads(resp.read().decode('utf-8'))
    with open('zhihu_hot_100.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print('OK, items:', len(data.get('data', [])))
except Exception as e:
    print('ERROR:', e)
