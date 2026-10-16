// Палитра AutoCAD Color Index (ACI). Индексы 10–249 строятся по формуле, как в самом AutoCAD.

const BASE: Record<number, number> = {
  1: 0xff0000,
  2: 0xffff00,
  3: 0x00ff00,
  4: 0x00ffff,
  5: 0x0000ff,
  6: 0xff00ff,
  7: 0xffffff,
  8: 0x808080,
  9: 0xc0c0c0,
};
const GRAYS = [0x333333, 0x505050, 0x696969, 0x828282, 0xbebebe, 0xffffff];
// насыщенность и яркость для 10 вариантов внутри одного оттенка
const SAT = [1, 0.5, 1, 0.5, 1, 0.5, 1, 0.5, 1, 0.5];
const VAL = [1, 1, 0.8, 0.8, 0.6, 0.6, 0.5, 0.5, 0.3, 0.3];

function hsv(h: number, s: number, v: number): number {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  // AutoCAD отбрасывает дробную часть (127.5 → 127), а не округляет
  const to = (f: number) => Math.floor((f + m) * 255 + 1e-9);
  return (to(r) << 16) | (to(g) << 8) | to(b);
}

const TABLE: number[] = new Array(256).fill(0xffffff);
for (let i = 1; i <= 9; i++) TABLE[i] = BASE[i];
for (let i = 10; i <= 249; i++) {
  const n = i - 10;
  TABLE[i] = hsv(Math.floor(n / 10) * 15, SAT[n % 10], VAL[n % 10]);
}
for (let i = 250; i <= 255; i++) TABLE[i] = GRAYS[i - 250];

/** Индекс ACI → 0xRRGGBB. Цвет 7 — белый (в интерфейсе он превращается в чёрный на светлом фоне). */
export function aciToRgb(i: number): number {
  return TABLE[i >= 0 && i <= 255 ? i : 7];
}
