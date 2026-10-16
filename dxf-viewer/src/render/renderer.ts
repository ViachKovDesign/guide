// Отрисовка сцены на Canvas 2D. Вид задаётся центром (в мировых координатах) и масштабом
// (пикселей на единицу чертежа). Всё рисуем в CSS-пикселях, плотность экрана учитывает setTransform.

import type { ArcPrim, Bounds, FillPrim, PolyPrim, Scene, TextPrim } from '../dxf/scene';
import { computeFit } from './fit';
import { BACKGROUND, type Theme, themedColor } from './theme';

export const FONT_FAMILY = '"Roboto Condensed", "Arial Narrow", Arial, sans-serif';
/** Размер шрифта, в котором считаем раскладку текста (потом масштабируем матрицей). */
const FONT_REF = 100;
/** Высота заглавных букв Roboto Condensed относительно размера шрифта. */
const CAP_HEIGHT = 0.711;
const CAP = FONT_REF * CAP_HEIGHT;

export interface View {
  cx: number;
  cy: number;
  scale: number;
}

interface TextLayout {
  lines: string[];
  widths: number[];
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  scene: Scene | null = null;
  view: View = { cx: 0, cy: 0, scale: 1 };
  theme: Theme = 'dark';
  layerOn: boolean[] = [];
  /** границы «показать всё» и масштаб, от которого считаем допустимый зум */
  fitView: View | null = null;
  outliers = 0;
  /** вид всё ещё совпадает с «показать всё» (пользователь не двигал): при повороте экрана подгоняем заново */
  private viewIsFit = true;

  private w = 0;
  private h = 0;
  private dpr = 1;
  private raf = 0;
  private layouts = new WeakMap<TextPrim, TextLayout>();
  private onViewChange: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D недоступен');
    this.ctx = ctx;
  }

  setViewChangeHandler(fn: () => void) {
    this.onViewChange = fn;
  }

  setScene(scene: Scene | null) {
    this.scene = scene;
    this.layouts = new WeakMap();
    this.layerOn = scene ? scene.layers.map((l) => l.on) : [];
    this.fitView = null;
    this.outliers = 0;
    this.viewIsFit = true;
    if (scene) this.fit();
    else this.invalidate();
  }

  /** Шрифт догрузился: раскладка текста (ширины строк) измерена запасным шрифтом, считаем заново. */
  refreshText() {
    this.layouts = new WeakMap();
    this.invalidate();
  }

  setTheme(theme: Theme) {
    this.theme = theme;
    this.invalidate();
  }

  setLayerVisible(index: number, on: boolean) {
    this.layerOn[index] = on;
    this.invalidate();
  }

  /** Подгоняем размер холста под контейнер. */
  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    // при смене размера сохраняем центр кадра
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    if (this.scene && (!this.fitView || this.viewIsFit)) this.fit();
    else this.invalidate();
  }

  get width() {
    return this.w;
  }
  get height() {
    return this.h;
  }

  // ---------- вид ----------

  fit() {
    if (!this.scene || !this.w) return;
    const f = computeFit(this.scene);
    if (!f) {
      this.view = { cx: 0, cy: 0, scale: 1 };
      this.fitView = { ...this.view };
      this.invalidate();
      return;
    }
    this.outliers = f.outliers;
    this.view = this.viewFor(f.bounds);
    this.fitView = { ...this.view };
    this.viewIsFit = true;
    this.invalidate();
    this.onViewChange?.();
  }

  /** Вид, в который целиком попадают границы с небольшим полем. */
  viewFor(b: Bounds, pad = 0.06): View {
    const bw = Math.max(b.maxX - b.minX, 1e-9);
    const bh = Math.max(b.maxY - b.minY, 1e-9);
    const aw = this.w * (1 - pad * 2);
    const ah = this.h * (1 - pad * 2);
    let scale = Math.min(aw / bw, ah / bh);
    if (!Number.isFinite(scale) || scale <= 0) scale = 1;
    // чертёж из одной точки — не уходим в бесконечный зум
    if (bw < 1e-6 && bh < 1e-6) scale = 1;
    return { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, scale };
  }

  setView(v: View) {
    const base = this.fitView?.scale ?? 1;
    const min = base / 200;
    const max = base * 50000;
    this.view = { cx: v.cx, cy: v.cy, scale: Math.max(min, Math.min(max, v.scale)) };
    this.viewIsFit = false;
    this.invalidate();
    this.onViewChange?.();
  }

  /** Сдвиг вида на (dx, dy) экранных пикселей. */
  panBy(dx: number, dy: number) {
    this.setView({
      cx: this.view.cx - dx / this.view.scale,
      cy: this.view.cy + dy / this.view.scale,
      scale: this.view.scale,
    });
  }

  /** Зум в точке экрана (px, py): точка под курсором остаётся на месте. */
  zoomAt(factor: number, px: number, py: number) {
    const before = this.screenToWorld(px, py);
    const scale = this.view.scale * factor;
    const base = this.fitView?.scale ?? 1;
    const clamped = Math.max(base / 200, Math.min(base * 50000, scale));
    const hw = this.w / 2, hh = this.h / 2;
    this.setView({
      cx: before.x - (px - hw) / clamped,
      cy: before.y + (py - hh) / clamped,
      scale: clamped,
    });
  }

  screenToWorld(px: number, py: number) {
    const { cx, cy, scale } = this.view;
    return { x: cx + (px - this.w / 2) / scale, y: cy - (py - this.h / 2) / scale };
  }

  worldToScreen(x: number, y: number) {
    const { cx, cy, scale } = this.view;
    return { x: (x - cx) * scale + this.w / 2, y: this.h / 2 - (y - cy) * scale };
  }

  // ---------- рисование ----------

  invalidate() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  private draw() {
    const { ctx, w, h } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = BACKGROUND[this.theme];
    ctx.fillRect(0, 0, w, h);
    const sc = this.scene;
    if (!sc) return;

    const { cx, cy, scale } = this.view;
    const hw = w / 2, hh = h / 2;
    // видимая область в мировых координатах
    const vx0 = cx - hw / scale, vx1 = cx + hw / scale;
    const vy0 = cy - hh / scale, vy1 = cy + hh / scale;
    const on = this.layerOn;
    const theme = this.theme;
    const minPx = 0.35 / scale; // всё мельче этого пропускаем

    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';

    // 1. заливки и штриховки — под линиями
    for (const f of sc.fills) {
      if (!on[f.layer]) continue;
      if (f.maxX < vx0 || f.minX > vx1 || f.maxY < vy0 || f.minY > vy1) continue;
      if (f.maxX - f.minX < minPx && f.maxY - f.minY < minPx) continue;
      this.drawFill(f, vx0, vy0, vx1, vy1);
    }

    // 2. линии, пачками по стилю: один beginPath/stroke на стиль
    for (let si = 0; si < sc.styles.length; si++) {
      const st = sc.styles[si];
      const group = sc.lines[si];
      if (!group.length) continue;
      ctx.beginPath();
      let any = false;
      for (const p of group) {
        if (!on[p.layer]) continue;
        if (p.maxX < vx0 || p.minX > vx1 || p.maxY < vy0 || p.minY > vy1) continue;
        if (p.maxX - p.minX < minPx && p.maxY - p.minY < minPx) continue;
        if (p.k === 0) this.pathPoly(p);
        else this.pathArc(p);
        any = true;
      }
      if (!any) continue;
      ctx.strokeStyle = themedColor(st.rgb, theme);
      ctx.lineWidth = st.lw;
      let dashed = false;
      if (st.dash) {
        const d = st.dash.map((v) => v * scale);
        let sum = 0, min = Infinity;
        for (const v of d) {
          sum += v;
          if (v < min) min = v;
        }
        // слишком мелкий пунктир сливается в сплошную линию — так и рисуем
        if (sum >= 4 && min >= 0.4) {
          ctx.setLineDash(d);
          dashed = true;
        }
      }
      ctx.stroke();
      if (dashed) ctx.setLineDash([]);
    }

    // 3. точки
    for (const p of sc.points) {
      if (!on[p.layer]) continue;
      if (p.x < vx0 || p.x > vx1 || p.y < vy0 || p.y > vy1) continue;
      ctx.fillStyle = themedColor(p.rgb, theme);
      const s = this.worldToScreen(p.x, p.y);
      ctx.fillRect(s.x - 0.75, s.y - 0.75, 1.5, 1.5);
    }

    // 4. текст
    let lastFill = '';
    for (const t of sc.texts) {
      if (!on[t.layer]) continue;
      if (t.maxX < vx0 || t.minX > vx1 || t.maxY < vy0 || t.minY > vy1) continue;
      if (t.h * scale < 2) continue;
      const col = themedColor(t.rgb, theme);
      if (col !== lastFill) {
        ctx.fillStyle = col;
        lastFill = col;
      }
      this.drawText(t);
    }
  }

  private pathPoly(p: PolyPrim) {
    const ctx = this.ctx;
    const { cx, cy, scale } = this.view;
    const hw = this.w / 2, hh = this.h / 2;
    const pts = p.pts;
    ctx.moveTo((pts[0] - cx) * scale + hw, hh - (pts[1] - cy) * scale);
    for (let i = 2; i < pts.length; i += 2) {
      ctx.lineTo((pts[i] - cx) * scale + hw, hh - (pts[i + 1] - cy) * scale);
    }
    if (p.closed) ctx.closePath();
  }

  private pathArc(a: ArcPrim) {
    const ctx = this.ctx;
    const { cx, cy, scale } = this.view;
    const hw = this.w / 2, hh = this.h / 2;
    const rpx = Math.max(Math.hypot(a.ux, a.uy), Math.hypot(a.vx, a.vy)) * scale;
    const sweep = a.t1 - a.t0;
    // шаг по углу так, чтобы хорда отклонялась от дуги не более чем на ~0.15 px
    const step = rpx > 0.3 ? 2 * Math.acos(Math.max(0, 1 - 0.15 / rpx)) : Math.PI / 2;
    const n = Math.max(4, Math.min(1500, Math.ceil(sweep / Math.max(step, 1e-3))));
    for (let i = 0; i <= n; i++) {
      const t = a.t0 + (sweep * i) / n;
      const c = Math.cos(t), s = Math.sin(t);
      const x = (a.cx + a.ux * c + a.vx * s - cx) * scale + hw;
      const y = hh - (a.cy + a.uy * c + a.vy * s - cy) * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }

  // ---------- заливки и штриховки ----------

  private drawFill(f: FillPrim, vx0: number, vy0: number, vx1: number, vy1: number) {
    const ctx = this.ctx;
    const { cx, cy, scale } = this.view;
    const hw = this.w / 2, hh = this.h / 2;
    const color = themedColor(f.rgb, this.theme);

    const path = new Path2D();
    for (const loop of f.loops) {
      path.moveTo((loop[0] - cx) * scale + hw, hh - (loop[1] - cy) * scale);
      for (let i = 2; i < loop.length; i += 2) {
        path.lineTo((loop[i] - cx) * scale + hw, hh - (loop[i + 1] - cy) * scale);
      }
      path.closePath();
    }

    if (!f.pattern) {
      ctx.fillStyle = color;
      ctx.fill(path, 'evenodd');
      return;
    }

    // Узор. Если линии слишком частые (мелкий масштаб) — заменяем полупрозрачной заливкой.
    let minSpacingPx = Infinity;
    for (const pl of f.pattern) {
      const s = Math.abs(-pl.dy * pl.ox + pl.dx * pl.oy) * scale;
      if (s > 0 && s < minSpacingPx) minSpacingPx = s;
    }
    if (!Number.isFinite(minSpacingPx)) return;
    if (minSpacingPx < 3) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.5, 0.18 + (f.pattern.length - 1) * 0.06);
      ctx.fillStyle = color;
      ctx.fill(path, 'evenodd');
      ctx.restore();
      return;
    }

    // Область, в которой нужны линии: пересечение рамки штриховки с экраном.
    const rx0 = Math.max(f.minX, vx0), rx1 = Math.min(f.maxX, vx1);
    const ry0 = Math.max(f.minY, vy0), ry1 = Math.min(f.maxY, vy1);
    const corners = [rx0, ry0, rx1, ry0, rx1, ry1, rx0, ry1];

    ctx.save();
    ctx.clip(path, 'evenodd');
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    for (const pl of f.pattern) {
      const nx = -pl.dy, ny = pl.dx;
      const ds = pl.ox * nx + pl.oy * ny; // шаг между линиями по нормали
      if (Math.abs(ds) < 1e-12) continue;
      const along = pl.ox * pl.dx + pl.oy * pl.dy; // сдвиг вдоль линии при переходе к следующей
      let sMin = Infinity, sMax = -Infinity, tMin = Infinity, tMax = -Infinity;
      for (let i = 0; i < 8; i += 2) {
        const rx = corners[i] - pl.x0, ry = corners[i + 1] - pl.y0;
        const s = rx * nx + ry * ny;
        const t = rx * pl.dx + ry * pl.dy;
        if (s < sMin) sMin = s;
        if (s > sMax) sMax = s;
        if (t < tMin) tMin = t;
        if (t > tMax) tMax = t;
      }
      let k0 = Math.ceil(Math.min(sMin / ds, sMax / ds));
      let k1 = Math.floor(Math.max(sMin / ds, sMax / ds));
      if (k1 - k0 > 4000) continue; // защита от «взрыва» числа линий
      let dash: number[] | null = null;
      if (pl.dash) {
        const d = pl.dash.map((v) => v * scale);
        const sum = d.reduce((a, b) => a + b, 0);
        if (sum >= 4 && Math.min(...d) >= 0.4) dash = d;
      }
      ctx.beginPath();
      for (let k = k0; k <= k1; k++) {
        const ox = pl.x0 + pl.ox * k, oy = pl.y0 + pl.oy * k;
        // параметр вдоль линии: с учётом сдвига `along * k`
        const t0 = tMin - along * k - 1, t1 = tMax - along * k + 1;
        const ax = ox + pl.dx * t0, ay = oy + pl.dy * t0;
        const bx = ox + pl.dx * t1, by = oy + pl.dy * t1;
        if (dash) {
          ctx.beginPath();
          ctx.setLineDash(dash);
          ctx.lineDashOffset = t0 * scale;
        }
        ctx.moveTo((ax - cx) * scale + hw, hh - (ay - cy) * scale);
        ctx.lineTo((bx - cx) * scale + hw, hh - (by - cy) * scale);
        if (dash) ctx.stroke();
      }
      if (!dash) ctx.stroke();
      else ctx.setLineDash([]);
    }
    ctx.restore();
  }

  // ---------- текст ----------

  private layoutText(t: TextPrim): TextLayout {
    let l = this.layouts.get(t);
    if (l) return l;
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `${FONT_REF}px ${FONT_FAMILY}`;
    let lines = t.lines;
    if (t.wrapW > 0) {
      // ширина колонки в «локальных» единицах шрифта
      const sxw = (t.h / CAP) * t.wf;
      const max = t.wrapW / sxw;
      const out: string[] = [];
      for (const para of t.lines) {
        const words = para.split(/(\s+)/);
        let cur = '';
        for (const w of words) {
          const next = cur + w;
          if (cur && ctx.measureText(next.trimEnd()).width > max) {
            out.push(cur.trimEnd());
            cur = w.trimStart();
          } else cur = next;
        }
        out.push(cur.trimEnd());
      }
      lines = out;
    }
    const widths = lines.map((s) => ctx.measureText(s).width);
    ctx.restore();
    l = { lines, widths };
    this.layouts.set(t, l);
    return l;
  }

  private drawText(t: TextPrim) {
    const ctx = this.ctx;
    const { scale } = this.view;
    const lay = this.layoutText(t);
    const n = lay.lines.length;
    const s = this.worldToScreen(t.x, t.y);

    let sy = (t.h * scale) / CAP;
    let sx = sy * t.wf;
    if (t.fitMode && t.fit > 0) {
      const wmax = Math.max(...lay.widths, 1e-6);
      const want = t.fit * scale;
      const k = want / (wmax * sx);
      if (t.fitMode === 5) sx *= k;
      else {
        sx *= k;
        sy *= k;
      }
    }

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(-t.rot);
    ctx.scale(sx, sy);
    if (t.oblique) ctx.transform(1, 0, -Math.tan(t.oblique), 1, 0, 0);
    ctx.font = `${FONT_REF}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'alphabetic';

    const p = t.pitch;
    // позиция первой базовой линии относительно точки вставки, в долях высоты (вверх положительно)
    let b0 = 0;
    if (t.va === 1) b0 = (n - 1) * p + 0.2;
    else if (t.va === 2) b0 = ((n - 1) * p) / 2 - 0.5;
    else if (t.va === 3) b0 = -1;

    for (let i = 0; i < n; i++) {
      const str = lay.lines[i];
      if (!str) continue;
      const wdt = lay.widths[i];
      const x = t.ha === 0 ? 0 : t.ha === 1 ? -wdt / 2 : -wdt;
      const y = -(b0 - i * p) * CAP;
      ctx.fillText(str, x, y);
    }
    ctx.restore();
  }
}
