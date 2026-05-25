const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const ECOS_KEY = process.env.ECOS_KEY || '';
const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// ── 날짜 유틸 ──────────────────────────────────────────────────────
function getDateRange(days) {
  const end   = new Date();
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const fmt   = d => d.toISOString().slice(0,10).replace(/-/g,'');
  return { start: fmt(start), end: fmt(end) };
}

// ── 1. 환율 (한국은행 ECOS 031Y001 - 매매기준율) ──────────────────
app.get('/api/fx', async (req, res) => {
  const pairs = [
    { label: 'USD/KRW', code: 'USD' },
    { label: 'EUR/KRW', code: 'EUR' },
    { label: 'JPY/KRW', code: 'JPY' },
    { label: 'GBP/KRW', code: 'GBP' },
    { label: 'CHF/KRW', code: 'CHF' },
  ];
  const { start, end } = getDateRange(14);

  try {
    const results = await Promise.all(pairs.map(p =>
      fetch(`https://ecos.bok.or.kr/api/StatisticSearch/${ECOS_KEY}/json/kr/1/10/036Y001/D/${start}/${end}/${p.code}`)
        .then(r => r.json())
    ));

    const rates = {};
    pairs.forEach((p, i) => {
      const rows = results[i]?.StatisticSearch?.row?.filter(r => r.DATA_VALUE && r.DATA_VALUE !== '0');
      if (rows?.length) {
        const latest = rows[rows.length - 1];
        const prev   = rows.length > 1 ? rows[rows.length - 2] : null;
        let value = parseFloat(latest.DATA_VALUE);
        // JPY는 100엔 기준으로 변환
        if (p.code === 'JPY') value = value * 100;
        rates[p.label] = {
          value,
          prev: prev ? (p.code === 'JPY' ? parseFloat(prev.DATA_VALUE) * 100 : parseFloat(prev.DATA_VALUE)) : null,
          date: latest.TIME,
        };
      }
    });
    res.json({ success: true, rates });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── 2. 유가 & 원자재 (Yahoo Finance) ──────────────────────────────
app.get('/api/quotes', async (req, res) => {
  const symbols = req.query.symbols || '';
  if (!symbols) return res.status(400).json({ success: false, error: 'symbols required' });

  try {
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice,regularMarketPreviousClose,regularMarketChangePercent,shortName,currency`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    const d = await r.json();
    const quotes = {};
    (d.quoteResponse?.result || []).forEach(q => {
      quotes[q.symbol] = {
        name:     q.shortName || q.symbol,
        price:    q.regularMarketPrice,
        prev:     q.regularMarketPreviousClose,
        pct:      q.regularMarketChangePercent,
        currency: q.currency || 'USD',
      };
    });
    res.json({ success: true, quotes });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── 슬립 방지 (14분마다 자기 자신 핑) ────────────────────────────
setInterval(async () => {
  try {
    await fetch(`${SELF_URL}/`);
    console.log(`[${new Date().toISOString()}] 슬립방지 핑`);
  } catch(e) { console.log('핑 실패:', e.message); }
}, 14 * 60 * 1000);

// ── 헬스체크 ─────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.listen(PORT, () => console.log(`서버 시작: port ${PORT}`));