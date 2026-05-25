const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// ── 환율 (Frankfurter = ECB 기준, 무료·무제한) ────────────────────
app.get('/api/fx', async (req, res) => {
  try {
    const pairs = [
      { label: 'USD/KRW', from: 'USD' },
      { label: 'EUR/KRW', from: 'EUR' },
      { label: 'JPY/KRW', from: 'JPY' },
      { label: 'GBP/KRW', from: 'GBP' },
      { label: 'CHF/KRW', from: 'CHF' },
    ];

    const results = await Promise.all(pairs.map(p =>
      fetch(`https://api.frankfurter.app/latest?from=${p.from}&to=KRW`)
        .then(r => r.json())
    ));

    const rates = {};
    pairs.forEach((p, i) => {
      let value = results[i]?.rates?.KRW;
      if (value) {
        // JPY는 100엔 기준
        if (p.from === 'JPY') value = value * 100;
        rates[p.label] = {
          value,
          date: results[i].date,
        };
      }
    });

    // 전일 대비 변화율 계산
    const yesterday = new Date(Date.now() - 24*60*60*1000).toISOString().slice(0,10);
    const prevResults = await Promise.all(pairs.map(p =>
      fetch(`https://api.frankfurter.app/${yesterday}?from=${p.from}&to=KRW`)
        .then(r => r.json())
    ));
    pairs.forEach((p, i) => {
      let prev = prevResults[i]?.rates?.KRW;
      if (prev && rates[p.label]) {
        if (p.from === 'JPY') prev = prev * 100;
        rates[p.label].prev = prev;
      }
    });

    res.json({ success: true, rates });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── 슬립 방지 (14분마다 핑) ───────────────────────────────────────
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