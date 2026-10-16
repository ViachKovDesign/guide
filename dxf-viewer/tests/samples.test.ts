import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeDxf } from '../src/dxf/decode';
import { parseDxf } from '../src/dxf/parse';
import { buildScene } from '../src/dxf/scene';

function load(name: string) {
  const buf = readFileSync(new URL(`../public/samples/${name}`, import.meta.url));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const dec = decodeDxf(ab);
  const doc = parseDxf(dec.text);
  return { dec, doc, scene: buildScene(doc) };
}

describe('detail-1251.dxf (R2000, Windows-1251)', () => {
  const { dec, doc, scene } = load('detail-1251.dxf');

  it('определяет кодировку по $DWGCODEPAGE', () => {
    expect(dec.codepage).toBe('ANSI_1251');
    expect(dec.encoding).toBe('windows-1251');
  });

  it('русские имена слоёв и блоков не превращаются в кракозябры', () => {
    expect([...doc.layers.keys()]).toEqual(expect.arrayContaining(['КОНТУР', 'ОСИ', 'РАЗМЕРЫ', 'ШТРИХОВКА', 'ТЕКСТ']));
    expect(doc.blocks.has('БОЛТ_М8')).toBe(true);
  });

  it('тексты читаются, спецсимволы %%c %%d раскрываются', () => {
    const all = scene.texts.map((t) => t.lines.join('\n')).join('\n');
    expect(all).toContain('Пластина ПЛ-01. Сталь Ст3');
    expect(all).toContain('Ёжик, щётка, ъ/ь, №5');
    expect(all).toContain('Отв. Ø50 ±0,5');
    expect(all).toContain('45°');
    expect(all).not.toMatch(/Ð|Ñ|Â|Ã/); // типичные кракозябры UTF-8, прочитанного как latin1
  });

  it('размеры рисуются из анонимных блоков, ничего не потеряно', () => {
    expect(scene.unsupported.size).toBe(0);
    expect(scene.fills.length).toBeGreaterThanOrEqual(2); // две штриховки
    // каждый из 5 размеров — отдельный объект, внутри которого линии, засечки и текст
    expect(scene.ents.filter((e) => e.type === 'DIMENSION')).toHaveLength(5);
    expect(scene.texts.some((t) => t.lines.join('').trim() === '300')).toBe(true);
  });

  it('граница чертежа конечна', () => {
    const b = scene.bounds!;
    expect(Number.isFinite(b.minX + b.maxX + b.minY + b.maxY)).toBe(true);
    expect(b.minX).toBeLessThan(0);
    expect(b.maxX).toBeGreaterThan(500);
  });

  it('единицы — миллиметры', () => {
    expect(scene.insunits).toBe(4);
  });
});

describe('roof-node-1251.dxf', () => {
  const { scene } = load('roof-node-1251.dxf');
  it('неподдерживаемое попадает в список, а не теряется', () => {
    expect(scene.unsupported.get('XLINE')).toBe(1);
    expect(scene.unsupported.get('RAY')).toBe(1);
    expect(scene.unsupported.get('MULTILEADER')).toBe(1);
  });
  it('штриховка с узором получила линии узора', () => {
    const patterned = scene.fills.filter((f) => f.pattern && f.pattern.length);
    expect(patterned.length).toBeGreaterThanOrEqual(2);
  });
  it('вложенные блоки раскрыты (шайба внутри анкера)', () => {
    // анкеров 5 (массив) + 1; в каждом шайба из 2 окружностей
    const arcs = scene.lines.flat().filter((p) => p.k === 1);
    expect(arcs.length).toBeGreaterThan(12);
  });
});

describe('facade-utf8-r2018.dxf', () => {
  const { dec, scene } = load('facade-utf8-r2018.dxf');
  it('UTF-8 для R2018', () => {
    expect(dec.encoding).toBe('utf-8');
    expect(dec.reason).toBe('utf8-version');
  });
  it('слой выключен, пространство листа не показывается', () => {
    const off = scene.layers.find((l) => l.name === 'Выключенный')!;
    expect(off.on).toBe(false);
    expect(scene.paperSpaceCount).toBeGreaterThan(0);
  });
  it('русский текст на месте', () => {
    expect(scene.texts.some((t) => t.lines.join(' ').includes('Фасад «Альфа»'))).toBe(true);
  });
});
