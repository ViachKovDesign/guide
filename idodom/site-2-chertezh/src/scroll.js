import Lenis from 'lenis';

/* Весь «вес» прокрутки — инерция Lenis; никакого параллакса по элементам. */
export const scroller = { lenis: null };
export const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initLenis() {
  if (scroller.lenis) return scroller.lenis;
  const lenis = new Lenis({ lerp: reduceMotion ? 1 : 0.1, smoothWheel: true, orientation: 'vertical', wheelMultiplier: 1 });
  scroller.lenis = lenis;
  const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  return lenis;
}
export const scrollNow = (y) => { const l = scroller.lenis; if (l) { l.resize(); l.scrollTo(y, { immediate: true, force: true }); } else scrollTo(0, y); };
export const currentScroll = () => (scroller.lenis ? scroller.lenis.scroll : scrollY);
export const stopScroll = () => scroller.lenis && scroller.lenis.stop();
export const startScroll = () => scroller.lenis && scroller.lenis.start();
