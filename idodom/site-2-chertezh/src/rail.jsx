import { memo, useEffect, useMemo, useRef } from 'react';
import { products } from './data.js';
import { buildLayouts, DESKTOP, MOBILE, CYCLES } from './layout.js';

/* Раскладки считаются один раз: пять режимов («Все» и четыре раздела) × две сетки (17 колонок / 9 колонок на телефоне) */
const LD = buildLayouts(products, DESKTOP, 31);
const LM = buildLayouts(products, MOBILE, 53);
export const TOTAL = Math.round(DESKTOP.cycle * CYCLES);   // 2820 «юнитов» — высота рельса
export const TOTAL_M = MOBILE.cycle * CYCLES;
const isMobile = () => innerWidth <= 820;
const rowUnitPx = () => (innerWidth / (isMobile() ? 9 : 17)) * 0.2325;
/* начало текущего цикла мозаики — к нему подъезжаем при смене раздела */
export const cycleStart = (y) => { const h = (isMobile() ? MOBILE.cycle : DESKTOP.cycle) * rowUnitPx(); return Math.max(0, Math.floor((y + h * 0.15) / h) * h - 14 * rowUnitPx()); };
export const maxScroll = () => Math.max(0, (isMobile() ? TOTAL_M : TOTAL) * rowUnitPx() - innerHeight);

const Item = memo(function Item({ p, k, c, d, m, delay, entry }) {
  const style = {
    '--start': d.start, '--cols': d.cols, '--top': +(d.top + c * DESKTOP.cycle).toFixed(2),
    '--m-start': m.start, '--m-cols': m.cols, '--m-top': +(m.top + c * MOBILE.cycle).toFixed(2),
    '--aspect-height-ratio': p.r, '--i': k, '--mosaic-entry-delay': delay + 's',
    zIndex: d.big ? 2 : 1
  };
  return (
    <a className={'mosaic-item' + (entry ? ' is-entry' : '')} style={style} href={'#/p/' + p.id}
       data-mosaic-cycle={c} data-cursor-label={p.kind === 'film' ? 'Фильм — ' + p.name : p.name}
       data-dim={d.dim ? 'true' : undefined} aria-label={p.name} draggable="false">
      <span className="mosaic-item__media"><img src={p.img} alt="" loading={c < 1 ? 'eager' : 'lazy'} decoding="async" draggable="false" /></span>
      {p.kind === 'film' && <span className="mosaic-item__tag">Фильм</span>}
    </a>
  );
});

export function Rail({ filter, mode, dim, offset, shifting, relayout }) {
  const ref = useRef(null);
  // первая загрузка: входят только кадры первого экрана, со ступенчатой задержкой
  const entry = useMemo(() => {
    const L = (isMobile() ? LM : LD).all, rowU = rowUnitPx(), map = {};
    products.map((p, k) => ({ k, top: L[k].top })).filter(o => o.top * rowU < innerHeight * 1.1 && o.top > -40).sort((a, b) => a.top - b.top).forEach((o, i) => { map[o.k] = +(i * 0.028).toFixed(3); });
    return map;
  }, []);
  const list = useMemo(() => {
    const out = [];
    for (let c = 0; c < CYCLES; c++) products.forEach((p, k) => out.push({ p, k, c, key: c + ':' + p.id }));
    return out;
  }, []);
  useEffect(() => { const el = ref.current; if (!el) return; if (mode === 'case') el.setAttribute('inert', ''); else el.removeAttribute('inert'); }, [mode]);
  const LDf = LD[filter] || LD.all, LMf = LM[filter] || LM.all;
  return (
    <div ref={ref} className="mosaic-rail" data-mode={mode} data-dim={dim ? 'true' : 'false'} data-shift={shifting ? 'true' : 'false'} data-relayout={relayout ? 'true' : 'false'}
         aria-hidden={mode === 'case' ? 'true' : undefined}
         style={{ '--mosaic-loop-total-units': TOTAL, '--mosaic-loop-total-units-m': TOTAL_M, '--case-background-offset': offset + 'px' }}>
      {list.map(({ p, k, c, key }) => (
        <Item key={key} p={p} k={k} c={c} d={LDf[k]} m={LMf[k]} delay={c === 0 && entry[k] !== undefined ? entry[k] : 0} entry={c === 0 && entry[k] !== undefined} />
      ))}
    </div>
  );
}
