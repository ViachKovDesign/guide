import '@fontsource/roboto-condensed/latin-400.css';
import '@fontsource/roboto-condensed/cyrillic-400.css';
import './style.css';

import { decodeDxf, isBinaryDxf, isDwg } from './dxf/decode';
import { DxfFormatError, parseDxf } from './dxf/parse';
import { buildScene, type Scene } from './dxf/scene';
import { resolveUnits } from './dxf/units';
import { FONT_FAMILY, Renderer } from './render/renderer';
import type { Theme } from './render/theme';
import { attachControls } from './ui/controls';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('cv');
const stage = $('stage');
const welcome = $('welcome');
const dropOverlay = $('drop-overlay');
const busy = $('busy');
const busyText = $('busy-text');
const toast = $('toast');
const fileInput = $<HTMLInputElement>('file-input');
const btnFit = $<HTMLButtonElement>('btn-fit');
const zoomTools = $('zoom-tools');
const stFile = $('st-file');
const stCoords = $('st-coords');
const stUnits = $('st-units');
const stEncWrap = $('st-enc-wrap');
const stEnc = $<HTMLSelectElement>('st-enc');
const stUnrendered = $<HTMLButtonElement>('st-unrendered');
const pop = $('unrendered-pop');

const renderer = new Renderer(canvas);

// ---------- тема ----------

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}
function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem('theme', t);
  } catch {
    /* приватный режим — не страшно */
  }
  renderer.setTheme(t);
}
$('btn-theme').addEventListener('click', () => applyTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
renderer.theme = currentTheme();

// ---------- холст ----------

new ResizeObserver(() => renderer.resize()).observe(stage);
renderer.resize();

let units = resolveUnits(0);
attachControls(renderer, canvas, {
  onHover(x, y) {
    if (!renderer.scene) return;
    const w = renderer.screenToWorld(x, y);
    stCoords.textContent = `X ${fmt(w.x)}   Y ${fmt(w.y)}`;
  },
  onLeave() {
    stCoords.textContent = '';
  },
});

function fmt(v: number): string {
  const a = Math.abs(v);
  const d = a >= 1000 ? 1 : a >= 10 ? 2 : 3;
  return v.toFixed(d);
}

btnFit.addEventListener('click', () => renderer.fit());
$('zoom-in').addEventListener('click', () => renderer.zoomAt(1.4, renderer.width / 2, renderer.height / 2));
$('zoom-out').addEventListener('click', () => renderer.zoomAt(1 / 1.4, renderer.width / 2, renderer.height / 2));

// ---------- сообщения ----------

let toastTimer = 0;
function showToast(title: string, text: string, error = false) {
  toast.className = 'toast' + (error ? ' error' : '');
  toast.replaceChildren();
  const close = document.createElement('button');
  close.className = 'toast-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Закрыть');
  close.textContent = '×';
  close.addEventListener('click', () => (toast.hidden = true));
  const b = document.createElement('b');
  b.textContent = title;
  const p = document.createElement('div');
  p.textContent = text;
  toast.append(close, b, p);
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.hidden = true), error ? 14000 : 6000);
}

function setBusy(on: boolean, text = 'Читаю чертёж…') {
  busy.hidden = !on;
  busyText.textContent = text;
}

const nextPaint = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

// ---------- загрузка файла ----------

let lastBuffer: ArrayBuffer | null = null;
let lastName = '';

async function openBuffer(buf: ArrayBuffer, name: string, encoding?: string) {
  setBusy(true);
  await nextPaint();
  try {
    const bytes = new Uint8Array(buf);
    if (isDwg(bytes) || /\.dwg$/i.test(name)) {
      showToast(
        'Файл DWG не поддерживается',
        'Сохраните чертёж из AutoCAD как DXF: «Файл → Сохранить как» и выберите тип файла «AutoCAD DXF».',
        true,
      );
      return;
    }
    if (isBinaryDxf(bytes)) {
      showToast(
        'Бинарный DXF не поддерживается',
        'Сохраните чертёж как обычный (текстовый) DXF. В AutoCAD это тип файла «AutoCAD 2018 DXF» без пометки «binary».',
        true,
      );
      return;
    }

    const t0 = performance.now();
    const dec = decodeDxf(buf, encoding);
    const doc = parseDxf(dec.text);
    const scene = buildScene(doc);
    const ms = Math.round(performance.now() - t0);

    lastBuffer = buf;
    lastName = name;
    units = resolveUnits(scene.insunits);
    renderer.setScene(scene);
    welcome.hidden = true;
    btnFit.disabled = false;
    zoomTools.hidden = false;
    canvas.focus({ preventScroll: true });
    updateStatus(name, scene, dec.encoding, dec.reason, ms);

    if (scene.primCount === 0) {
      showToast('Чертёж пустой', 'В файле нет объектов, которые можно показать.', true);
    } else if (renderer.outliers > 0) {
      showToast(
        'Есть далёкие объекты',
        `${renderer.outliers} объект(ов) лежат далеко от основного чертежа, «Показать всё» их не учитывает.`,
      );
    }
  } catch (e) {
    console.error(e);
    const msg = e instanceof DxfFormatError ? e.message : 'Не получилось прочитать файл. Он повреждён или это не DXF.';
    showToast('Не удалось открыть чертёж', msg, true);
  } finally {
    setBusy(false);
  }
}

async function openFile(file: File) {
  const buf = await file.arrayBuffer();
  stEnc.value = 'auto';
  await openBuffer(buf, file.name);
}

async function openSample(name: string) {
  setBusy(true, 'Загружаю пример…');
  try {
    const res = await fetch(`./samples/${name}`);
    if (!res.ok) throw new Error(String(res.status));
    const buf = await res.arrayBuffer();
    stEnc.value = 'auto';
    await openBuffer(buf, name);
  } catch {
    setBusy(false);
    showToast('Пример не загрузился', 'Проверьте соединение и попробуйте ещё раз.', true);
  }
}

// ---------- строка состояния ----------

const REASONS: Record<string, string> = {
  'utf8-version': 'по версии файла',
  codepage: 'по $DWGCODEPAGE',
  'utf8-valid': 'определена по содержимому',
  'fallback-1251': 'кодовая страница не указана, принята 1251',
  manual: 'выбрана вручную',
};

function updateStatus(name: string, scene: Scene, encoding: string, reason: string, ms: number) {
  stFile.textContent = name;
  stFile.title = name;
  const objects = scene.ents.length;
  stUnits.textContent = `${objects.toLocaleString('ru-RU')} объектов · ${units.label} · ${ms} мс`;
  stEncWrap.hidden = false;
  stEncWrap.title = `Кодировка: ${encoding} (${REASONS[reason] ?? reason})`;
  if (stEnc.value === 'auto') {
    // показываем, что выбрано автоматически, в подсказке
    stEnc.options[0].textContent = `Авто (${encoding})`;
  }

  let unsupported = 0;
  for (const n of scene.unsupported.values()) unsupported += n;
  stUnrendered.hidden = false;
  stUnrendered.classList.toggle('warn', unsupported > 0);
  stUnrendered.textContent = unsupported > 0 ? `не отрисовано: ${unsupported.toLocaleString('ru-RU')} объектов` : '✓ всё отрисовано';
  pop.hidden = true;
  stUnrendered.setAttribute('aria-expanded', 'false');
  renderUnrendered(scene);
}

function renderUnrendered(scene: Scene) {
  pop.replaceChildren();
  const h = document.createElement('h3');
  h.textContent = 'Что не отрисовано';
  pop.append(h);
  const rows = [...scene.unsupported.entries()].sort((a, b) => b[1] - a[1]);
  if (rows.length) {
    const table = document.createElement('table');
    for (const [type, n] of rows) {
      const tr = table.insertRow();
      tr.insertCell().textContent = type;
      tr.insertCell().textContent = n.toLocaleString('ru-RU');
    }
    pop.append(table);
  } else {
    const p = document.createElement('p');
    p.textContent = 'Все объекты модели отрисованы.';
    pop.append(p);
  }
  if (scene.paperSpaceCount > 0) {
    const p = document.createElement('p');
    p.textContent = `Ещё ${scene.paperSpaceCount} объектов лежат на листах (вкладки Layout) — показывается только пространство модели.`;
    pop.append(p);
  }
}

stUnrendered.addEventListener('click', () => {
  pop.hidden = !pop.hidden;
  stUnrendered.setAttribute('aria-expanded', String(!pop.hidden));
});
document.addEventListener('pointerdown', (e) => {
  if (!pop.hidden && !pop.contains(e.target as Node) && e.target !== stUnrendered) {
    pop.hidden = true;
    stUnrendered.setAttribute('aria-expanded', 'false');
  }
});

stEnc.addEventListener('change', () => {
  if (lastBuffer) void openBuffer(lastBuffer, lastName, stEnc.value);
});

// ---------- открытие: кнопка, перетаскивание, примеры ----------

$('btn-open').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) void openFile(f);
  fileInput.value = ''; // чтобы тот же файл можно было открыть повторно
});
document.querySelectorAll<HTMLButtonElement>('[data-sample]').forEach((b) =>
  b.addEventListener('click', () => void openSample(b.dataset.sample!)),
);

let dragDepth = 0;
const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  dropOverlay.hidden = false;
});
window.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
});
window.addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropOverlay.hidden = true;
});
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  dropOverlay.hidden = true;
  const f = e.dataTransfer?.files?.[0];
  if (f) void openFile(f);
});

// ---------- шрифт с кириллицей ----------

// Пока шрифт не загружен, текст на холсте рисуется запасным. Дожидаемся и перерисовываем.
void Promise.all([
  document.fonts.load(`100px ${FONT_FAMILY}`, 'АаЯя'),
  document.fonts.load(`100px ${FONT_FAMILY}`, 'Aa°Ø'),
]).then(() => {
  renderer.refreshText();
});

// Для автотестов и отладки из консоли.
(window as unknown as { __viewer: unknown }).__viewer = { renderer, openBuffer };
