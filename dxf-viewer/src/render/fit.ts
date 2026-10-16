import type { Bounds, Scene } from '../dxf/scene';

export interface FitResult {
  bounds: Bounds;
  /** сколько объектов далеко за пределами основной массы чертежа и не вошло в «показать всё» */
  outliers: number;
}

/**
 * Границы для «Показать всё». В реальных файлах часто валяется одна точка за километр от
 * чертежа — тогда честные границы дают крохотный чертёж в углу. Отсекаем такие объекты.
 */
export function computeFit(scene: Scene): FitResult | null {
  if (!scene.bounds) return null;
  const items: Bounds[] = [];
  for (const g of scene.lines) for (const p of g) items.push(p);
  for (const p of scene.fills) items.push(p);
  for (const p of scene.texts) items.push(p);
  for (const p of scene.points) items.push(p);
  const n = items.length;
  if (n < 12) return { bounds: scene.bounds, outliers: 0 };

  const cx = new Float64Array(n), cy = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    cx[i] = (items[i].minX + items[i].maxX) / 2;
    cy[i] = (items[i].minY + items[i].maxY) / 2;
  }
  const median = (a: Float64Array) => {
    const s = Float64Array.from(a).sort();
    return s[s.length >> 1];
  };
  const mx = median(cx), my = median(cy);
  const d = new Float64Array(n);
  for (let i = 0; i < n; i++) d[i] = Math.max(Math.abs(cx[i] - mx), Math.abs(cy[i] - my));
  const sorted = Float64Array.from(d).sort();
  const d90 = sorted[Math.floor(n * 0.9)];
  const limit = Math.max(d90 * 8, 1e-9);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let out = 0;
  for (let i = 0; i < n; i++) {
    if (d[i] > limit) {
      out++;
      continue;
    }
    const b = items[i];
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  if (!out || !Number.isFinite(minX + minY + maxX + maxY)) return { bounds: scene.bounds, outliers: 0 };
  return { bounds: { minX, minY, maxX, maxY }, outliers: out };
}
