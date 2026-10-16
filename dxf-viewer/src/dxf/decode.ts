// Перевод байтов файла в строку. Старые DXF (до R2007, $ACADVER <= AC1018) пишут текст
// в кодовой странице из $DWGCODEPAGE (для русских чертежей — ANSI_1251). Новые — UTF-8.

export interface DecodeResult {
  text: string;
  /** Метка TextDecoder, которой раскодировали файл (utf-8, windows-1251, ...). */
  encoding: string;
  /** Значение $DWGCODEPAGE из файла, если есть. */
  codepage: string | null;
  /** Версия из $ACADVER, например AC1015. */
  version: string | null;
  /** Как выбрали кодировку — для подсказки в интерфейсе. */
  reason: 'utf8-version' | 'codepage' | 'utf8-valid' | 'fallback-1251' | 'manual';
}

/** $DWGCODEPAGE → метка TextDecoder. */
const CODEPAGES: Record<string, string> = {
  ANSI_1250: 'windows-1250',
  ANSI_1251: 'windows-1251',
  ANSI_1252: 'windows-1252',
  ANSI_1253: 'windows-1253',
  ANSI_1254: 'windows-1254',
  ANSI_1255: 'windows-1255',
  ANSI_1256: 'windows-1256',
  ANSI_1257: 'windows-1257',
  ANSI_1258: 'windows-1258',
  ANSI_874: 'windows-874',
  ANSI_932: 'shift_jis',
  ANSI_936: 'gbk',
  ANSI_949: 'euc-kr',
  ANSI_950: 'big5',
  DOS866: 'ibm866',
  DOS855: 'ibm855',
  DOS437: 'ibm437',
  DOS850: 'ibm850',
  DOS852: 'ibm852',
  MACINTOSH: 'macintosh',
  UTF8: 'utf-8',
  UTF_8: 'utf-8',
};

export function codepageToLabel(cp: string): string | null {
  const key = cp.trim().toUpperCase().replace(/[\s-]/g, '_');
  if (CODEPAGES[key]) return CODEPAGES[key];
  // «ANSI_1251», «CP1251», «1251», «cp866»
  const m = key.match(/(?:ANSI_|CP|DOS|WINDOWS_)?(\d{3,4})$/);
  if (m) {
    const n = m[1];
    if (CODEPAGES['ANSI_' + n]) return CODEPAGES['ANSI_' + n];
    if (CODEPAGES['DOS' + n]) return CODEPAGES['DOS' + n];
  }
  return null;
}

/** Ищем в начале файла «9 / $имя / код / значение» без полного разбора. Заголовок всегда ASCII. */
export function headerVar(ascii: string, name: string): string | null {
  const re = new RegExp('\\r?\\n\\s*9\\s*\\r?\\n' + name.replace('$', '\\$') + '\\s*\\r?\\n\\s*\\d+\\s*\\r?\\n([^\\r\\n]*)');
  const m = re.exec(ascii);
  return m ? m[1].trim() : null;
}

function tryUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function hasNonAscii(bytes: Uint8Array, limit = 4_000_000): boolean {
  const n = Math.min(bytes.length, limit);
  for (let i = 0; i < n; i++) if (bytes[i] >= 0x80) return true;
  return false;
}

function decodeWith(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder('windows-1251').decode(bytes);
  }
}

/** Бинарный DXF начинается с сигнатуры «AutoCAD Binary DXF». */
export function isBinaryDxf(bytes: Uint8Array): boolean {
  const sig = 'AutoCAD Binary DXF';
  if (bytes.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (bytes[i] !== sig.charCodeAt(i)) return false;
  return true;
}

/** DWG начинается с «AC10xx». */
export function isDwg(bytes: Uint8Array): boolean {
  return (
    bytes.length > 6 &&
    bytes[0] === 0x41 && bytes[1] === 0x43 && bytes[2] === 0x31 && bytes[3] === 0x30 && // "AC10"
    bytes[4] >= 0x30 && bytes[4] <= 0x39 && bytes[5] >= 0x30 && bytes[5] <= 0x39
  );
}

export function decodeDxf(buffer: ArrayBuffer, manualEncoding?: string): DecodeResult {
  const bytes = new Uint8Array(buffer);
  // Первые ~200 КБ хватает, чтобы прочитать HEADER (он в самом начале).
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 200_000)));
  const version = headerVar(head, '$ACADVER');
  const codepage = headerVar(head, '$DWGCODEPAGE');

  let start = 0;
  // BOM UTF-8
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3;
  const body = start ? bytes.subarray(start) : bytes;

  const done = (text: string, encoding: string, reason: DecodeResult['reason']): DecodeResult => ({
    text,
    encoding,
    codepage,
    version,
    reason,
  });

  if (manualEncoding && manualEncoding !== 'auto') {
    return done(decodeWith(body, manualEncoding), manualEncoding, 'manual');
  }

  // R2007+ (AC1021 и новее) — всегда UTF-8.
  const verNum = version ? parseInt(version.replace(/\D/g, ''), 10) : NaN;
  if (Number.isFinite(verNum) && verNum >= 1021) {
    return done(decodeWith(body, 'utf-8'), 'utf-8', 'utf8-version');
  }

  if (!hasNonAscii(body)) {
    return done(decodeWith(body, 'utf-8'), 'utf-8', 'utf8-valid');
  }

  // Некоторые программы пишут UTF-8 и в старой версии. Если файл — корректный UTF-8
  // с многобайтными символами, а не набор случайных байтов, это почти наверняка он.
  const asUtf8 = tryUtf8(body);
  const label = codepage ? codepageToLabel(codepage) : null;
  if (asUtf8 !== null && (!label || label === 'utf-8')) {
    return done(asUtf8, 'utf-8', 'utf8-valid');
  }
  if (label) {
    // Заявлена 1251, а файл при этом валидный UTF-8 с кириллицей — доверяем содержимому:
    // в 1251 два подряд идущих байта вида D0/D1 + 80..BF почти не встречаются в настоящем тексте.
    if (asUtf8 !== null && label === 'windows-1251' && /[Ѐ-ӿ]/.test(asUtf8)) {
      return done(asUtf8, 'utf-8', 'utf8-valid');
    }
    return done(decodeWith(body, label), label, 'codepage');
  }
  if (asUtf8 !== null) return done(asUtf8, 'utf-8', 'utf8-valid');
  // Кодовая страница не указана, файл не UTF-8: для русских чертежей это почти всегда 1251.
  return done(decodeWith(body, 'windows-1251'), 'windows-1251', 'fallback-1251');
}
