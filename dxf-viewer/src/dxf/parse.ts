// Разбор текстового DXF: группы «код/значение» → секции → таблицы, блоки, объекты.
// Парсер ничего не знает про геометрию: он только раскладывает данные. Неизвестные объекты
// не выбрасываются — они доезжают до сцены, где попадают в список «не отрисовано».

/** Один объект DXF (или запись таблицы) как плоский список групп. */
export class Rec {
  /** Вложенные записи: VERTEX у POLYLINE, ATTRIB у INSERT. */
  sub: Rec[] = [];
  constructor(
    public type: string,
    public codes: number[],
    public vals: string[],
  ) {}

  private idx(code: number, from = 0): number {
    const c = this.codes;
    for (let i = from; i < c.length; i++) if (c[i] === code) return i;
    return -1;
  }
  has(code: number): boolean {
    return this.idx(code) >= 0;
  }
  str(code: number, def = ''): string {
    const i = this.idx(code);
    return i < 0 ? def : this.vals[i];
  }
  num(code: number, def = 0): number {
    const i = this.idx(code);
    if (i < 0) return def;
    const v = parseFloat(this.vals[i]);
    return Number.isFinite(v) ? v : def;
  }
  int(code: number, def = 0): number {
    const i = this.idx(code);
    if (i < 0) return def;
    const v = parseInt(this.vals[i], 10);
    return Number.isFinite(v) ? v : def;
  }
  /** Все значения группы (повторяющиеся коды: вершины, узлы сплайна...). */
  all(code: number): string[] {
    const out: string[] = [];
    for (let i = 0; i < this.codes.length; i++) if (this.codes[i] === code) out.push(this.vals[i]);
    return out;
  }
  nums(code: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.codes.length; i++) {
      if (this.codes[i] === code) {
        const v = parseFloat(this.vals[i]);
        out.push(Number.isFinite(v) ? v : 0);
      }
    }
    return out;
  }
}

export interface LayerDef {
  name: string;
  /** Индекс цвета ACI (всегда >= 0; знак «выключен» вынесен в on). */
  aci: number;
  /** Истинный цвет 0xRRGGBB, если задан (420). */
  rgb: number | null;
  on: boolean;
  frozen: boolean;
  /** Вес линии, сотые доли мм; -3 — по умолчанию. */
  lw: number;
  ltype: string;
}

export interface LtypeDef {
  name: string;
  /** Элементы шаблона: > 0 штрих, < 0 пропуск, 0 точка. */
  pattern: number[];
}

export interface StyleDef {
  name: string;
  height: number;
  width: number;
  oblique: number;
  font: string;
}

export interface BlockDef {
  name: string;
  baseX: number;
  baseY: number;
  entities: Rec[];
}

export interface DxfDoc {
  header: Map<string, { codes: number[]; vals: string[] }>;
  layers: Map<string, LayerDef>;
  ltypes: Map<string, LtypeDef>;
  styles: Map<string, StyleDef>;
  blocks: Map<string, BlockDef>;
  entities: Rec[];
  /** Сколько объектов лежит в пространстве листа (мы показываем только модель). */
  paperSpaceCount: number;
  version: string | null;
  codepage: string | null;
}

export function headerNum(doc: DxfDoc, name: string, def = 0): number {
  const h = doc.header.get(name);
  if (!h || !h.vals.length) return def;
  const v = parseFloat(h.vals[0]);
  return Number.isFinite(v) ? v : def;
}

export function headerStr(doc: DxfDoc, name: string): string | null {
  const h = doc.header.get(name);
  return h && h.vals.length ? h.vals[0].trim() : null;
}

export class DxfFormatError extends Error {}

interface Groups {
  codes: number[];
  vals: string[];
}

export function tokenize(input: string): Groups {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  // Очень старые файлы с переводами строк «\r» (Mac).
  if (text.indexOf('\n') < 0 && text.indexOf('\r') >= 0) text = text.replace(/\r/g, '\n');

  const codes: number[] = [];
  const vals: string[] = [];
  const n = text.length;
  let pos = 0;

  const line = (): string | null => {
    if (pos >= n) return null;
    let e = text.indexOf('\n', pos);
    if (e < 0) e = n;
    let end = e;
    if (end > pos && text.charCodeAt(end - 1) === 13) end--;
    const s = text.slice(pos, end);
    pos = e + 1;
    return s;
  };

  while (pos < n) {
    const c = line();
    if (c === null) break;
    const t = c.trim();
    if (t === '') continue; // пустые строки между парами — пропускаем, пока не нашли код
    // Не код группы — теряем синхронизацию; пропускаем строку и ищем дальше.
    if (!/^[+-]?\d+$/.test(t)) continue;
    const code = parseInt(t, 10);
    const v = line();
    if (v === null) break;
    codes.push(code);
    vals.push(v);
  }
  return { codes, vals };
}

/** Режем плоский список групп на записи по коду 0. */
function splitRecords(g: Groups, from: number, to: number): Rec[] {
  const out: Rec[] = [];
  let i = from;
  while (i < to) {
    if (g.codes[i] !== 0) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < to && g.codes[j] !== 0) j++;
    out.push(new Rec(g.vals[i].trim().toUpperCase(), g.codes.slice(i, j), g.vals.slice(i, j)));
    i = j;
  }
  return out;
}

/** POLYLINE + VERTEX... + SEQEND и INSERT + ATTRIB... + SEQEND склеиваем в один объект. */
function assemble(recs: Rec[]): Rec[] {
  const out: Rec[] = [];
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    if (r.type === 'POLYLINE') {
      while (i + 1 < recs.length && recs[i + 1].type === 'VERTEX') r.sub.push(recs[++i]);
      if (i + 1 < recs.length && recs[i + 1].type === 'SEQEND') i++;
      out.push(r);
    } else if (r.type === 'INSERT') {
      while (i + 1 < recs.length && recs[i + 1].type === 'ATTRIB') r.sub.push(recs[++i]);
      if (i + 1 < recs.length && recs[i + 1].type === 'SEQEND') i++;
      out.push(r);
    } else if (r.type === 'SEQEND') {
      // потерянный SEQEND
    } else {
      out.push(r);
    }
  }
  return out;
}

export function parseDxf(text: string): DxfDoc {
  const g = tokenize(text);
  if (g.codes.length < 4) throw new DxfFormatError('Файл не похож на DXF: нет данных.');

  const doc: DxfDoc = {
    header: new Map(),
    layers: new Map(),
    ltypes: new Map(),
    styles: new Map(),
    blocks: new Map(),
    entities: [],
    paperSpaceCount: 0,
    version: null,
    codepage: null,
  };

  // Бывают файлы без SECTION-обёртки (голый ENTITIES) — редкость, не поддерживаем, но и не падаем.
  let sawSection = false;
  const total = g.codes.length;
  let i = 0;
  while (i < total) {
    if (g.codes[i] === 0 && g.vals[i].trim() === 'SECTION' && g.codes[i + 1] === 2) {
      sawSection = true;
      const name = g.vals[i + 1].trim().toUpperCase();
      let end = i + 2;
      while (end < total && !(g.codes[end] === 0 && g.vals[end].trim() === 'ENDSEC')) end++;
      readSection(doc, name, g, i + 2, end);
      i = end + 1;
    } else {
      i++;
    }
  }
  if (!sawSection) throw new DxfFormatError('Файл не похож на DXF: не найдены секции SECTION.');

  doc.version = headerStr(doc, '$ACADVER');
  doc.codepage = headerStr(doc, '$DWGCODEPAGE');
  return doc;
}

function readSection(doc: DxfDoc, name: string, g: Groups, from: number, to: number) {
  switch (name) {
    case 'HEADER': {
      let cur: { codes: number[]; vals: string[] } | null = null;
      for (let i = from; i < to; i++) {
        if (g.codes[i] === 9) {
          cur = { codes: [], vals: [] };
          doc.header.set(g.vals[i].trim(), cur);
        } else if (cur) {
          cur.codes.push(g.codes[i]);
          cur.vals.push(g.vals[i]);
        }
      }
      break;
    }
    case 'TABLES':
      for (const r of splitRecords(g, from, to)) readTableRecord(doc, r);
      break;
    case 'BLOCKS': {
      const recs = assemble(splitRecords(g, from, to));
      let cur: BlockDef | null = null;
      for (const r of recs) {
        if (r.type === 'BLOCK') {
          cur = {
            name: r.str(2),
            baseX: r.num(10),
            baseY: r.num(20),
            entities: [],
          };
          doc.blocks.set(cur.name, cur);
        } else if (r.type === 'ENDBLK') {
          cur = null;
        } else if (cur) {
          cur.entities.push(r);
        }
      }
      break;
    }
    case 'ENTITIES':
      for (const r of assemble(splitRecords(g, from, to))) {
        if (r.int(67, 0) === 1) doc.paperSpaceCount++;
        else doc.entities.push(r);
      }
      break;
  }
}

function readTableRecord(doc: DxfDoc, r: Rec) {
  switch (r.type) {
    case 'LAYER': {
      const name = r.str(2);
      const colorRaw = r.int(62, 7);
      const flags = r.int(70, 0);
      doc.layers.set(name, {
        name,
        aci: Math.abs(colorRaw),
        rgb: r.has(420) ? r.int(420) & 0xffffff : null,
        on: colorRaw >= 0,
        frozen: (flags & 1) !== 0,
        lw: r.int(370, -3),
        ltype: r.str(6, 'CONTINUOUS'),
      });
      break;
    }
    case 'LTYPE': {
      const name = r.str(2);
      doc.ltypes.set(name.toUpperCase(), { name, pattern: r.nums(49) });
      break;
    }
    case 'STYLE': {
      const name = r.str(2);
      doc.styles.set(name.toUpperCase(), {
        name,
        height: r.num(40, 0),
        width: r.num(41, 1) || 1,
        oblique: r.num(50, 0),
        font: r.str(3),
      });
      break;
    }
  }
}
