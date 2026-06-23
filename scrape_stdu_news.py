"""
石家庄铁道大学新闻爬虫
用法: python scrape_stdu_news.py
"""
import requests
from bs4 import BeautifulSoup
import csv
import time
import re
from datetime import datetime

BASE_URL = "http://www.stdu.edu.cn/"
NEWS_URLS = [
    "http://www.stdu.edu.cn/xww/news.htm",          # 学校新闻
    "http://www.stdu.edu.cn/xww/ztnews.htm",        # 专题新闻
    "http://www.stdu.edu.cn/xww/jxky.htm",          # 教学科研
    "http://www.stdu.edu.cn/xww/xygk.htm",          # 校园广角
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "http://www.stdu.edu.cn/",
}

def fetch_page(url, retries=2):
    for i in range(retries + 1):
        try:
            r = requests.get(url, headers=HEADERS, timeout=15)
            r.encoding = r.apparent_encoding or 'utf-8'
            return r.text
        except Exception as e:
            print(f"  [重试 {i+1}] {url} -> {e}")
            time.sleep(2)
    return ""

def parse_news_list(html, source_name):
    """从列表页提取新闻条目"""
    items = []
    soup = BeautifulSoup(html, 'html.parser')

    # 尝试常见列表容器
    for item in soup.select('li.news-item, li.newslist, div.news-list li, ul.news-list li, dl.news-list dd, ul.list-info li'):
        a = item.select_one('a[href]')
        if not a:
            continue
        title = a.get_text(strip=True)
        href = a.get('href', '')
        # 补全相对链接
        if href and not href.startswith('http'):
            href = requests.compat.urljoin(BASE_URL, href)
        date_tag = item.select_one('span.date, i, em, .time')
        date_str = date_tag.get_text(strip=True) if date_tag else ""
        if title and href:
            items.append({'title': title, 'url': href, 'date': date_str, 'source': source_name})

    # 通用链接列表（fallback）
    if not items:
        for a in soup.select('a[href]'):
            href = a.get('href', '')
            title = a.get_text(strip=True)
            if not title or len(title) < 4:
                continue
            # 过滤导航链接
            if any(k in href.lower() for k in ['javascript', '#', 'login', 'logout']):
                continue
            if href and not href.startswith('http'):
                href = requests.compat.urljoin(BASE_URL, href)
            # 倾向新闻页
            if 'news' in href or 'html' in href or 'info' in href:
                items.append({'title': title, 'url': href, 'date': '', 'source': source_name})

    return items

def main():
    print("=== 石家庄铁道大学新闻爬虫 ===\n")
    all_news = []
    seen = set()

    for url in NEWS_URLS:
        print(f"正在抓取: {url}")
        html = fetch_page(url)
        if not html:
            print(f"  获取失败\n")
            continue
        items = parse_news_list(html, url)
        print(f"  找到 {len(items)} 条")
        for item in items:
            key = item['url']
            if key not in seen:
                seen.add(key)
                all_news.append(item)
        time.sleep(1)

    # 去重后输出
    print(f"\n共 {len(all_news)} 条新闻（去重后）\n")
    for i, n in enumerate(all_news, 1):
        print(f"{i:3d}. [{n['date']}] {n['title']}")
        print(f"     {n['url']}")

    # 保存 CSV
    fname = f"stdu_news_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    with open(fname, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=['title', 'url', 'date', 'source'])
        w.writeheader()
        w.writerows(all_news)
    print(f"\n已保存: {fname}")

if __name__ == '__main__':
    main()
