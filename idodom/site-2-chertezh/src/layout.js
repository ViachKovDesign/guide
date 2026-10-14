/* Раскладка мозаики как разбивочная сетка на чертеже.
   Каждый кадр задаётся четырьмя величинами: номер колонки (start), ширина в колонках (cols),
   отметка по вертикали в «row units» (top) и пропорция кадра (высота / ширина).
   Раскладка считается один раз, детерминированно (seed), и повторяется 9 раз по вертикали. */

export const COL_TO_ROW = 4.3;       // ширина колонки / высота row unit (≈ 84,7 / 19,7 при экране 1440)
export const CYCLES = 9;              // 9 повторов одного набора
export const DESKTOP = { gridCols: 17, cycle: 2820 / CYCLES, colsPool: [4, 4, 5, 5, 6, 3, 6, 5, 4, 5], bigPool: [7, 6, 7, 6, 5, 7], smallPool: [3, 3, 4, 3], gap: [2, 3] };
export const MOBILE = { gridCols: 9, cycle: 250, colsPool: [2, 3, 3, 4, 4, 5], bigPool: [5, 4, 5, 4, 5, 4], smallPool: [2, 2, 3], gap: [1, 3] };

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const pick = (R, a) => a[Math.floor(R() * a.length)];

export function shuffleIndexes(n, seed) {
  const R = rng(seed), a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* прямоугольник не должен пересекаться с уже размещёнными, в том числе с их копиями из соседних циклов */
function fits(rect, placed, cycle, mx, my) {
  for (const p of placed) {
    for (const sh of [-cycle, 0, cycle]) {
      const y0 = p.y0 + sh, y1 = p.y1 + sh;
      if (rect.x1 + mx > p.x0 && rect.x0 < p.x1 + mx && rect.y1 + my > y0 && rect.y0 < y1 + my) return false;
    }
  }
  return true;
}

function place(R, o, placed, r, cols, prefTop, side) {
  for (let c = cols; c >= 2; c--) {
    const h = c * COL_TO_ROW * r, maxStart = o.gridCols - c + 1;
    for (let step = 0; step < 60; step++) {
      const top = prefTop + step * 2.5;
      for (let t = 0; t < 16; t++) {
        let start;
        if (side === 'left') start = 1 + Math.floor(R() * Math.min(3, maxStart));
        else if (side === 'right') start = maxStart - Math.floor(R() * Math.min(3, maxStart));
        else start = 1 + Math.floor(R() * maxStart);
        const rect = { x0: start - 1, x1: start - 1 + c, y0: top, y1: top + h };
        if (fits(rect, placed, o.cycle, 1, o.gap[1] + 1)) { placed.push(rect); return { start, cols: c, top: Math.round(top * 10) / 10 }; }
      }
    }
  }
  // запасной вариант: если место не нашлось, ставим в конец цикла — раскладка остаётся валидной
  const start = 1 + Math.floor(R() * (o.gridCols - 1)), top = o.cycle - 10;
  return { start, cols: 2, top };
}

/* «Все»: свободный коллаж, кадры равномерно по высоте цикла */
function packAll(items, o, seed) {
  const R = rng(seed), placed = [], out = new Array(items.length), pitch = o.cycle / items.length;
  items.forEach((it, n) => {
    const pref = n * pitch + (R() - 0.5) * pitch * 0.8 - 14;
    out[n] = Object.assign(place(R, o, placed, it.r, pick(R, o.colsPool), pref, null), { dim: false });
  });
  return out;
}

/* Фильтр по разделу: выбранные кадры крупно и по зигзагу, остальные уезжают на новые места и тускнеют */
function packCat(items, cat, o, seed) {
  const R = rng(seed), placed = [], out = new Array(items.length);
  const sel = items.map((it, i) => (it.cat === cat ? i : -1)).filter(i => i >= 0);
  const rest = items.map((it, i) => (it.cat !== cat ? i : -1)).filter(i => i >= 0);
  const pitchS = o.cycle / sel.length;
  sel.forEach((idx, n) => {
    const r = items[idx].r, pref = n * pitchS + 2;
    out[idx] = Object.assign(place(R, o, placed, r, o.bigPool[n % o.bigPool.length], pref, n % 2 ? 'right' : 'left'), { dim: false, big: true });
  });
  const pitchR = o.cycle / rest.length;
  rest.forEach((idx, n) => {
    const r = items[idx].r, pref = n * pitchR + (R() - 0.5) * 6;
    out[idx] = Object.assign(place(R, o, placed, r, pick(R, o.smallPool), pref, null), { dim: true });
  });
  return out;
}

export function buildLayouts(items, o, seed) {
  const L = { all: packAll(items, o, seed) };
  ['soft', 'tables', 'chairs', 'figures'].forEach((c, i) => { L[c] = packCat(items, c, o, seed + 11 * (i + 1)); });
  return L;
}
