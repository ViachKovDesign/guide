import { describe, expect, it } from 'vitest';
import { codepageToLabel, decodeDxf, isBinaryDxf, isDwg } from '../src/dxf/decode';
import { bulgeArc, evalSpline, ocsMatrix, mul, rotate, translate, apply } from '../src/dxf/geom';
import { DxfFormatError, parseDxf, tokenize } from '../src/dxf/parse';
import { buildScene } from '../src/dxf/scene';
import { decodePercent, parseMText, plainText } from '../src/dxf/text';
import { computeFit } from '../src/render/fit';
import { aciToRgb } from '../src/dxf/aci';

/** Кодируем строку в Windows-1251 (только то, что нужно в тестах). */
function cp1251(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c >= 0x410 && c <= 0x44f) out.push(c - 0x410 + 0xc0);
    else if (c === 0x401) out.push(0xa8);
    else if (c === 0x451) out.push(0xb8);
    else throw new Error('нет в тесте: ' + ch);
  }
  return out;
}
const toBuf = (bytes: number[]) => new Uint8Array(bytes).buffer;

function minimalDxf(opts: { version?: string; codepage?: string; text: string }) {
  const head = ['0', 'SECTION', '2', 'HEADER'];
  if (opts.version) head.push('9', '$ACADVER', '1', opts.version);
  if (opts.codepage) head.push('9', '$DWGCODEPAGE', '3', opts.codepage);
  head.push('0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', '0', 'TEXT', '8', '0', '10', '0', '20', '0', '40', '5', '1', opts.text, '0', 'ENDSEC', '0', 'EOF');
  return head.join('\r\n') + '\r\n';
}

describe('кодировка', () => {
  const word = 'Привет, Ёжик — проверка';
  const ascii = word.replace(/—/g, '-');

  it('ANSI_1251 → windows-1251', () => {
    const bytes = cp1251(minimalDxf({ version: 'AC1015', codepage: 'ANSI_1251', text: ascii }));
    const r = decodeDxf(toBuf(bytes));
    expect(r.encoding).toBe('windows-1251');
    expect(r.reason).toBe('codepage');
    expect(r.text).toContain(ascii);
  });

  it('кодовая страница не указана, файл не UTF-8 → считаем 1251', () => {
    const r = decodeDxf(toBuf(cp1251(minimalDxf({ version: 'AC1009', text: ascii }))));
    expect(r.encoding).toBe('windows-1251');
    expect(r.text).toContain(ascii);
  });

  it('старая версия, но файл записан в UTF-8 — доверяем содержимому', () => {
    const utf8 = new TextEncoder().encode(minimalDxf({ version: 'AC1015', codepage: 'ANSI_1251', text: ascii }));
    const r = decodeDxf(utf8.buffer.slice(0) as ArrayBuffer);
    expect(r.encoding).toBe('utf-8');
    expect(r.text).toContain(ascii);
  });

  it('R2007+ всегда UTF-8, даже если в заголовке 1251', () => {
    const utf8 = new TextEncoder().encode(minimalDxf({ version: 'AC1021', codepage: 'ANSI_1251', text: ascii }));
    expect(decodeDxf(utf8.buffer.slice(0) as ArrayBuffer).encoding).toBe('utf-8');
  });

  it('ручной выбор кодировки главнее автоопределения', () => {
    const bytes = cp1251(minimalDxf({ version: 'AC1015', codepage: 'ANSI_1252', text: ascii }));
    expect(decodeDxf(toBuf(bytes)).text).not.toContain(ascii); // 1252 даёт кракозябры
    const r = decodeDxf(toBuf(bytes), 'windows-1251');
    expect(r.reason).toBe('manual');
    expect(r.text).toContain(ascii);
  });

  it('метки кодовых страниц', () => {
    expect(codepageToLabel('ANSI_1251')).toBe('windows-1251');
    expect(codepageToLabel('dos866')).toBe('ibm866');
    expect(codepageToLabel('ANSI_1252')).toBe('windows-1252');
    expect(codepageToLabel('нечто')).toBeNull();
  });

  it('распознаёт DWG и бинарный DXF', () => {
    expect(isDwg(new Uint8Array([0x41, 0x43, 0x31, 0x30, 0x32, 0x37, 0, 0]))).toBe(true);
    expect(isDwg(new TextEncoder().encode('  0\nSECTION'))).toBe(false);
    expect(isBinaryDxf(new TextEncoder().encode('AutoCAD Binary DXF\r\n\x1a\0'))).toBe(true);
  });
});

describe('текст', () => {
  it('спецкоды %%', () => {
    expect(decodePercent('%%c50 %%p0,5 45%%d 100%%%')).toBe('Ø50 ±0,5 45° 100%');
    expect(decodePercent('%%u подчёркнутый %%u')).toBe(' подчёркнутый ');
  });
  it('юникод-экранирование \\U+XXXX', () => {
    expect(plainText('\\U+0416\\U+0443\\U+043a')).toBe('Жук');
  });
  it('MTEXT: переносы, шрифт, цвет, стопка', () => {
    expect(parseMText('{\\fArial|b0|i0;Строка 1}\\P{\\C1;красная}\\P\\S1/2; дюйма')).toEqual(['Строка 1', 'красная', '1/2 дюйма']);
    expect(parseMText('a\\\\b \\{x\\}')).toEqual(['a\\b {x}']);
  });
});

describe('геометрия', () => {
  it('bulge = 1 — полуокружность', () => {
    const a = bulgeArc(0, 0, 10, 0, 1)!;
    expect(a.r).toBeCloseTo(5);
    expect(a.cx).toBeCloseTo(5);
    expect(a.cy).toBeCloseTo(0);
    expect(a.t1 - a.t0).toBeCloseTo(Math.PI);
  });
  it('знак bulge: > 0 — дуга против часовой (от (0,0) к (10,0) уходит вниз), < 0 — по часовой (вверх)', () => {
    const midY = (b: number) => {
      const a = bulgeArc(0, 0, 10, 0, b)!;
      const t = (a.t0 + a.t1) / 2;
      return a.cy + a.r * Math.sin(t);
    };
    expect(midY(1)).toBeCloseTo(-5);
    expect(midY(-1)).toBeCloseTo(5);
    expect(midY(0.5)).toBeLessThan(0);
  });
  it('bulge = 0 — прямой отрезок (дуги нет)', () => {
    expect(bulgeArc(0, 0, 10, 0, 0)).toBeNull();
  });
  it('OCS: обычная нормаль — без преобразования, (0,0,-1) — отражение по X', () => {
    expect(ocsMatrix(0, 0, 1)).toBeNull();
    const m = ocsMatrix(0, 0, -1)!;
    expect(apply(m, 3, 4)).toEqual([-3, 4]);
  });
  it('композиция матриц: сначала поворот, потом перенос', () => {
    const [x, y] = apply(mul(translate(10, 0), rotate(Math.PI / 2)), 1, 0);
    expect(x).toBeCloseTo(10);
    expect(y).toBeCloseTo(1);
  });
  it('B-сплайн 2-й степени с тремя точками проходит через концы', () => {
    const pts = evalSpline(2, [0, 0, 0, 1, 1, 1], [0, 0, 5, 10, 10, 0], null, 10);
    expect(pts.slice(0, 2)).toEqual([0, 0]);
    expect(pts[pts.length - 2]).toBeCloseTo(10);
    expect(pts[pts.length - 1]).toBeCloseTo(0);
  });
  it('цвета ACI по таблице AutoCAD', () => {
    expect(aciToRgb(1)).toBe(0xff0000);
    expect(aciToRgb(10)).toBe(0xff0000);
    expect(aciToRgb(11)).toBe(0xff7f7f);
    expect(aciToRgb(12)).toBe(0xcc0000);
    expect(aciToRgb(30)).toBe(0xff7f00 & 0xffffff); // 30 — оранжевый
    expect(aciToRgb(250)).toBe(0x333333);
    expect(aciToRgb(255)).toBe(0xffffff);
  });
});

describe('разбор', () => {
  it('токенайзер переживает пустые строки и CRLF', () => {
    const g = tokenize('  0\r\nSECTION\r\n\r\n  2\r\nHEADER\r\n');
    expect(g.codes).toEqual([0, 2]);
    expect(g.vals).toEqual(['SECTION', 'HEADER']);
  });
  it('пустое значение группы не сбивает пары', () => {
    const g = tokenize('1\n\n10\n5\n');
    expect(g.codes).toEqual([1, 10]);
    expect(g.vals).toEqual(['', '5']);
  });
  it('не-DXF отвергается понятной ошибкой', () => {
    expect(() => parseDxf('hello world')).toThrow(DxfFormatError);
    expect(() => parseDxf('0\nFOO\n1\nbar\n2\nbaz\n3\nqux\n')).toThrow(DxfFormatError);
  });
  it('битый объект не роняет остальные', () => {
    const text = minimalDxf({ text: 'ok' });
    expect(buildScene(parseDxf(text)).texts).toHaveLength(1);
  });
});

describe('«Показать всё»', () => {
  it('одиночный далёкий объект не растягивает вид', () => {
    const lines = ['0', 'SECTION', '2', 'ENTITIES'];
    for (let i = 0; i < 40; i++) lines.push('0', 'LINE', '8', '0', '10', String(i * 10), '20', '0', '11', String(i * 10 + 5), '21', '5');
    lines.push('0', 'CIRCLE', '8', '0', '10', '500000', '20', '500000', '40', '2', '0', 'ENDSEC', '0', 'EOF');
    const scene = buildScene(parseDxf(lines.join('\n')));
    const fit = computeFit(scene)!;
    expect(fit.outliers).toBe(1);
    expect(fit.bounds.maxX).toBeLessThan(1000);
    expect(scene.bounds!.maxX).toBeGreaterThan(400000); // «честные» границы огромны
  });
  it('нормальный чертёж ничего не отсекает', () => {
    const lines = ['0', 'SECTION', '2', 'ENTITIES'];
    for (let i = 0; i < 40; i++) lines.push('0', 'LINE', '8', '0', '10', String(i * 10), '20', '0', '11', String(i * 10 + 5), '21', '5');
    lines.push('0', 'ENDSEC', '0', 'EOF');
    expect(computeFit(buildScene(parseDxf(lines.join('\n'))))!.outliers).toBe(0);
  });
});

describe('сцена', () => {
  const wrap = (body: string[]) => ['0', 'SECTION', '2', 'ENTITIES', ...body, '0', 'ENDSEC', '0', 'EOF'].join('\n');
  it('LWPOLYLINE с bulge даёт линии и дугу, замкнутая — без дублирования точек', () => {
    const sc = buildScene(parseDxf(wrap([
      '0', 'LWPOLYLINE', '8', '0', '90', '4', '70', '1',
      '10', '0', '20', '0', '10', '10', '20', '0', '10', '10', '20', '10', '42', '1', '10', '0', '20', '10',
    ])));
    const prims = sc.lines.flat();
    expect(prims.filter((p) => p.k === 1)).toHaveLength(1);
    expect(sc.bounds!.maxY).toBeCloseTo(15); // полуокружность над верхней стороной выпирает до y=15
    expect(sc.unsupported.size).toBe(0);
  });
  it('неизвестные объекты считаются по типам', () => {
    const sc = buildScene(parseDxf(wrap(['0', 'WIPEOUT', '8', '0', '0', 'IMAGE', '8', '0', '0', 'IMAGE', '8', '0'])));
    expect([...sc.unsupported]).toEqual([['WIPEOUT', 1], ['IMAGE', 2]]);
  });
  it('INSERT без блока и рекурсивный блок не падают, а попадают в список', () => {
    const text = ['0', 'SECTION', '2', 'BLOCKS',
      '0', 'BLOCK', '2', 'A', '10', '0', '20', '0', '0', 'INSERT', '2', 'A', '8', '0', '0', 'ENDBLK',
      '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
      '0', 'INSERT', '2', 'A', '8', '0', '0', 'INSERT', '2', 'НЕТ', '8', '0',
      '0', 'ENDSEC', '0', 'EOF'].join('\n');
    const sc = buildScene(parseDxf(text));
    expect(sc.unsupported.get('INSERT (рекурсия блока)')).toBe(1);
    expect(sc.unsupported.get('INSERT (нет блока «НЕТ»)')).toBe(1);
  });
  it('невидимые объекты (группа 60) не рисуются', () => {
    const sc = buildScene(parseDxf(wrap(['0', 'LINE', '8', '0', '60', '1', '10', '0', '20', '0', '11', '1', '21', '1'])));
    expect(sc.primCount).toBe(0);
  });
  it('цвет по блоку: объекты с цветом 0 берут цвет вставки', () => {
    const text = ['0', 'SECTION', '2', 'BLOCKS',
      '0', 'BLOCK', '2', 'B', '10', '0', '20', '0', '0', 'LINE', '8', '0', '62', '0', '10', '0', '20', '0', '11', '1', '21', '0', '0', 'ENDBLK',
      '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
      '0', 'INSERT', '2', 'B', '8', '0', '62', '1', '0', 'ENDSEC', '0', 'EOF'].join('\n');
    const sc = buildScene(parseDxf(text));
    expect(sc.styles[0].rgb).toBe(0xff0000);
  });
  it('объекты слоя 0 внутри блока наследуют слой вставки', () => {
    const text = ['0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER',
      '0', 'LAYER', '2', 'Стены', '62', '3', '70', '0', '0', 'ENDTAB', '0', 'ENDSEC',
      '0', 'SECTION', '2', 'BLOCKS',
      '0', 'BLOCK', '2', 'B', '10', '0', '20', '0', '0', 'LINE', '8', '0', '10', '0', '20', '0', '11', '1', '21', '0', '0', 'ENDBLK',
      '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
      '0', 'INSERT', '2', 'B', '8', 'Стены', '0', 'ENDSEC', '0', 'EOF'].join('\n');
    const sc = buildScene(parseDxf(text));
    const line = sc.lines.flat()[0];
    expect(sc.layers[line.layer].name).toBe('Стены');
    expect(sc.styles[line.style].rgb).toBe(0x00ff00);
  });
});
