// Сцена: DXF-документ, "расплющенный" в мировые координаты.
// Блоки раскрываются в примитивы; цвет, вес и тип линии разрешены (ByLayer/ByBlock).
// Всё, что мы не умеем рисовать, попадает в `unsupported` — ничего не теряется молча.

import { aciToRgb } from './aci';
import {
  type Mat,
  IDENTITY,
  apply,
  applyVec,
  bulgeArc,
  catmullRom,
  decompose,
  evalSpline,
  mul,
  ocsMatrix,
  rotate,
  scale,
  translate,
} from './geom';
import { type DxfDoc, type Rec, headerNum } from './parse';
import { parseMText, plainText } from './text';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface PrimBase extends Bounds {
  eid: number;
  layer: number;
}

/** Ломаная (линии, полилинии без дуг). */
export interface PolyPrim extends PrimBase {
  k: 0;
  style: number;
  pts: number[];
  closed: boolean;
}

/** Дуга эллипса: P(t) = C + U·cos t + V·sin t, t от t0 до t1 против часовой. Круг и дуга — частные случаи. */
export interface ArcPrim extends PrimBase {
  k: 1;
  style: number;
  cx: number;
  cy: number;
  ux: number;
  uy: number;
  vx: number;
  vy: number;
  t0: number;
  t1: number;
}

export interface PatternLine {
  x0: number;
  y0: number;
  /** единичное направление линий */
  dx: number;
  dy: number;
  /** сдвиг к следующей линии семейства (мировые координаты) */
  ox: number;
  oy: number;
  /** шаблон штрихов в мировых единицах (формат canvas) или null — сплошная */
  dash: number[] | null;
}

/** Заливка: SOLID, 3DFACE-подобные и штриховка HATCH. */
export interface FillPrim extends PrimBase {
  k: 2;
  rgb: number;
  loops: number[][];
  /** null — сплошная заливка */
  pattern: PatternLine[] | null;
  name: string;
}

export interface TextPrim extends PrimBase {
  k: 3;
  rgb: number;
  x: number;
  y: number;
  rot: number;
  /** высота заглавных букв в мировых единицах */
  h: number;
  /** относительная ширина символов */
  wf: number;
  /** наклон в радианах */
  oblique: number;
  lines: string[];
  /** 0 слева, 1 по центру, 2 справа */
  ha: 0 | 1 | 2;
  /** 0 по базовой линии, 1 низ, 2 середина, 3 верх */
  va: 0 | 1 | 2 | 3;
  /** для выравнивания «по ширине» (3) и «вписанный» (5): длина между точками, иначе 0 */
  fit: number;
  fitMode: 0 | 3 | 5;
  /** ширина колонки MTEXT в мировых единицах, 0 — без переноса */
  wrapW: number;
  /** шаг строк в единицах высоты текста */
  pitch: number;
}

export interface PointPrim extends PrimBase {
  k: 4;
  rgb: number;
  x: number;
  y: number;
}

export type LinePrim = PolyPrim | ArcPrim;
export type Prim = LinePrim | FillPrim | TextPrim | PointPrim;

export interface LineStyle {
  rgb: number;
  /** толщина в условных пикселях (1 — тонкая) */
  lw: number;
  /** шаблон штрихов в мировых единицах или null */
  dash: number[] | null;
}

export interface SceneLayer {
  name: string;
  rgb: number;
  on: boolean;
  frozen: boolean;
  count: number;
}

export interface EntityInfo {
  type: string;
  layer: number;
  handle: string;
  /** имя блока, если объект — вставка блока */
  block: string | null;
  /** общие данные для панели свойств */
  data?: Record<string, number | string>;
}

export interface Scene {
  layers: SceneLayer[];
  ents: EntityInfo[];
  styles: LineStyle[];
  /** линейные примитивы, сгруппированные по стилю */
  lines: LinePrim[][];
  fills: FillPrim[];
  texts: TextPrim[];
  points: PointPrim[];
  bounds: Bounds | null;
  /** тип объекта → сколько таких не отрисовано */
  unsupported: Map<string, number>;
  insunits: number;
  ltscale: number;
  version: string | null;
  paperSpaceCount: number;
  /** сколько примитивов всего */
  primCount: number;
}

interface Ctx {
  m: Mat;
  /** слой вставки блока: объекты на слое «0» внутри блока наследуют его */
  layer: number | null;
  rgb: number | null;
  lw: number | null;
  lt: string | null;
  eid: number;
  path: string[];
  block: string | null;
}

/** Объекты, координаты которых заданы в OCS (зависят от вектора выдавливания). */
const OCS_TYPES = new Set(['CIRCLE', 'ARC', 'LWPOLYLINE', 'POLYLINE', 'TEXT', 'ATTRIB', 'HATCH', 'INSERT', 'SOLID', 'TRACE']);

const MAX_DEPTH = 16;
const MAX_ARRAY = 20000;

export function buildScene(doc: DxfDoc): Scene {
  return new Builder(doc).build();
}

class Builder {
  private layers: SceneLayer[] = [];
  private layerIdx = new Map<string, number>();
  private ents: EntityInfo[] = [];
  private styles: LineStyle[] = [];
  private styleIdx = new Map<string, number>();
  private lines: LinePrim[][] = [];
  private fills: FillPrim[] = [];
  private texts: TextPrim[] = [];
  private points: PointPrim[] = [];
  private unsupported = new Map<string, number>();
  private ltscale: number;
  private dimArrow: number;
  private bounds: Bounds | null = null;
  private primCount = 0;
  private dashCache = new Map<string, number[] | null>();

  constructor(private doc: DxfDoc) {
    this.ltscale = headerNum(doc, '$LTSCALE', 1) || 1;
    const dimscale = headerNum(doc, '$DIMSCALE', 1) || 1;
    this.dimArrow = (headerNum(doc, '$DIMASZ', 0.18) || 0.18) * dimscale;
    for (const l of doc.layers.values()) this.layerOf(l.name);
    if (!this.layerIdx.has('0')) this.layerOf('0');
  }

  build(): Scene {
    const top: Ctx = { m: IDENTITY, layer: null, rgb: null, lw: null, lt: null, eid: -1, path: [], block: null };
    for (const rec of this.doc.entities) this.emit(rec, top);
    return {
      layers: this.layers,
      ents: this.ents,
      styles: this.styles,
      lines: this.lines,
      fills: this.fills,
      texts: this.texts,
      points: this.points,
      bounds: this.bounds,
      unsupported: this.unsupported,
      insunits: Math.round(headerNum(this.doc, '$INSUNITS', 0)),
      ltscale: this.ltscale,
      version: this.doc.version,
      paperSpaceCount: this.doc.paperSpaceCount,
      primCount: this.primCount,
    };
  }

  // ---------- слои, цвета, стили ----------

  private layerOf(name: string): number {
    let i = this.layerIdx.get(name);
    if (i !== undefined) return i;
    const def = this.doc.layers.get(name);
    i = this.layers.length;
    this.layers.push({
      name,
      rgb: def ? (def.rgb ?? aciToRgb(def.aci)) : 0xffffff,
      on: def ? def.on && !def.frozen : true,
      frozen: def ? def.frozen : false,
      count: 0,
    });
    this.layerIdx.set(name, i);
    return i;
  }

  private effectiveLayer(rec: Rec, ctx: Ctx): number {
    const name = rec.str(8, '0');
    if (name === '0' && ctx.layer !== null) return ctx.layer;
    return this.layerOf(name);
  }

  private rgbOf(rec: Rec, layer: number, ctx: Ctx): number {
    if (rec.has(420)) return rec.int(420) & 0xffffff;
    const aci = Math.abs(rec.int(62, 256));
    if (aci === 256) return this.layers[layer].rgb;
    if (aci === 0) return ctx.rgb ?? this.layers[layer].rgb;
    return aciToRgb(aci);
  }

  private lwOf(rec: Rec, layer: number, ctx: Ctx): number {
    const layerLw = this.doc.layers.get(this.layers[layer].name)?.lw ?? -3;
    let lw = rec.has(370) ? rec.int(370, -1) : -1;
    if (lw === -1) lw = layerLw;
    else if (lw === -2) lw = ctx.lw ?? layerLw;
    if (lw < 0) lw = 25;
    if (lw <= 30) return 1;
    if (lw <= 50) return 1.5;
    if (lw <= 80) return 2;
    if (lw <= 120) return 2.5;
    return 3.5;
  }

  private dashOf(rec: Rec, layer: number, ctx: Ctx): number[] | null {
    let name = rec.str(6, 'BYLAYER');
    const layerLt = this.doc.layers.get(this.layers[layer].name)?.ltype ?? 'CONTINUOUS';
    if (name.toUpperCase() === 'BYLAYER') name = layerLt;
    else if (name.toUpperCase() === 'BYBLOCK') name = ctx.lt ?? layerLt;
    const up = name.toUpperCase();
    if (up === 'CONTINUOUS' || up === '') return null;
    const scale = this.ltscale * rec.num(48, 1);
    return this.dashPattern(up, scale);
  }

  private dashPattern(upperName: string, scale: number): number[] | null {
    const key = upperName + '|' + scale;
    if (this.dashCache.has(key)) return this.dashCache.get(key)!;
    const lt = this.doc.ltypes.get(upperName);
    let out: number[] | null = null;
    if (lt && lt.pattern.length >= 2) out = toDash(lt.pattern, scale);
    this.dashCache.set(key, out);
    return out;
  }

  private styleOf(rgb: number, lw: number, dash: number[] | null): number {
    const key = rgb + '|' + lw + '|' + (dash ? dash.join(',') : '');
    let i = this.styleIdx.get(key);
    if (i === undefined) {
      i = this.styles.length;
      this.styles.push({ rgb, lw, dash });
      this.styleIdx.set(key, i);
      this.lines.push([]);
    }
    return i;
  }

  private lineStyle(rec: Rec, layer: number, ctx: Ctx): number {
    return this.styleOf(this.rgbOf(rec, layer, ctx), this.lwOf(rec, layer, ctx), this.dashOf(rec, layer, ctx));
  }

  // ---------- учёт ----------

  private eidFor(rec: Rec, layer: number, ctx: Ctx, data?: Record<string, number | string>): number {
    if (ctx.eid >= 0) return ctx.eid;
    this.ents.push({ type: rec.type, layer, handle: rec.str(5), block: null, data });
    return this.ents.length - 1;
  }

  private markUnsupported(type: string) {
    this.unsupported.set(type, (this.unsupported.get(type) ?? 0) + 1);
  }

  private grow(b: Bounds) {
    if (!Number.isFinite(b.minX + b.minY + b.maxX + b.maxY)) return;
    const t = this.bounds;
    if (!t) {
      this.bounds = { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY };
      return;
    }
    if (b.minX < t.minX) t.minX = b.minX;
    if (b.minY < t.minY) t.minY = b.minY;
    if (b.maxX > t.maxX) t.maxX = b.maxX;
    if (b.maxY > t.maxY) t.maxY = b.maxY;
  }

  // ---------- примитивы ----------

  private addPoly(pts: number[], closed: boolean, style: number, layer: number, eid: number) {
    if (pts.length < 4) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i], y = pts[i + 1];
      if (!Number.isFinite(x + y)) return;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const p: PolyPrim = { k: 0, eid, layer, style, pts, closed, minX, minY, maxX, maxY };
    this.lines[style].push(p);
    this.layers[layer].count++;
    this.primCount++;
    this.grow(p);
  }

  /** Дуга задана в локальных координатах (центр, радиус, углы), матрица переводит её в мир. */
  private addArcLocal(
    cx: number, cy: number, ux: number, uy: number, vx: number, vy: number,
    t0: number, t1: number, m: Mat, style: number, layer: number, eid: number,
  ) {
    // локально: P(t) = C + U·cos t + V·sin t, затем в мир
    const [wcx, wcy] = apply(m, cx, cy);
    const [wux, wuy] = applyVec(m, ux, uy);
    const [wvx, wvy] = applyVec(m, vx, vy);
    this.addArcWorld(wcx, wcy, wux, wuy, wvx, wvy, t0, t1, style, layer, eid);
  }

  private addArcWorld(
    cx: number, cy: number, ux: number, uy: number, vx: number, vy: number,
    t0: number, t1: number, style: number, layer: number, eid: number,
  ) {
    if (!Number.isFinite(cx + cy + ux + uy + vx + vy + t0 + t1)) return;
    if (t1 <= t0) t1 += TAU;
    const b = arcBounds(cx, cy, ux, uy, vx, vy, t0, t1);
    const p: ArcPrim = { k: 1, eid, layer, style, cx, cy, ux, uy, vx, vy, t0, t1, ...b };
    this.lines[style].push(p);
    this.layers[layer].count++;
    this.primCount++;
    this.grow(p);
  }

  private addFill(loops: number[][], rgb: number, pattern: PatternLine[] | null, name: string, layer: number, eid: number) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const keep: number[][] = [];
    for (const l of loops) {
      if (l.length < 6) continue;
      keep.push(l);
      for (let i = 0; i < l.length; i += 2) {
        const x = l[i], y = l[i + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (!keep.length || !Number.isFinite(minX + minY + maxX + maxY)) return;
    const f: FillPrim = { k: 2, eid, layer, rgb, loops: keep, pattern, name, minX, minY, maxX, maxY };
    this.fills.push(f);
    this.layers[layer].count++;
    this.primCount++;
    this.grow(f);
  }

  private addText(t: Omit<TextPrim, 'k' | 'minX' | 'minY' | 'maxX' | 'maxY'>) {
    if (!t.lines.some((l) => l.trim() !== '')) return;
    if (!(t.h > 0) || !Number.isFinite(t.x + t.y + t.h + t.rot)) return;
    // грубые габариты: ширина по числу символов
    let maxChars = 0;
    for (const l of t.lines) maxChars = Math.max(maxChars, l.length);
    let w = maxChars * t.h * 0.6 * t.wf;
    if (t.fit > 0) w = t.fit;
    else if (t.wrapW > 0) w = Math.min(w, t.wrapW);
    const hh = (t.lines.length - 1) * t.pitch * t.h + t.h * 1.3;
    const x0 = t.ha === 0 ? 0 : t.ha === 1 ? -w / 2 : -w;
    const y0 = -hh;
    const c = Math.cos(t.rot), s = Math.sin(t.rot);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [lx, ly] of [[x0, y0], [x0 + w, y0], [x0, y0 + hh * 2], [x0 + w, y0 + hh * 2]]) {
      const px = t.x + lx * c - ly * s;
      const py = t.y + lx * s + ly * c;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    const p: TextPrim = { ...t, k: 3, minX, minY, maxX, maxY };
    this.texts.push(p);
    this.layers[t.layer].count++;
    this.primCount++;
    this.grow(p);
  }

  // ---------- объекты ----------

  private emit(rec: Rec, ctx: Ctx) {
    if (rec.int(60, 0) === 1) return; // невидимый
    try {
      this.emitInner(rec, ctx);
    } catch {
      // Один «битый» объект не должен ронять весь чертёж.
      this.markUnsupported(rec.type + ' (ошибка разбора)');
    }
  }

  private emitInner(rec: Rec, ctx: Ctx) {
    const layer = this.effectiveLayer(rec, ctx);
    let m = ctx.m;
    // Для объектов, заданных в OCS, учитываем вектор выдавливания.
    if (OCS_TYPES.has(rec.type) && (rec.has(230) || rec.has(220) || rec.has(210))) {
      const o = ocsMatrix(rec.num(210, 0), rec.num(220, 0), rec.num(230, 1));
      if (o) m = mul(m, o);
    }

    switch (rec.type) {
      case 'LINE': {
        const eid = this.eidFor(rec, layer, ctx);
        const [x0, y0] = apply(m, rec.num(10), rec.num(20));
        const [x1, y1] = apply(m, rec.num(11), rec.num(21));
        this.addPoly([x0, y0, x1, y1], false, this.lineStyle(rec, layer, ctx), layer, eid);
        return;
      }
      case 'CIRCLE': {
        const eid = this.eidFor(rec, layer, ctx);
        const r = rec.num(40);
        if (!(r > 0)) return;
        this.addArcLocal(rec.num(10), rec.num(20), r, 0, 0, r, 0, TAU, m, this.lineStyle(rec, layer, ctx), layer, eid);
        return;
      }
      case 'ARC': {
        const eid = this.eidFor(rec, layer, ctx);
        const r = rec.num(40);
        if (!(r > 0)) return;
        const a0 = rec.num(50) * DEG;
        let a1 = rec.num(51) * DEG;
        if (a1 <= a0) a1 += TAU;
        this.addArcLocal(rec.num(10), rec.num(20), r, 0, 0, r, a0, a1, m, this.lineStyle(rec, layer, ctx), layer, eid);
        return;
      }
      case 'ELLIPSE': {
        const eid = this.eidFor(rec, layer, ctx);
        const mx = rec.num(11), my = rec.num(21);
        const ratio = rec.num(40, 1);
        const nz = rec.num(230, 1) < 0 ? -1 : 1;
        const vx = -nz * my * ratio;
        const vy = nz * mx * ratio;
        const t0 = rec.num(41, 0);
        const t1 = rec.num(42, TAU);
        this.addArcLocal(rec.num(10), rec.num(20), mx, my, vx, vy, t0, t1, ctx.m, this.lineStyle(rec, layer, ctx), layer, eid);
        return;
      }
      case 'LWPOLYLINE':
        this.emitLwPolyline(rec, layer, ctx, m);
        return;
      case 'POLYLINE':
        this.emitPolyline(rec, layer, ctx, m);
        return;
      case 'SPLINE':
        this.emitSpline(rec, layer, ctx);
        return;
      case 'LEADER':
        this.emitLeader(rec, layer, ctx, m);
        return;
      case 'SOLID':
      case 'TRACE': {
        const eid = this.eidFor(rec, layer, ctx);
        const p: number[][] = [];
        for (let i = 0; i < 4; i++) {
          if (!rec.has(10 + i) && i === 3) break;
          p.push(apply(m, rec.num(10 + i), rec.num(20 + i)));
        }
        if (p.length < 3) return;
        // порядок вершин в DXF: 0, 1, 3, 2
        const order = p.length === 4 ? [0, 1, 3, 2] : [0, 1, 2];
        const loop: number[] = [];
        for (const i of order) loop.push(p[i][0], p[i][1]);
        this.addFill([loop], this.rgbOf(rec, layer, ctx), null, 'SOLID', layer, eid);
        return;
      }
      case '3DFACE': {
        const eid = this.eidFor(rec, layer, ctx);
        const pts: number[] = [];
        for (let i = 0; i < 4; i++) {
          const [x, y] = apply(m, rec.num(10 + i), rec.num(20 + i));
          pts.push(x, y);
        }
        this.addPoly(pts, true, this.lineStyle(rec, layer, ctx), layer, eid);
        return;
      }
      case 'POINT': {
        const eid = this.eidFor(rec, layer, ctx);
        const [x, y] = apply(m, rec.num(10), rec.num(20));
        const p: PointPrim = { k: 4, eid, layer, rgb: this.rgbOf(rec, layer, ctx), x, y, minX: x, maxX: x, minY: y, maxY: y };
        this.points.push(p);
        this.layers[layer].count++;
        this.primCount++;
        this.grow(p);
        return;
      }
      case 'TEXT':
      case 'ATTRIB':
        this.emitText(rec, layer, ctx, m);
        return;
      case 'MTEXT':
        this.emitMText(rec, layer, ctx, m);
        return;
      case 'HATCH':
        this.emitHatch(rec, layer, ctx, m);
        return;
      case 'INSERT':
        this.emitInsert(rec, layer, ctx, m);
        return;
      case 'DIMENSION':
        this.emitDimension(rec, layer, ctx);
        return;
      case 'ATTDEF':
      case 'VIEWPORT':
        return; // служебные: определения атрибутов и рамки видовых экранов не рисуем
      default:
        this.markUnsupported(rec.type);
    }
  }

  private emitLwPolyline(rec: Rec, layer: number, ctx: Ctx, m: Mat) {
    const eid = this.eidFor(rec, layer, ctx);
    const closed = (rec.int(70, 0) & 1) !== 0;
    const xs: number[] = [];
    const ys: number[] = [];
    const bs: number[] = [];
    for (let i = 0; i < rec.codes.length; i++) {
      const c = rec.codes[i];
      if (c === 10) {
        xs.push(parseFloat(rec.vals[i]));
        ys.push(0);
        bs.push(0);
      } else if (c === 20 && ys.length) ys[ys.length - 1] = parseFloat(rec.vals[i]);
      else if (c === 42 && bs.length) bs[bs.length - 1] = parseFloat(rec.vals[i]) || 0;
    }
    this.emitVertices(xs, ys, bs, closed, rec, layer, ctx, m, eid);
  }

  private emitPolyline(rec: Rec, layer: number, ctx: Ctx, m: Mat) {
    const flags = rec.int(70, 0);
    if (flags & (16 | 64)) {
      this.markUnsupported(flags & 64 ? 'POLYLINE (полигональная сеть)' : 'POLYLINE (поверхность)');
      return;
    }
    const eid = this.eidFor(rec, layer, ctx);
    const closed = (flags & 1) !== 0;
    const verts = rec.sub.filter((v) => v.type === 'VERTEX');
    // у сглаженных полилиний часть вершин — управляющие точки каркаса (флаг 16), кривая — вершины с флагом 8
    const hasCurve = verts.some((v) => (v.int(70, 0) & 8) !== 0);
    const used = verts.filter((v) => {
      const f = v.int(70, 0);
      if (f & 16) return false;
      return hasCurve ? (f & 8) !== 0 : true;
    });
    const xs = used.map((v) => v.num(10));
    const ys = used.map((v) => v.num(20));
    const bs = used.map((v) => v.num(42, 0));
    this.emitVertices(xs, ys, bs, closed, rec, layer, ctx, m, eid);
  }

  /** Общий путь для LWPOLYLINE и POLYLINE: вершины + выпуклости → линии и дуги. */
  private emitVertices(
    xs: number[], ys: number[], bs: number[], closed: boolean,
    rec: Rec, layer: number, ctx: Ctx, m: Mat, eid: number,
  ) {
    const n = xs.length;
    if (n < 2) return;
    const style = this.lineStyle(rec, layer, ctx);
    let run: number[] = [];
    const flush = () => {
      if (run.length >= 4) this.addPoly(run, false, style, layer, eid);
      run = [];
    };
    const pushPt = (x: number, y: number) => {
      const [wx, wy] = apply(m, x, y);
      run.push(wx, wy);
    };
    const segs = closed ? n : n - 1;
    pushPt(xs[0], ys[0]);
    let allStraight = true;
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % n;
      const arc = bs[i] ? bulgeArc(xs[i], ys[i], xs[j], ys[j], bs[i]) : null;
      if (arc) {
        allStraight = false;
        flush();
        this.addArcLocal(arc.cx, arc.cy, arc.r, 0, 0, arc.r, arc.t0, arc.t1, m, style, layer, eid);
        run = [];
        pushPt(xs[j], ys[j]);
      } else if (!(closed && i === segs - 1 && allStraight)) {
        pushPt(xs[j], ys[j]);
      }
    }
    if (closed && allStraight) {
      this.addPoly(run, true, style, layer, eid);
    } else {
      flush();
    }
  }

  private emitSpline(rec: Rec, layer: number, ctx: Ctx) {
    const eid = this.eidFor(rec, layer, ctx);
    const degree = rec.int(71, 3);
    const knots = rec.nums(40);
    const cx = rec.nums(10);
    const cy = rec.nums(20);
    const ctrl: number[] = [];
    for (let i = 0; i < Math.min(cx.length, cy.length); i++) ctrl.push(cx[i], cy[i]);
    const closed = (rec.int(70, 0) & 1) !== 0;
    let pts: number[] = [];
    if (ctrl.length >= 4 && knots.length >= ctrl.length / 2 + degree + 1) {
      const w = rec.nums(41);
      const samples = Math.min(4000, Math.max(24, (ctrl.length / 2) * 24));
      pts = evalSpline(degree, knots, ctrl, w.length === ctrl.length / 2 ? w : null, samples);
    }
    if (pts.length < 4) {
      const fx = rec.nums(11);
      const fy = rec.nums(21);
      const fit: number[] = [];
      for (let i = 0; i < Math.min(fx.length, fy.length); i++) fit.push(fx[i], fy[i]);
      pts = fit.length >= 6 ? catmullRom(fit, closed) : fit.length ? fit : ctrl;
    }
    const world: number[] = [];
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const [x, y] = apply(ctx.m, pts[i], pts[i + 1]);
      world.push(x, y);
    }
    this.addPoly(world, false, this.lineStyle(rec, layer, ctx), layer, eid);
  }

  private emitLeader(rec: Rec, layer: number, ctx: Ctx, m: Mat) {
    const eid = this.eidFor(rec, layer, ctx);
    const xs = rec.nums(10);
    const ys = rec.nums(20);
    const pts: number[] = [];
    for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
      const [x, y] = apply(m, xs[i], ys[i]);
      pts.push(x, y);
    }
    const style = this.lineStyle(rec, layer, ctx);
    this.addPoly(pts, false, style, layer, eid);
    // Стрелка на первом конце (флаг 71 = 1: со стрелкой)
    if (rec.int(71, 1) === 1 && pts.length >= 4) {
      const { sx } = decompose(m);
      const L = this.dimArrow * (sx || 1);
      const dx = pts[2] - pts[0], dy = pts[3] - pts[1];
      const d = Math.hypot(dx, dy);
      if (d > 1e-12) {
        const ux = dx / d, uy = dy / d;
        const bx = pts[0] + ux * L, by = pts[1] + uy * L;
        const wx = -uy * L / 6, wy = ux * L / 6;
        this.addFill([[pts[0], pts[1], bx + wx, by + wy, bx - wx, by - wy]], this.rgbOf(rec, layer, ctx), null, 'ARROW', layer, eid);
      }
    }
  }

  private styleDef(rec: Rec) {
    return this.doc.styles.get(rec.str(7, 'STANDARD').toUpperCase());
  }

  private emitText(rec: Rec, layer: number, ctx: Ctx, m: Mat) {
    if (rec.type === 'ATTRIB' && (rec.int(70, 0) & 1)) return; // невидимый атрибут
    const eid = this.eidFor(rec, layer, ctx, { text: plainText(rec.str(1)) });
    const text = plainText(rec.str(1));
    if (!text.trim()) return;
    const sd = this.styleDef(rec);
    const h = rec.num(40, 1);
    const wfLocal = rec.has(41) ? rec.num(41, 1) : (sd?.width ?? 1);
    const rot = rec.num(50, 0) * DEG;
    const oblique = (rec.has(51) ? rec.num(51, 0) : (sd?.oblique ?? 0)) * DEG;
    const h72 = rec.int(72, 0);
    const v73 = rec.int(73, 0);

    let px = rec.num(10), py = rec.num(20);
    let ha: 0 | 1 | 2 = 0;
    let va: 0 | 1 | 2 | 3 = 0;
    let fit = 0;
    let fitMode: 0 | 3 | 5 = 0;
    let rotL = rot;

    if (h72 === 3 || h72 === 5) {
      const qx = rec.num(11, px), qy = rec.num(21, py);
      rotL = Math.atan2(qy - py, qx - px);
      fit = Math.hypot(qx - px, qy - py);
      fitMode = h72 as 3 | 5;
      va = (v73 as 0 | 1 | 2 | 3) || 0;
    } else {
      if (h72 || v73) {
        if (rec.has(11)) {
          px = rec.num(11);
          py = rec.num(21);
        }
        if (h72 === 4) {
          ha = 1;
          va = 2;
        } else {
          ha = (h72 as 0 | 1 | 2) || 0;
          va = (v73 as 0 | 1 | 2 | 3) || 0;
        }
      }
    }

    const [wx, wy] = apply(m, px, py);
    const [dxv, dyv] = applyVec(m, Math.cos(rotL), Math.sin(rotL));
    const [uxv, uyv] = applyVec(m, -Math.sin(rotL), Math.cos(rotL));
    const sx = Math.hypot(dxv, dyv);
    const sy = Math.hypot(uxv, uyv);
    this.addText({
      eid, layer,
      rgb: this.rgbOf(rec, layer, ctx),
      x: wx, y: wy,
      rot: Math.atan2(dyv, dxv),
      h: h * sy,
      wf: wfLocal * (sy > 0 ? sx / sy : 1),
      oblique,
      lines: [text],
      ha, va, fit: fit * sx, fitMode, wrapW: 0, pitch: 1.667,
    });
  }

  private emitMText(rec: Rec, layer: number, ctx: Ctx, m: Mat) {
    // содержимое: группы 3 (куски по 250 символов) и затем 1
    let raw = '';
    for (let i = 0; i < rec.codes.length; i++) if (rec.codes[i] === 3) raw += rec.vals[i];
    raw += rec.str(1);
    const lines = parseMText(raw);
    const eid = this.eidFor(rec, layer, ctx, { text: lines.join('\n') });
    const sd = this.styleDef(rec);
    const h = rec.num(40, sd?.height || 1) || 1;
    const attach = Math.min(9, Math.max(1, rec.int(71, 1)));
    const col = (attach - 1) % 3;
    const row = Math.floor((attach - 1) / 3);
    let rot = rec.num(50, 0) * DEG;
    if (rec.has(11) || rec.has(21)) rot = Math.atan2(rec.num(21, 0), rec.num(11, 1));
    const width = rec.num(41, 0);
    const [wx, wy] = apply(m, rec.num(10), rec.num(20));
    const [dxv, dyv] = applyVec(m, Math.cos(rot), Math.sin(rot));
    const [uxv, uyv] = applyVec(m, -Math.sin(rot), Math.cos(rot));
    const sx = Math.hypot(dxv, dyv);
    const sy = Math.hypot(uxv, uyv);
    this.addText({
      eid, layer,
      rgb: this.rgbOf(rec, layer, ctx),
      x: wx, y: wy,
      rot: Math.atan2(dyv, dxv),
      h: h * sy,
      wf: (sd?.width ?? 1) * (sy > 0 ? sx / sy : 1),
      oblique: (sd?.oblique ?? 0) * DEG,
      lines,
      ha: col as 0 | 1 | 2,
      va: (row === 0 ? 3 : row === 1 ? 2 : 1) as 1 | 2 | 3,
      fit: 0, fitMode: 0,
      wrapW: width * sx,
      pitch: 1.667 * (rec.num(44, 1) || 1),
    });
  }

  private emitInsert(rec: Rec, layer: number, ctx: Ctx, m: Mat) {
    const name = rec.str(2);
    const block = this.doc.blocks.get(name);
    if (!block) {
      this.markUnsupported('INSERT (нет блока «' + name + '»)');
      return;
    }
    if (ctx.path.length >= MAX_DEPTH || ctx.path.includes(name)) {
      this.markUnsupported('INSERT (рекурсия блока)');
      return;
    }
    const ix = rec.num(10), iy = rec.num(20);
    const sx = rec.num(41, 1) || 1;
    const sy = rec.num(42, 1) || 1;
    const rot = rec.num(50, 0) * DEG;
    const cols = Math.max(1, rec.int(70, 1));
    const rows = Math.max(1, rec.int(71, 1));
    const dc = rec.num(44, 0);
    const dr = rec.num(45, 0);
    if (cols * rows > MAX_ARRAY) {
      this.markUnsupported('INSERT (слишком большой массив)');
      return;
    }
    const eid = ctx.eid >= 0 ? ctx.eid : this.eidForInsert(rec, layer, name);
    const rgb = this.rgbOf(rec, layer, ctx);
    const inner: Ctx = {
      m,
      layer,
      rgb,
      lw: rec.has(370) ? rec.int(370, -1) : ctx.lw,
      lt: rec.has(6) ? rec.str(6) : ctx.lt,
      eid,
      path: [...ctx.path, name],
      block: ctx.block ?? name,
    };
    const R = rotate(rot);
    const S = scale(sx, sy);
    const B = translate(-block.baseX, -block.baseY);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let mm = mul(m, translate(ix, iy));
        mm = mul(mm, R);
        if (c || r) mm = mul(mm, translate(c * dc, r * dr));
        mm = mul(mm, S);
        mm = mul(mm, B);
        inner.m = mm;
        for (const e of block.entities) this.emit(e, inner);
        // атрибуты лежат в координатах вставки, а не блока; для массива рисуем один раз
        if (!c && !r) {
          for (const a of rec.sub) if (a.type === 'ATTRIB') this.emit(a, { ...inner, m });
        }
      }
    }
  }

  private eidForInsert(rec: Rec, layer: number, name: string): number {
    this.ents.push({
      type: 'INSERT',
      layer,
      handle: rec.str(5),
      block: name,
      data: {
        x: rec.num(10), y: rec.num(20),
        sx: rec.num(41, 1), sy: rec.num(42, 1), rot: rec.num(50, 0),
        cols: rec.int(70, 1), rows: rec.int(71, 1),
      },
    });
    return this.ents.length - 1;
  }

  private emitDimension(rec: Rec, layer: number, ctx: Ctx) {
    const name = rec.str(2);
    const block = name ? this.doc.blocks.get(name) : undefined;
    if (!block) {
      this.markUnsupported('DIMENSION (нет геометрии размера)');
      return;
    }
    const dimType = rec.int(70, 0) & 7;
    const eid = ctx.eid >= 0 ? ctx.eid : this.eidFor(rec, layer, ctx, { dimType, measurement: rec.num(42, NaN) });
    if (this.ents[eid] && ctx.eid < 0) this.ents[eid].block = name;
    const inner: Ctx = {
      m: ctx.m,
      layer,
      rgb: this.rgbOf(rec, layer, ctx),
      lw: ctx.lw,
      lt: ctx.lt,
      eid,
      path: [...ctx.path, name],
      block: ctx.block ?? name,
    };
    if (ctx.path.length >= MAX_DEPTH || ctx.path.includes(name)) return;
    // размерные блоки определены в мировых координатах, базовая точка не применяется
    for (const e of block.entities) this.emit(e, inner);
  }

  // ---------- штриховка ----------

  private emitHatch(rec: Rec, layer: number, ctx: Ctx, m: Mat) {
    const eid = this.eidFor(rec, layer, ctx);
    const h = readHatch(rec);
    if (!h.loops.length) {
      this.markUnsupported('HATCH (пустые границы)');
      return;
    }
    const loops = h.loops.map((l) => {
      const out: number[] = new Array(l.length);
      for (let i = 0; i < l.length; i += 2) {
        const [x, y] = apply(m, l[i], l[i + 1]);
        out[i] = x;
        out[i + 1] = y;
      }
      return out;
    });
    let pattern: PatternLine[] | null = null;
    if (!h.solid && h.lines.length) {
      const { sx } = decompose(m);
      pattern = h.lines.map((pl) => {
        const [x0, y0] = apply(m, pl.x0, pl.y0);
        const a = pl.angle * DEG;
        const [dx, dy] = applyVec(m, Math.cos(a), Math.sin(a));
        const dl = Math.hypot(dx, dy) || 1;
        const [ox, oy] = applyVec(m, pl.ox, pl.oy);
        return {
          x0, y0, dx: dx / dl, dy: dy / dl, ox, oy,
          dash: pl.dash.length >= 2 ? toDash(pl.dash, sx || 1) : null,
        };
      });
    }
    this.addFill(loops, this.rgbOf(rec, layer, ctx), pattern, h.name, layer, eid);
  }
}

// ---------- вспомогательное ----------

/** Шаблон типа линий DXF → формат setLineDash (штрих, пропуск, ...), в мировых единицах. */
export function toDash(pattern: number[], scale: number): number[] | null {
  const a: number[] = [];
  let lastOn: boolean | null = null;
  let sum = 0;
  for (const e of pattern) {
    const on = e >= 0;
    let len = Math.abs(e) * scale;
    if (e === 0) len = 0.2 * scale; // точка
    sum += len;
    if (lastOn === on && a.length) a[a.length - 1] += len;
    else a.push(len);
    lastOn = on;
  }
  if (!(sum > 0) || a.length < 2) return null;
  // начинаться должно со штриха
  if (pattern[0] < 0 && a.length >= 2) a.push(a.shift()!);
  if (a.length % 2 === 1) a.push(a[0]);
  return a;
}

export function arcBounds(
  cx: number, cy: number, ux: number, uy: number, vx: number, vy: number, t0: number, t1: number,
): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const take = (t: number) => {
    const c = Math.cos(t), s = Math.sin(t);
    const x = cx + ux * c + vx * s;
    const y = cy + uy * c + vy * s;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  take(t0);
  take(t1);
  // экстремумы: x'(t) = -ux·sin t + vx·cos t = 0  →  t = atan2(vx, ux) + kπ
  for (const base of [Math.atan2(vx, ux), Math.atan2(vy, uy)]) {
    let k = Math.ceil((t0 - base) / Math.PI);
    for (let t = base + k * Math.PI; t < t1; t += Math.PI) take(t);
  }
  return { minX, minY, maxX, maxY };
}

interface RawPatLine {
  angle: number;
  x0: number;
  y0: number;
  ox: number;
  oy: number;
  dash: number[];
}

interface HatchData {
  solid: boolean;
  name: string;
  loops: number[][];
  lines: RawPatLine[];
}

function sampleArc(cx: number, cy: number, rx: number, ry: number, rot: number, a0: number, a1: number, out: number[]) {
  const sweep = a1 - a0;
  const n = Math.max(6, Math.ceil(Math.abs(sweep) / 0.07));
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i <= n; i++) {
    const t = a0 + (sweep * i) / n;
    const lx = rx * Math.cos(t), ly = ry * Math.sin(t);
    out.push(cx + lx * c - ly * s, cy + lx * s + ly * c);
  }
}

/** Читаем HATCH по порядку групп: граничные контуры, затем определение узора. */
export function readHatch(rec: Rec): HatchData {
  const codes = rec.codes, vals = rec.vals;
  const n = codes.length;
  const name = rec.str(2, 'SOLID');
  const solid = rec.int(70, 0) === 1;
  const loops: number[][] = [];
  const lines: RawPatLine[] = [];

  let i = codes.indexOf(91);
  if (i < 0) return { solid, name, loops, lines };
  const nPaths = parseInt(vals[i], 10) || 0;
  i++;
  const num = (k: number) => parseFloat(vals[k]);

  for (let p = 0; p < nPaths; p++) {
    while (i < n && codes[i] !== 92) i++;
    if (i >= n) break;
    const flags = parseInt(vals[i], 10) || 0;
    i++;
    const pts: number[] = [];
    if (flags & 2) {
      // полилиния: 72 есть ли выпуклости, 73 замкнута, 93 число вершин, затем 10/20(/42)
      const xs: number[] = [], ys: number[] = [], bs: number[] = [];
      let closed = true;
      while (i < n && codes[i] !== 97 && codes[i] !== 92 && codes[i] !== 75) {
        const c = codes[i];
        if (c === 73) closed = parseInt(vals[i], 10) !== 0;
        else if (c === 10) { xs.push(num(i)); ys.push(0); bs.push(0); }
        else if (c === 20 && ys.length) ys[ys.length - 1] = num(i);
        else if (c === 42 && bs.length) bs[bs.length - 1] = num(i) || 0;
        i++;
      }
      const cnt = xs.length;
      const segs = closed ? cnt : cnt - 1;
      for (let k = 0; k < cnt; k++) {
        pts.push(xs[k], ys[k]);
        if (k < segs) {
          const j = (k + 1) % cnt;
          const arc = bs[k] ? bulgeArc(xs[k], ys[k], xs[j], ys[j], bs[k]) : null;
          if (arc) {
            const mid: number[] = [];
            sampleArc(arc.cx, arc.cy, arc.r, arc.r, 0, arc.t0, arc.t1, mid);
            // дуга всегда против часовой; если выпуклость отрицательная — идём с конца
            if (bs[k] < 0) {
              const rev: number[] = [];
              for (let q = mid.length - 2; q >= 0; q -= 2) rev.push(mid[q], mid[q + 1]);
              pts.push(...rev.slice(2, -2));
            } else {
              pts.push(...mid.slice(2, -2));
            }
          }
        }
      }
    } else {
      // набор рёбер: 93 число рёбер, затем каждое ребро начинается с 72 (тип)
      const edges: { type: number; c: number[]; v: number[]; fitSeen?: boolean }[] = [];
      while (i < n && codes[i] !== 92 && codes[i] !== 75) {
        const last = edges[edges.length - 1];
        if (codes[i] === 97) {
          // у сплайна 97 — число точек подгонки (один раз); иначе это число исходных объектов границы
          if (last && last.type === 4 && !last.fitSeen) last.fitSeen = true;
          else break;
        } else if (codes[i] === 72) edges.push({ type: parseInt(vals[i], 10), c: [], v: [] });
        else if (codes[i] !== 93 && edges.length) {
          const e = edges[edges.length - 1];
          e.c.push(codes[i]);
          e.v.push(num(i));
        }
        i++;
      }
      let prevEnd: [number, number] | null = null;
      for (const e of edges) {
        const g = (code: number, def = 0) => {
          const k = e.c.indexOf(code);
          return k < 0 ? def : e.v[k];
        };
        const seg: number[] = [];
        if (e.type === 1) {
          seg.push(g(10), g(20), g(11), g(21));
        } else if (e.type === 2) {
          let a0 = g(50) * DEG, a1 = g(51) * DEG;
          const ccw = g(73, 1) !== 0;
          if (ccw) { if (a1 <= a0) a1 += TAU; }
          else if (a1 >= a0) a1 -= TAU;
          sampleArc(g(10), g(20), g(40), g(40), 0, a0, a1, seg);
        } else if (e.type === 3) {
          const mx = g(11), my = g(21);
          const major = Math.hypot(mx, my);
          let a0 = g(50) * DEG, a1 = g(51) * DEG;
          const ccw = g(73, 1) !== 0;
          if (ccw) { if (a1 <= a0) a1 += TAU; }
          else if (a1 >= a0) a1 -= TAU;
          sampleArc(g(10), g(20), major, major * g(40, 1), Math.atan2(my, mx), a0, a1, seg);
        } else if (e.type === 4) {
          const degree = g(94, 3);
          const knots: number[] = [], cx: number[] = [], cy: number[] = [], w: number[] = [];
          for (let k = 0; k < e.c.length; k++) {
            if (e.c[k] === 40) knots.push(e.v[k]);
            else if (e.c[k] === 10) cx.push(e.v[k]);
            else if (e.c[k] === 20) cy.push(e.v[k]);
            else if (e.c[k] === 42) w.push(e.v[k]);
          }
          const ctrl: number[] = [];
          for (let k = 0; k < Math.min(cx.length, cy.length); k++) ctrl.push(cx[k], cy[k]);
          const pts2 = evalSpline(degree, knots, ctrl, w.length === ctrl.length / 2 ? w : null, Math.max(24, ctrl.length * 6));
          seg.push(...(pts2.length ? pts2 : ctrl));
        }
        if (seg.length < 4) continue;
        // ориентация ребра: по возможности стыкуем с предыдущим
        if (prevEnd) {
          const dStart = Math.hypot(seg[0] - prevEnd[0], seg[1] - prevEnd[1]);
          const dEnd = Math.hypot(seg[seg.length - 2] - prevEnd[0], seg[seg.length - 1] - prevEnd[1]);
          if (dEnd < dStart) {
            const rev: number[] = [];
            for (let q = seg.length - 2; q >= 0; q -= 2) rev.push(seg[q], seg[q + 1]);
            seg.length = 0;
            seg.push(...rev);
          }
        }
        prevEnd = [seg[seg.length - 2], seg[seg.length - 1]];
        pts.push(...(pts.length ? seg.slice(2) : seg));
      }
    }
    // пропускаем 97 и ссылки на исходные объекты (330)
    while (i < n && (codes[i] === 97 || codes[i] === 330)) i++;
    if (pts.length >= 6) loops.push(pts);
  }

  // узор: 78 — число линий, каждая: 53 угол, 43/44 база, 45/46 сдвиг, 79 число штрихов, 49 × N
  if (!solid) {
    const k0 = codes.indexOf(78, i);
    if (k0 >= 0) {
      const cnt = parseInt(vals[k0], 10) || 0;
      let k = k0 + 1;
      for (let li = 0; li < cnt && k < n; li++) {
        while (k < n && codes[k] !== 53) k++;
        if (k >= n) break;
        const pl: RawPatLine = { angle: num(k), x0: 0, y0: 0, ox: 0, oy: 0, dash: [] };
        k++;
        while (k < n && codes[k] !== 53 && codes[k] !== 47 && codes[k] !== 98) {
          const c = codes[k];
          if (c === 43) pl.x0 = num(k);
          else if (c === 44) pl.y0 = num(k);
          else if (c === 45) pl.ox = num(k);
          else if (c === 46) pl.oy = num(k);
          else if (c === 49) pl.dash.push(num(k));
          k++;
        }
        lines.push(pl);
      }
    }
  }
  return { solid, name, loops, lines };
}
