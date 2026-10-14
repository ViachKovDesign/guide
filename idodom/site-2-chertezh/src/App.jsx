import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRoute } from './route.js';
import { initLenis, scroller, scrollNow, currentScroll, stopScroll, startScroll, reduceMotion } from './scroll.js';
import { Header, Cursor, GridOverlay, Toast } from './ui.jsx';
import { Rail, maxScroll, cycleStart } from './rail.jsx';
import { CasePage, InfoPage } from './pages.jsx';
import { CATS, counts, byId } from './data.js';

/* Переход между страницами: уход — в размытие и лёгкое уменьшение, вход — обратно. */
const pageVariants = {
  initial: { opacity: 0, scale: 0.94, filter: 'blur(14px)' },
  enter: { opacity: 1, scale: 1, filter: 'blur(0px)' },
  exit: { opacity: 0, scale: 0.94, filter: 'blur(14px)' }
};
const pageTransition = { duration: reduceMotion ? 0.01 : 0.62, ease: [0.22, 1, 0.36, 1] };

function HomeUI({ cat }) {
  const pct = useRef(null);
  useEffect(() => {
    const l = scroller.lenis; if (!l) return;
    const f = () => { const m = maxScroll(); if (pct.current) pct.current.textContent = String(Math.min(100, Math.round((l.scroll / Math.max(1, m)) * 100))).padStart(2, '0'); };
    f(); l.on('scroll', f); return () => l.off('scroll', f);
  }, []);
  const keys = ['all', 'soft', 'tables', 'chairs', 'figures'];
  return (
    <motion.div className="home-ui" variants={pageVariants} initial="initial" animate="enter" exit="exit" transition={pageTransition}>
      <div className="home-ui__tag">
        <p>Пространство, которое говорит о вас</p>
        <p>Современная мебель, интерьер и дизайн.</p>
      </div>
      <ul className="filters" aria-label="Фильтр по разделам">
        {keys.map(k => (
          <li key={k}>
            <a href={k === 'all' ? '#/' : '#/c/' + k} className={cat === k ? 'is-on' : ''} aria-current={cat === k ? 'true' : undefined}>
              {cat === k && <motion.i layoutId="filter-mark" className="filters__mark" transition={{ duration: 0.6, ease: [0.65, 0, 0.35, 1] }} />}
              <span>{k === 'all' ? 'Все проекты' : CATS[k]}</span><sup>{counts[k]}</sup>
            </a>
          </li>
        ))}
      </ul>
      <div className="home-ui__meta"><span>Листайте</span><i /><b ref={pct}>00</b><em>%</em></div>
    </motion.div>
  );
}

function Page({ route }) {
  const ref = useRef(null);
  // страница в потоке высокая: масштабируем вокруг видимой середины экрана
  useEffect(() => {
    const el = ref.current, l = scroller.lenis; if (!el) return;
    const upd = () => { el.style.transformOrigin = '50% ' + (currentScroll() + innerHeight / 2) + 'px'; };
    upd(); if (l) l.on('scroll', upd); return () => { if (l) l.off('scroll', upd); };
  }, []);
  return (
    <motion.main ref={ref} className="page" variants={pageVariants} initial="initial" animate="enter" exit="exit" transition={pageTransition}>
      {route.name === 'case' ? <CasePage id={route.id} /> : <InfoPage page={route.page} />}
    </motion.main>
  );
}

export default function App() {
  const route = useRoute();
  const routeRef = useRef(route); routeRef.current = route;
  const isHome = route.name === 'home';
  const [homeCat, setHomeCat] = useState(isHome ? route.cat : 'all');
  const [railMode, setRailMode] = useState(isHome ? 'home' : 'case');
  const [offset, setOffset] = useState(isHome ? 0 : -1400);
  const [shifting, setShifting] = useState(false);
  const [relayout, setRelayout] = useState(false);
  const [shownKey, setShownKey] = useState(route.key);
  const [grid, setGrid] = useState(true);
  const [toast, setToast] = useState('');
  const saved = useRef(0);
  const railModeRef = useRef(railMode); railModeRef.current = railMode;
  const offsetRef = useRef(offset); offsetRef.current = offset;
  const first = useRef(true);

  useEffect(() => { initLenis(); }, []);

  // фильтр: мозаика пересобирается, кадры переезжают на новые места
  useEffect(() => {
    if (!isHome) return;
    if (route.cat !== homeCat) {
      setHomeCat(route.cat); setRelayout(true);
      if (route.cat !== 'all' && scroller.lenis) scroller.lenis.scrollTo(cycleStart(currentScroll()), { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
      const t = setTimeout(() => setRelayout(false), 2600); return () => clearTimeout(t);
    }
  }, [route, isHome, homeCat]);

  // уходим с главной: запоминаем место в мозаике и замираем на время перехода
  const prev = useRef(route);
  useEffect(() => {
    const was = prev.current; prev.current = route;
    if (was.key !== route.key) {
      if (was.name === 'home' && route.name !== 'home') saved.current = currentScroll();
      stopScroll();
    }
  }, [route]);

  useEffect(() => {
    document.body.dataset.route = isHome ? 'home' : 'case';
    const p = route.name === 'case' ? byId[route.id] : null;
    document.title = (p ? p.name + ' — ' : route.name === 'page' ? { views: 'Ракурсы', about: 'О нас', contacts: 'Контакты' }[route.page] + ' — ' : '') + 'IDODOM — Home priority';
  }, [route, isHome]);

  // страница ушла: переставляем мозаику (фиксируем на кейсе / возвращаем в поток на главной)
  const onExitComplete = useCallback(() => {
    const r = routeRef.current;
    if (r.name === 'home') {
      if (railModeRef.current === 'case') { saved.current = Math.max(0, Math.min(-offsetRef.current, maxScroll())); setShifting(false); setRailMode('home'); }
    } else if (railModeRef.current === 'home') {
      setShifting(false); setOffset(-saved.current); setRailMode('case');
    } else {
      setShifting(true); setOffset(o => o - Math.round(520 + Math.random() * 520));
    }
    setShownKey(r.key);
  }, []);

  // сразу после смены режима рельса (до отрисовки) ставим прокрутку: на кейсе — вверх, на главной — туда, где остановились
  useLayoutEffect(() => {
    if (first.current) { first.current = false; return; }
    scrollNow(routeRef.current.name === 'home' ? saved.current : 0);
    startScroll();
  }, [shownKey, railMode]);

  useEffect(() => {
    const f = (e) => { if ((e.key === 'g' || e.key === 'п') && !/input|textarea/i.test(e.target.tagName)) setGrid(g => !g); };
    addEventListener('keydown', f); return () => removeEventListener('keydown', f);
  }, []);

  const share = useCallback(async () => {
    const url = location.href;
    try { await navigator.clipboard.writeText(url); setToast('Ссылка скопирована'); } catch (e) { setToast('Скопируйте ссылку из адресной строки'); }
    setTimeout(() => setToast(''), 2200);
  }, []);

  return (
    <>
      <GridOverlay show={grid} />
      <Cursor />
      <Header route={route} cat={homeCat} onShare={share} />
      <Rail filter={homeCat} mode={railMode} dim={!isHome} offset={offset} shifting={shifting} relayout={relayout} />
      <AnimatePresence mode="wait" onExitComplete={onExitComplete}>
        {isHome ? <HomeUI key="home" cat={homeCat} /> : <Page key={route.key} route={route} />}
      </AnimatePresence>
      {isHome && <button type="button" className="grid-toggle" onClick={() => setGrid(g => !g)} aria-pressed={grid}><span>Сетка</span><i /></button>}
      <Toast text={toast} />
    </>
  );
}
