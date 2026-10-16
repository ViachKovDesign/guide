export type Theme = 'light' | 'dark';

/** Фон модели: тёмный — как в AutoCAD (RGB 33,40,48), светлый — тёплая «бумага». */
export const BACKGROUND: Record<Theme, string> = {
  dark: '#212830',
  light: '#fbfaf7',
};

const cache: Record<Theme, Map<number, string>> = { light: new Map(), dark: new Map() };

function lum(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

const hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/**
 * Цвет объекта чертежа → CSS-цвет для выбранной темы.
 * Белый (ACI 7) на светлом фоне становится чёрным, как в AutoCAD; слишком светлые цвета затемняются,
 * слишком тёмные на тёмном фоне — осветляются, чтобы линии не терялись.
 */
export function themedColor(rgb: number, theme: Theme): string {
  const c = cache[theme];
  let v = c.get(rgb);
  if (v) return v;
  const r = (rgb >> 16) & 255, g = (rgb >> 8) & 255, b = rgb & 255;
  const l = lum(r, g, b);
  if (theme === 'light') {
    if (r > 245 && g > 245 && b > 245) v = '#16181c';
    else if (l > 0.62) {
      const k = 0.62 / l;
      v = hex(r * k * 0.85, g * k * 0.85, b * k * 0.85);
    } else v = hex(r, g, b);
  } else {
    if (l < 0.04) v = '#f2f4f6';
    else if (l < 0.22) {
      const t = 0.5; // подмешиваем белый
      v = hex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
    } else v = hex(r, g, b);
  }
  c.set(rgb, v);
  return v;
}

/** Цвет подсветки выбранного объекта. */
export const HIGHLIGHT: Record<Theme, string> = { dark: '#ffd54a', light: '#e8590c' };
