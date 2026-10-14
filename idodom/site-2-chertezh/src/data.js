/* Данные берутся из assets/js/products.js (общие для обоих сайтов) */
import { shuffleIndexes } from './layout.js';

const PRODUCTS = window.IDODOM_PRODUCTS || [];
export const CATS = window.IDODOM_CATS || {};
export const ANGLES = window.IDODOM_ANGLES || [];
export const CAT_KEYS = ['soft', 'tables', 'chairs', 'figures'];

// фиксированное перемешивание, чтобы разделы чередовались в коллаже
export const order = shuffleIndexes(PRODUCTS.length, 7);
export const products = order.map(i => PRODUCTS[i]);
export const byId = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));
export const counts = { all: PRODUCTS.length, ...Object.fromEntries(CAT_KEYS.map(c => [c, PRODUCTS.filter(p => p.cat === c).length])) };

export const EXTRA = {
  vein: { src: '../assets/img/marble-vein.jpg', r: 0.5625, name: 'Мрамор. Жила', cat: 'tables' },
  interior: { src: '../assets/img/table-interior-poster.jpg', r: 0.5625, name: 'Столовая', cat: 'tables' }
};

/* Следующий / предыдущий проект в «естественном» порядке каталога */
export function neighbour(id, dir) {
  const i = PRODUCTS.findIndex(p => p.id === id);
  return PRODUCTS[(i + dir + PRODUCTS.length) % PRODUCTS.length];
}

/* Набор кадров для галереи кейса: сам проект, соседи по разделу, затем кадры из других разделов */
export function galleryFor(p) {
  const same = PRODUCTS.filter(x => x.cat === p.cat && x.id !== p.id);
  const other = PRODUCTS.filter(x => x.cat !== p.cat && x.kind !== 'film');
  const list = (p.kind === 'film' ? [] : [p]).concat(same, other).slice(0, 7);
  return list.map(x => ({ src: x.img, r: x.r, name: x.name, id: x.id }));
}
