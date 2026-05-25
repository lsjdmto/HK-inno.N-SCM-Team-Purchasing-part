const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// ECOS, FRED API 키 (환경변수 또는 직접 입력)
const ECOS_KEY = process.env.ECOS_KEY || 'YOUR_ECOS_KEY';
const FRED_KEY = process.env.FRED_KEY || 'YOUR_FRED_KEY';

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// ── 1. 환율 (한국은행 ECOS) ────────────────────────────────────────
app.get('/api/fx', async (req, res) => {
  const pairs = [
    {label:'USD/KRW', code:'0000001'},
    {label:'EUR/KRW', code:'0000053'},
    {label:'JPY/KRW', code:'0000034'},
    {label:'GBP/KRW', code:'0000003'},
    {label:'CHF/KRW', code:'0000006'},
  ];
  const today = new Date();
  const end   = today.toISOString().slice(0,10).replace(/-/g,'');
  const start = new Date(today - 10*24*60*60*1000).toISOString().slice(0,10).replace(/-/g,'');

  try {
    const results = await Promise.all(pairs.map(p =>
      fetch(`https://ecos.bok.or.kr/api/StatisticSearch/${ECOS_KEY}/json/kr/1/5/731Y001/D/${start}/${end}/${p.code}`)
        .then(r => r.json())
    ));
    const rates = {};
    pairs.forEach((p, i) => {
      const rows = results[i]?.StatisticSearch?.row;
      if (rows?.length) {
        const latest = rows[rows.length - 1];
        const prev   = rows.length > 1 ? rows[rows.length - 2] : null;
        rates[p.label] = {
          value: parseFloat(latest.DATA_VALUE),
          prev:  prev ? parseFloat(prev.DATA_VALUE) : null,
          date:  latest.TIME,
        };
      }
    });
    res.json({ success: true, rates });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── 2. 유가 (FRED) ────────────────────────────────────────────────
app.get('/api/oil', async (req, res) => {
  const items = [
    {label:'브렌트유', series:'DCOILBRENTEU', unit:'USD/bbl'},
    {label:'WTI유',   series:'DCOILWTICO',   unit:'USD/bbl'},
    {label:'천연가스', series:'DHHNGSP',      unit:'USD/MMBtu'},
    {label:'에탄올',  series:'W_EPOETBE_PRS_NUS_DPG', unit:'USD/gal'},
  ];
  const start = new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10);
  try {
    const results = await Promise.all(items.map(item =>
      fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=${item.series}&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=5&observation_start=${start}`)
        .then(r => r.json())
    ));
    const data = {};
    items.forEach((item, i) => {
      const obs = results[i]?.observations?.filter(o => o.value !== '.');
      if (obs?.length) {
        data[item.label] = {
          value: parseFloat(obs[0].value),
          prev:  obs.length > 1 ? parseFloat(obs[1].value) : null,
          date:  obs[0].date,
          unit:  item.unit,
        };
      }
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── 3. 원자재 (FRED) ─────────────────────────────────────────────
app.get('/api/materials', async (req, res) => {
  const items = [
    {label:'알루미늄', series:'PALUMUSDM',   unit:'USD/MT'},
    {label:'옥수수',   series:'PMAIZMTUSDM', unit:'USD/MT'},
    {label:'대두유',   series:'PSOYBUSDM',   unit:'USD/MT'},
    {label:'팔라듐',   series:'PPALAUSDM',   unit:'USD/troy oz'},
  ];
  const start = new Date(Date.now() - 90*24*60*60*1000).toISOString().slice(0,10);
  try {
    const results = await Promise.all(items.map(item =>
      fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=${item.series}&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=3&observation_start=${start}`)
        .then(r => r.json())
    ));
    const data = {};
    items.forEach((item, i) => {
      const obs = results[i]?.observations?.filter(o => o.value !== '.');
      if (obs?.length) {
        data[item.label] = {
          value: parseFloat(obs[0].value),
          prev:  obs.length > 1 ? parseFloat(obs[1].value) : null,
          date:  obs[0].date,
          unit:  item.unit,
        };
      }
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── 4. 슬립 방지 (14분마다 자기 자신 핑) ─────────────────────────
const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
setInterval(async () => {
  try {
    await fetch(`${SELF_URL}/`);
    console.log(`[${new Date().toISOString()}] 슬립 방지 핑 완료`);
  } catch(e) {
    console.log('핑 실패:', e.message);
  }
}, 14 * 60 * 1000);

// ── 헬스체크 ─────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Pharma Dashboard Proxy', time: new Date().toISOString() });
});

app.listen(PORT, () => console.log(`서버 시작: port ${PORT}`));