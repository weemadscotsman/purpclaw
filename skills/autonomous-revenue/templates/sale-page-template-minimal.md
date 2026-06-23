<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{PRODUCT_NAME}} — {{TAGLINE}}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:{{BG_COLOR}};color:#fff;font-family:system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px}
.container{max-width:600px;width:100%}
{{HEADER_STYLE}}
.price-box{background:{{CARD_BG}};border:1px solid {{ACCENT}}44;border-radius:16px;padding:30px;text-align:center;margin-bottom:25px}
.price{font-size:3rem;font-weight:bold;color:#fff;margin:10px 0}
.price span{font-size:1.2rem;color:#888}
.old{color:#555;text-decoration:line-through;font-size:0.95rem}
.timer{color:#ff6644;font-size:1.4rem;font-weight:bold;margin:10px 0;text-align:center}
.features{background:{{CARD_BG}};border-radius:12px;padding:20px;margin:20px 0}
.features li{list-style:none;padding:7px 0;color:#ccc;font-size:0.9rem;display:flex;align-items:center}
.features li::before{content:'✓';margin-right:10px}
.pay-btn{background:{{ACCENT}};color:#000;border:none;padding:16px 40px;font-size:1.1rem;font-weight:bold;border-radius:10px;cursor:pointer;width:100%;margin:10px 0;text-decoration:none;display:inline-block;text-align:center;transition:transform 0.2s}
.pay-btn:hover{transform:scale(1.03)}
.crypto-box{background:#0a1a10;border:1px solid #00ff8844;border-radius:10px;padding:18px;text-align:center;margin:15px 0}
.addr{background:#040a06;padding:10px;border-radius:6px;font-family:monospace;font-size:0.85rem;word-break:break-all;color:#00cc88;border:1px solid #00ff8822;margin:10px 0}
.copy-btn{background:#00ff88;color:#05060a;border:none;padding:7px 18px;font-size:0.85rem;font-weight:bold;border-radius:6px;cursor:pointer}
.note{background:#111827;border-radius:8px;padding:12px;font-size:0.8rem;color:#6b7280;text-align:center}
</style>
</head>
<body>
<div class="container">
{{HEADER}}

<div class="price-box">
<p class="old">Regular price {{FULL_PRICE}} →</p>
<div class="price">{{DEAL_PRICE}} <span>ONE-TIME</span></div>
<p class="timer">⚡ Today only — 6PM ⚡</p>
</div>

<div class="features">
{{FEATURES_LIST}}
</div>

<a class="pay-btn" href="https://www.paypal.me/weemadscotsman38/{{PAYPAL_AMOUNT}}">💳 PAY WITH PAYPAL — ${{PAYPAL_AMOUNT}}</a>

<div class="crypto-box">
<p style="color:#888;font-size:0.9rem">Or USDT (TRON):</p>
<div class="addr">{{TRC20_ADDRESS}}</div>
<button class="copy-btn" onclick="copy()">📋 COPY USDT ADDRESS</button>
</div>

<div class="note">
After payment: PayPal → email weemadscotsman38@gmail.com with "Product Name"<br>
USDT → Telegram @cannonaionews with TX hash
</div>
</div>

<script>
function copy(){
  navigator.clipboard.writeText('{{TRC20_ADDRESS}}');
  document.querySelector('.copy-btn').textContent='✅';
  setTimeout(()=>document.querySelector('.copy-btn').textContent='📋 COPY USDT ADDRESS',2000);
}
</script>
</body>
</html>