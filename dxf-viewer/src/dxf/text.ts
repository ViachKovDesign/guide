// Очистка текста DXF: коды %%c, %%d, %%p, \U+XXXX и форматирование MTEXT.

const PERCENT: Record<string, string> = {
  c: 'Ø',
  d: '°',
  p: '±',
  '%': '%',
};

/** Спецкоды TEXT: %%c → Ø, %%d → °, %%p → ±, %%nnn → символ с кодом nnn; %%u/%%o (подчёркивание) отбрасываем. */
export function decodePercent(s: string): string {
  if (s.indexOf('%%') < 0) return s;
  return s.replace(/%%(?:([cCdDpP%])|([uUoOkK])|(\d{3}))/g, (_m, sym, tog, num) => {
    if (sym) return PERCENT[sym.toLowerCase()] ?? '';
    if (tog) return '';
    return String.fromCharCode(parseInt(num, 10));
  });
}

/** \U+0416 → Ж. Так AutoCAD записывает символы, которых нет в кодовой странице файла. */
export function decodeUnicodeEscapes(s: string): string {
  if (s.indexOf('\\U+') < 0 && s.indexOf('\\u+') < 0) return s;
  return s.replace(/\\[Uu]\+([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function plainText(s: string): string {
  return decodeUnicodeEscapes(decodePercent(s)).replace(/ /g, ' ');
}

const PARAM_CODES = new Set(['f', 'F', 'H', 'h', 'W', 'w', 'T', 't', 'Q', 'q', 'C', 'c', 'A', 'a', 'p']);
const FLAG_CODES = new Set(['L', 'l', 'O', 'o', 'K', 'k']);

/** MTEXT → список строк обычного текста (перенос по ширине колонки делает отрисовка). */
export function parseMText(raw: string): string[] {
  const s = decodeUnicodeEscapes(raw);
  const lines: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\') {
      const n = s[i + 1];
      if (n === undefined) break;
      if (n === 'P' || n === 'N') {
        lines.push(cur);
        cur = '';
        i++;
      } else if (n === '~') {
        cur += ' ';
        i++;
      } else if (n === '\\' || n === '{' || n === '}') {
        cur += n;
        i++;
      } else if (n === 'S') {
        // \S1/2; или \S+0.1^-0.1; — стопка
        const end = s.indexOf(';', i + 2);
        const body = end < 0 ? s.slice(i + 2) : s.slice(i + 2, end);
        cur += body.replace(/[\^#]/g, '/');
        i = end < 0 ? s.length : end;
      } else if (PARAM_CODES.has(n)) {
        const end = s.indexOf(';', i + 2);
        i = end < 0 ? s.length : end;
      } else if (FLAG_CODES.has(n)) {
        i++;
      } else {
        cur += n;
        i++;
      }
    } else if (ch === '{' || ch === '}') {
      // группировка форматирования — пропускаем
    } else if (ch === '\n') {
      lines.push(cur);
      cur = '';
    } else if (ch !== '\r') {
      cur += ch;
    }
  }
  lines.push(cur);
  return lines.map((l) => decodePercent(l));
}
