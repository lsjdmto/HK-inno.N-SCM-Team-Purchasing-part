const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// CORS 허용 (대시보드 HTML에서 접근 가능하게)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// ── 1. 환율 (Frankfurter = ECB 기준, 무료·무제한) ──────────────────
app.get('/api/fx', async (req, res) => {
  try {
    const pairs = ['USD','EUR','GBP','CHF','JPY'];
    const results = await Promise.all(
      pairs.map(base =>
        fetch(`https://api.frankfurter.app/latest?from=${base}&to=KRW`)
          .then(r => r.json())
      )
    );
    const data = {};
    pairs.forEach((base, i) => {
      data[base] = results[i].rates?.KRW ?? null;
    });
    // JPY는 100엔 기준으로 변환
    if (data.JPY) data.JPY_100 = data.JPY * 100;
    res.json({ success: true, rates: data, date: results[0].date });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── 2. 유가·원자재 (Yahoo Finance) ─────────────────────────────────
app.get('/api/quotes', async (req, res) => {
  const symbols = req.query.symbols || 'BZ=F,CL=F,NG=F,RB=F,PA=F,ZL=F,ZC=F,ALI=F,GC=F,SI=F,HG=F';
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbols.split(',')[0]}`;
    // v7 quote API (복수 심볼)
    const r = await fetch(
      `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice,regularMarketPreviousClose,regularMarketChangePercent,shortName`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json',
        }
      }
    );
    const d = await r.json();
    const quotes = {};
    (d.quoteResponse?.result || []).forEach(q => {
      quotes[q.symbol] = {
        name:  q.shortName || q.symbol,
        price: q.regularMarketPrice,
        prev:  q.regularMarketPreviousClose,
        pct:   q.regularMarketChangePercent,
      };
    });
    res.json({ success: true, quotes });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── 3. 헬스체크 ────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Pharma Dashboard Proxy', time: new Date().toISOString() });
});

app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
