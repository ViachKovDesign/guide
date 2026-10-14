import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';

/* ── Логотип: слово, рамка (верх идёт за буквами) и подпись HOME PRIORITY ── */
export function Logo({ variant = 'mark', className = '' }) {
  const full = variant === 'full';
  return (
    <svg className={'logo ' + className} viewBox={`0 0 777 ${full ? 251 : 236}`} role="img" aria-label="IDODOM — Home priority">
      <path className="logo__frame" d={full ? 'M176 227H8V52H769V227H601' : 'M8 227H769V52H8Z'} />
      <text className="logo__word" x="388.5" y="185" textAnchor="middle" fontSize="218" textLength="584" lengthAdjust="spacingAndGlyphs">IDODOM</text>
      {full && <text className="logo__tag" x="388.5" y="243" textAnchor="middle" fontSize="42" textLength="290" lengthAdjust="spacing">HOME PRIORITY</text>}
    </svg>
  );
}

/* ── Шапка: слева разделы страницы, по центру логотип, справа категории.
      На странице-кейсе логотип уезжает влево, справа появляются «Поделиться» и «Закрыть». ── */
const LEFT = [['views', 'Ракурсы', '#/views'], ['sections', 'Разделы', '#/'], ['about', 'О нас', '#/about'], ['contacts', 'Контакты', '#/contacts']];
const RIGHT = [['soft', 'Мягкая мебель', '#/c/soft'], ['tables', 'Столы', '#/c/tables'], ['chairs', 'Стулья и кресла', '#/c/chairs'], ['figures', 'Фигуры', '#/c/figures']];

function Lnk({ href, children, active, onClick }) {
  return <a className={'lnk' + (active ? ' is-active' : '')} href={href} data-t={children} onClick={onClick}><span>{children}</span></a>;
}

export function Header({ route, cat, onShare }) {
  const home = route.name === 'home';
  const compact = route.name === 'case';           // страница проекта: логотип слева, справа «Поделиться / Закрыть»
  const [open, setOpen] = useState(false);
  useEffect(() => { document.body.classList.toggle('menu-open', open); }, [open]);
  useEffect(() => { setOpen(false); }, [route.key, cat]);
  useEffect(() => { const f = (e) => e.key === 'Escape' && setOpen(false); addEventListener('keydown', f); return () => removeEventListener('keydown', f); }, []);
  const activeLeft = route.name === 'page' ? route.page : (home && cat === 'all' ? 'sections' : '');
  const activeRight = home ? cat : (route.name === 'case' ? '' : '');
  const fade = { initial: { opacity: 0, y: -12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -12 }, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } };
  return (
    <>
      <header id="hdr" className={'hdr hdr2 is-solid' + (compact ? ' is-case' : '')} data-tone={home ? 'light' : 'dark'}>
        <AnimatePresence initial={false}>
          {!compact && (
            <motion.nav key="l" className="hdr__nav hdr__nav--l" aria-label="Страница" {...fade}>
              {LEFT.map(([k, t, h]) => <Lnk key={k} href={h} active={activeLeft === k}>{t}</Lnk>)}
            </motion.nav>
          )}
        </AnimatePresence>
        <motion.a layout transition={{ duration: 0.8, ease: [0.65, 0, 0.35, 1] }} className="hdr__logo" href="#/" aria-label="IDODOM — на главную">
          <Logo />
        </motion.a>
        <AnimatePresence initial={false} mode="popLayout">
          {!compact ? (
            <motion.nav key="r" className="hdr__nav hdr__nav--r" aria-label="Разделы каталога" {...fade}>
              {RIGHT.map(([k, t, h]) => <Lnk key={k} href={h} active={activeRight === k}>{t}</Lnk>)}
            </motion.nav>
          ) : (
            <motion.div key="a" className="hdr__actions" {...fade}>
              <button type="button" className="lnk" data-t="Поделиться" onClick={onShare}><span>Поделиться</span></button>
              <a className="lnk" data-t="Закрыть" href="#/"><span>Закрыть</span></a>
            </motion.div>
          )}
        </AnimatePresence>
        {!compact && <button className="hdr__burger" type="button" aria-expanded={open} aria-controls="sheet" onClick={() => setOpen(o => !o)}><span>{open ? 'Закрыть' : 'Меню'}</span><i /></button>}
      </header>
      <div className="sheet" id="sheet">
        <div className="sheet__cols">
          <div><h3>Страница</h3>{LEFT.map(([k, t, h]) => <a key={k} href={h}>{t}</a>)}</div>
          <div><h3>Каталог</h3>{RIGHT.map(([k, t, h]) => <a key={k} href={h}>{t}</a>)}</div>
        </div>
      </div>
    </>
  );
}

/* ── Курсор: точка и название проекта рядом (берётся из data-cursor-label) ── */
export function Cursor() {
  const x = useMotionValue(-100), y = useMotionValue(-100);
  const sx = useSpring(x, { stiffness: 520, damping: 42, mass: 0.35 });
  const sy = useSpring(y, { stiffness: 520, damping: 42, mass: 0.35 });
  const [label, setLabel] = useState('');
  const [link, setLink] = useState(false);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!matchMedia('(hover:hover) and (pointer:fine)').matches) return;
    document.documentElement.classList.add('has-cursor2');
    const mv = (e) => { x.set(e.clientX); y.set(e.clientY); setOn(true); };
    const ov = (e) => {
      const l = e.target.closest && e.target.closest('[data-cursor-label]');
      setLabel(l ? l.getAttribute('data-cursor-label') : '');
      setLink(!l && !!(e.target.closest && e.target.closest('a,button,input,textarea,select,label')));
    };
    const lv = () => setOn(false);
    addEventListener('mousemove', mv, { passive: true });
    document.addEventListener('mouseover', ov);
    document.documentElement.addEventListener('mouseleave', lv);
    return () => { removeEventListener('mousemove', mv); document.removeEventListener('mouseover', ov); document.documentElement.removeEventListener('mouseleave', lv); document.documentElement.classList.remove('has-cursor2'); };
  }, []);
  return (
    <motion.div className={'cur2' + (on ? ' is-on' : '')} style={{ x: sx, y: sy }} aria-hidden="true">
      <span className={'cur2__dot' + (link ? ' is-link' : '') + (label ? ' is-label' : '')} />
      <span className={'cur2__label' + (label ? ' is-on' : '')}>{label}</span>
    </motion.div>
  );
}

/* ── Разбивочная сетка с осями — подложка под мозаикой ── */
export function GridOverlay({ show }) {
  return (
    <div className={'axes' + (show ? ' is-on' : '')} aria-hidden="true">
      <div className="axes__nums">{Array.from({ length: 17 }, (_, i) => <span key={i}>{i + 1}</span>)}</div>
    </div>
  );
}

export function Toast({ text }) {
  return (
    <AnimatePresence>
      {text && <motion.div className="toast" role="status" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={{ duration: 0.4 }}>{text}</motion.div>}
    </AnimatePresence>
  );
}
