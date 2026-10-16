// Геометрические помощники: аффинные матрицы 2D, дуги по выпуклости (bulge), NURBS.

/** [a, b, c, d, e, f]: x' = a·x + c·y + e,  y' = b·x + d·y + f */
export type Mat = readonly [number, number, number, number, number, number];

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

/** mul(p, q) — сначала q, потом p (как умножение матриц p·q). */
export function mul(p: Mat, q: Mat): Mat {
  return [
    p[0] * q[0] + p[2] * q[1],
    p[1] * q[0] + p[3] * q[1],
    p[0] * q[2] + p[2] * q[3],
    p[1] * q[2] + p[3] * q[3],
    p[0] * q[4] + p[2] * q[5] + p[4],
    p[1] * q[4] + p[3] * q[5] + p[5],
  ];
}

export function translate(x: number, y: number): Mat {
  return [1, 0, 0, 1, x, y];
}
export function rotate(rad: number): Mat {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, s, -s, c, 0, 0];
}
export function scale(sx: number, sy: number): Mat {
  return [sx, 0, 0, sy, 0, 0];
}

export function apply(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Только линейная часть (без переноса) — для векторов. */
export function applyVec(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y, m[1] * x + m[3] * y];
}

export function det(m: Mat): number {
  return m[0] * m[3] - m[1] * m[2];
}

/** Масштаб по осям и поворот приблизительно (для текста внутри повёрнутых/масштабированных блоков). */
export function decompose(m: Mat): { sx: number; sy: number; rot: number; mirrored: boolean } {
  const sx = Math.hypot(m[0], m[1]);
  const sy = Math.hypot(m[2], m[3]);
  return { sx, sy, rot: Math.atan2(m[1], m[0]), mirrored: det(m) < 0 };
}

/**
 * Матрица перехода из OCS в WCS (в проекции на плоскость XY) по вектору выдавливания.
 * Возвращает null для обычного случая (0,0,1).
 */
export function ocsMatrix(nx: number, ny: number, nz: number): Mat | null {
  const len = Math.hypot(nx, ny, nz);
  if (!(len > 1e-12)) return null;
  nx /= len;
  ny /= len;
  nz /= len;
  if (Math.abs(nx) < 1e-9 && Math.abs(ny) < 1e-9) {
    return nz >= 0 ? null : [-1, 0, 0, 1, 0, 0];
  }
  // Алгоритм произвольной оси (Arbitrary Axis Algorithm).
  let ax: number, ay: number, az: number;
  if (Math.abs(nx) < 1 / 64 && Math.abs(ny) < 1 / 64) {
    // Ax = Y × N
    ax = 1 * nz - 0 * ny;
    ay = 0 * nx - 0 * nz;
    az = 0 * ny - 1 * nx;
  } else {
    // Ax = Z × N
    ax = 0 * nz - 1 * ny;
    ay = 1 * nx - 0 * nz;
    az = 0;
  }
  const al = Math.hypot(ax, ay, az);
  ax /= al;
  ay /= al;
  az /= al;
  // Ay = N × Ax
  const byx = ny * az - nz * ay;
  const byy = nz * ax - nx * az;
  return [ax, ay, byx, byy, 0, 0];
}

export interface BulgeArc {
  cx: number;
  cy: number;
  r: number;
  /** Дуга всегда идёт против часовой от t0 до t1 (t1 > t0). */
  t0: number;
  t1: number;
}

/** Дуга между двумя вершинами полилинии с заданной выпуклостью. */
export function bulgeArc(x0: number, y0: number, x1: number, y1: number, bulge: number): BulgeArc | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const d = Math.hypot(dx, dy);
  if (d < 1e-12 || Math.abs(bulge) < 1e-12) return null;
  const theta = 4 * Math.atan(bulge);
  const half = theta / 2;
  const r = Math.abs(d / (2 * Math.sin(half)));
  const h = d / 2 / Math.tan(half);
  const cx = (x0 + x1) / 2 - (dy / d) * h;
  const cy = (y0 + y1) / 2 + (dx / d) * h;
  const a0 = Math.atan2(y0 - cy, x0 - cx);
  return theta > 0 ? { cx, cy, r, t0: a0, t1: a0 + theta } : { cx, cy, r, t0: a0 + theta, t1: a0 };
}

/** Точки B-сплайна (NURBS, если заданы веса) по алгоритму де Бура. */
export function evalSpline(
  degree: number,
  knots: number[],
  ctrl: number[], // x0,y0,x1,y1...
  weights: number[] | null,
  samples: number,
): number[] {
  const n = ctrl.length / 2;
  const p = degree;
  if (n < p + 1 || knots.length < n + p + 1) return [];
  const t0 = knots[p];
  const t1 = knots[n];
  if (!(t1 > t0)) return [];
  const out: number[] = [];

  const findSpan = (t: number): number => {
    if (t >= knots[n]) return n - 1;
    let lo = p;
    let hi = n;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (t < knots[mid]) hi = mid;
      else lo = mid;
    }
    return lo;
  };

  for (let s = 0; s <= samples; s++) {
    const t = t0 + ((t1 - t0) * s) / samples;
    const k = findSpan(t);
    // однородные координаты: (w·x, w·y, w)
    const dx: number[] = [];
    const dy: number[] = [];
    const dw: number[] = [];
    for (let j = 0; j <= p; j++) {
      const idx = k - p + j;
      const w = weights ? (weights[idx] ?? 1) : 1;
      dx.push(ctrl[idx * 2] * w);
      dy.push(ctrl[idx * 2 + 1] * w);
      dw.push(w);
    }
    for (let r = 1; r <= p; r++) {
      for (let j = p; j >= r; j--) {
        const i = k - p + j;
        const den = knots[i + p - r + 1] - knots[i];
        const a = den === 0 ? 0 : (t - knots[i]) / den;
        dx[j] = (1 - a) * dx[j - 1] + a * dx[j];
        dy[j] = (1 - a) * dy[j - 1] + a * dy[j];
        dw[j] = (1 - a) * dw[j - 1] + a * dw[j];
      }
    }
    const w = dw[p] || 1;
    out.push(dx[p] / w, dy[p] / w);
  }
  return out;
}

/** Кривая Катмулла–Рома через заданные точки (для сплайнов, где есть только точки подгонки). */
export function catmullRom(pts: number[], closed: boolean, perSeg = 12): number[] {
  const n = pts.length / 2;
  if (n < 3) return pts.slice();
  const out: number[] = [];
  const P = (i: number): [number, number] => {
    if (closed) {
      const k = ((i % n) + n) % n;
      return [pts[k * 2], pts[k * 2 + 1]];
    }
    const k = Math.max(0, Math.min(n - 1, i));
    return [pts[k * 2], pts[k * 2 + 1]];
  };
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg;
      const t2 = t * t;
      const t3 = t2 * t;
      for (let c = 0; c < 2; c++) {
        const v =
          0.5 *
          (2 * p1[c] +
            (-p0[c] + p2[c]) * t +
            (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 +
            (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3);
        out.push(v);
      }
    }
  }
  const last = closed ? P(0) : P(n - 1);
  out.push(last[0], last[1]);
  return out;
}
