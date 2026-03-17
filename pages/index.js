import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';

const PAIRS = [
  { key:'EURUSD',  label:'EUR/USD', pip:0.0001, group:'Majors'    },
  { key:'GBPUSD',  label:'GBP/USD', pip:0.0001, group:'Majors'    },
  { key:'AUDUSD',  label:'AUD/USD', pip:0.0001, group:'Majors'    },
  { key:'NZDUSD',  label:'NZD/USD', pip:0.0001, group:'Majors'    },
  { key:'USDJPY',  label:'USD/JPY', pip:0.01,   group:'Majors'    },
  { key:'USDCAD',  label:'USD/CAD', pip:0.0001, group:'Majors'    },
  { key:'USDCHF',  label:'USD/CHF', pip:0.0001, group:'Majors'    },
  { key:'EURJPY',  label:'EUR/JPY', pip:0.01,   group:'Yen Cross' },
  { key:'GBPJPY',  label:'GBP/JPY', pip:0.01,   group:'Yen Cross' },
  { key:'AUDJPY',  label:'AUD/JPY', pip:0.01,   group:'Yen Cross' },
  { key:'NZDJPY',  label:'NZD/JPY', pip:0.01,   group:'Yen Cross' },
  { key:'CADJPY',  label:'CAD/JPY', pip:0.01,   group:'Yen Cross' },
  { key:'CHFJPY',  label:'CHF/JPY', pip:0.01,   group:'Yen Cross' },
  { key:'EURGBP',  label:'EUR/GBP', pip:0.0001, group:'EUR Cross' },
  { key:'EURAUD',  label:'EUR/AUD', pip:0.0001, group:'EUR Cross' },
  { key:'EURNZD',  label:'EUR/NZD', pip:0.0001, group:'EUR Cross' },
  { key:'EURCAD',  label:'EUR/CAD', pip:0.0001, group:'EUR Cross' },
  { key:'EURCHF',  label:'EUR/CHF', pip:0.0001, group:'EUR Cross' },
  { key:'GBPAUD',  label:'GBP/AUD', pip:0.0001, group:'GBP Cross' },
  { key:'GBPNZD',  label:'GBP/NZD', pip:0.0001, group:'GBP Cross' },
  { key:'GBPCAD',  label:'GBP/CAD', pip:0.0001, group:'GBP Cross' },
  { key:'GBPCHF',  label:'GBP/CHF', pip:0.0001, group:'GBP Cross' },
  { key:'AUDNZD',  label:'AUD/NZD', pip:0.0001, group:'Commodity' },
  { key:'AUDCAD',  label:'AUD/CAD', pip:0.0001, group:'Commodity' },
  { key:'AUDCHF',  label:'AUD/CHF', pip:0.0001, group:'Commodity' },
  { key:'NZDCAD',  label:'NZD/CAD', pip:0.0001, group:'Commodity' },
  { key:'NZDCHF',  label:'NZD/CHF', pip:0.0001, group:'Commodity' },
  { key:'CADCHF',  label:'CAD/CHF', pip:0.0001, group:'Commodity' },
  { key:'XAUUSD',  label:'GOLD',    pip:0.1,    group:'Metals'    },
  { key:'XAGUSD',  label:'SILVER',  pip:0.001,  group:'Metals'    },
];

const HIGH_LEVELS = new Set(['yh','pdh','wh','mh']);
const LEVEL_ORDER = ['yh','yl','pdh','pdl','wh','wl','mh','ml'];
const LEVEL_NAMES = { yh:'YH',yl:'YL',pdh:'PDH',pdl:'PDL',wh:'WH',wl:'WL',mh:'MH',ml:'ML' };
const GROUPS = ['ALL','Majors','Yen Cross','EUR Cross','GBP Cross','Commodity','Metals'];

function scanPair(price, data, pip, prox) {
  if (!price || !data) return null;
  let best = null;
  for (const k of LEVEL_ORDER) {
    const v = data[k];
    if (!v) continue;
    const dist = Math.abs(price - v) / pip;
    if (!best || dist < best.dist) best = { name:LEVEL_NAMES[k], key:k, val:v, dist, isHigh:HIGH_LEVELS.has(k) };
  }
  if (!best) return null;
  const isAt = best.dist <= prox * 0.30;
  const isNear = best.dist <= prox;
  return { ...best, dist:Math.round(best.dist), isAt, isNear, label: isAt ? `AT ${best.name}` : isNear ? `Near ${best.name}` : best.name, status: isAt ? 'AT' : isNear ? 'NEAR' : 'FAR' };
}

function playAlert(isHigh) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const freqs = isHigh ? [880,1100,880] : [440,550,440];
    freqs.forEach((freq,i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = freq; o.type = 'sine';
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.35,t);
      g.gain.exponentialRampToValueAtTime(0.001, t+0.22);
      o.start(t); o.stop(t+0.22);
    });
    if (navigator.vibrate) navigator.vibrate([100,60,100,60,200]);
  } catch(_) {}
  }

export default function Scanner() {
  const [data,      setData]      = useState({});
  const [prox,      setProx]      = useState(10);
  const [tab,       setTab]       = useState('scanner');
  const [filter,    setFilter]    = useState('ALL');
  const [soundOn,   setSoundOn]   = useState(true);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [alerts,    setAlerts]    = useState([]);
  const [time,      setTime]      = useState('');
  const alertedRef = useRef(new Set());

  useEffect(() => {
    const tick = () => setTime(new Date().toTimeString().slice(0,8));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const fetchLevels = useCallback(async () => {
    try {
      setError(null);
      const res  = await fetch('/api/levels');
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed to load');
      setData(json.data);
      setUpdatedAt(json.updatedAt);
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLevels();
    const t = setInterval(fetchLevels, 15 * 60 * 1000);
    return () => clearInterval(t);
  }, [fetchLevels]);

  const results = PAIRS.map(p => {
    const pData = data[p.key];
    const price = pData?.price;
    const scan  = price ? scanPair(price, pData, p.pip, prox) : null;
    return { ...p, price, scan };
  });

  useEffect(() => {
    results.forEach(r => {
      if (!r.scan?.isAt) return;
      const key = `${r.key}:${r.scan.name}`;
      if (alertedRef.current.has(key)) return;
      alertedRef.current.add(key);
      if (soundOn) playAlert(r.scan.isHigh);
      setAlerts(prev => [{ id:Date.now()+Math.random(), pair:r.label, level:r.scan.name, price:r.price, isHigh:r.scan.isHigh, time:new Date().toTimeString().slice(0,8) }, ...prev].slice(0,50));
    });
  }, [results, soundOn]);

  const filtered = filter === 'ALL' ? results : results.filter(r => r.group === filter);
  const atCount   = results.filter(r => r.scan?.isAt).length;
  const nearCount = results.filter(r => r.scan?.isNear && !r.scan?.isAt).length;

  const rowBg = (s) => {
    if (!s) return 'transparent';
    if (s.isAt && s.isHigh)    return 'rgba(180,30,30,0.28)';
    if (s.isAt && !s.isHigh)   return 'rgba(10,140,60,0.25)';
    if (s.isNear && s.isHigh)  return 'rgba(180,30,30,0.10)';
    if (s.isNear && !s.isHigh) return 'rgba(10,140,60,0.10)';
    return 'transparent';
  };
  const lblColor = (s) => {
    if (!s || s.status==='FAR') return '#2a4055';
    return s.isHigh ? (s.isAt?'#ff8888':'#cc5555') : (s.isAt?'#66ffaa':'#33aa66');
  };
  const distColor = (d) => d<=3?'#ff3333':d<=8?'#ff9933':d<=15?'#ffee44':'#2a4055';
  export default function Scanner() {
  const [data,      setData]      = useState({});
  const [prox,      setProx]      = useState(10);
  const [tab,       setTab]       = useState('scanner');
  const [filter,    setFilter]    = useState('ALL');
  const [soundOn,   setSoundOn]   = useState(true);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [alerts,    setAlerts]    = useState([]);
  const [time,      setTime]      = useState('');
  const alertedRef = useRef(new Set());

  useEffect(() => {
    const tick = () => setTime(new Date().toTimeString().slice(0,8));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const fetchLevels = useCallback(async () => {
    try {
      setError(null);
      const res  = await fetch('/api/levels');
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed to load');
      setData(json.data);
      setUpdatedAt(json.updatedAt);
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLevels();
    const t = setInterval(fetchLevels, 15 * 60 * 1000);
    return () => clearInterval(t);
  }, [fetchLevels]);

  const results = PAIRS.map(p => {
    const pData = data[p.key];
    const price = pData?.price;
    const scan  = price ? scanPair(price, pData, p.pip, prox) : null;
    return { ...p, price, scan };
  });

  useEffect(() => {
    results.forEach(r => {
      if (!r.scan?.isAt) return;
      const key = `${r.key}:${r.scan.name}`;
      if (alertedRef.current.has(key)) return;
      alertedRef.current.add(key);
      if (soundOn) playAlert(r.scan.isHigh);
      setAlerts(prev => [{ id:Date.now()+Math.random(), pair:r.label, level:r.scan.name, price:r.price, isHigh:r.scan.isHigh, time:new Date().toTimeString().slice(0,8) }, ...prev].slice(0,50));
    });
  }, [results, soundOn]);

  const filtered = filter === 'ALL' ? results : results.filter(r => r.group === filter);
  const atCount   = results.filter(r => r.scan?.isAt).length;
  const nearCount = results.filter(r => r.scan?.isNear && !r.scan?.isAt).length;

  const rowBg = (s) => {
    if (!s) return 'transparent';
    if (s.isAt && s.isHigh)    return 'rgba(180,30,30,0.28)';
    if (s.isAt && !s.isHigh)   return 'rgba(10,140,60,0.25)';
    if (s.isNear && s.isHigh)  return 'rgba(180,30,30,0.10)';
    if (s.isNear && !s.isHigh) return 'rgba(10,140,60,0.10)';
    return 'transparent';
  };
  const lblColor = (s) => {
    if (!s || s.status==='FAR') return '#2a4055';
    return s.isHigh ? (s.isAt?'#ff8888':'#cc5555') : (s.isAt?'#66ffaa':'#33aa66');
  };
  const distColor = (d) => d<=3?'#ff3333':d<=8?'#ff9933':d<=15?'#ffee44':'#2a4055';
