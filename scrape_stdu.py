"""
石家庄铁道大学新闻爬虫
用法: python scrape_stdu.py
"""
import urllib.request
import re
import json
from datetime import datetime


def fetch(url, encoding='utf-8'):
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.read().decode(encoding, errors='replace')
    except Exception as e:
        return None


def parse_news_list(html):
    """从首页或列表页提取新闻条目"""
    results = []
    # 匹配 <a href="..." title="...">...</a> 风格的新闻链接
    pattern = re.compile(
        r'<a[^>]+href=["\']([^"\']+)["\'][^>]*title=["\']([^"\']+)["\']([^>]*)>([^<]+)</a>',
        re.IGNORECASE
    )
    for m in pattern.finditer(html):
        href = m.group(1).strip()
        title = m.group(2).strip() or m.group(4).strip()
        # 过滤掉导航、空白等
        if len(title) < 5 or any(k in title.lower() for k in ['导航', '首页', '登录', '注册', '关于', '联系']):
            continue
        if not href.startswith('http'):
            href = 'http://www.stdu.edu.cn' + href
        results.append({'title': title, 'url': href})
    return results


def main():
    base = 'http://www.stdu.edu.cn'
    # 常见新闻栏目页
    pages = [
        f'{base}/news/',
        f'{base}/news/index.html',
        f'{base}/news/xxjj.htm',
        f'{base}/xww/',
        f'{base}/xww/index.htm',
    ]
    
    all_news = []
    seen = set()
    
    for url in pages:
        print(f'Fetching: {url}')
        html = fetch(url)
        if not html:
            print(f'  -> Failed')
            continue
        items = parse_news_list(html)
        print(f'  -> Found {len(items)} items')
        for item in items:
            if item['url'] not in seen:
                seen.add(item['url'])
                all_news.append(item)
    
    # 去重
    all_news = list({v['url']: v for v in all_news}.values())
    
    print(f'\n总计: {len(all_news)} 条新闻\n')
    for i, n in enumerate(all_news, 1):
        print(f"{i}. {n['title']}")
        print(f"   {n['url']}")
    
    # 保存 JSON
    out = f"stdu_news_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(all_news, f, ensure_ascii=False, indent=2)
    print(f'\n已保存到 {out}')


if __name__ == '__main__':
    main()
