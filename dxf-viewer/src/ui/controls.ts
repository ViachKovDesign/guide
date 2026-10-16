// Управление видом: колесо — зум к курсору, перетаскивание — панорама, щипок на телефоне — зум.

import type { Renderer } from '../render/renderer';

export interface ControlsHandlers {
  /** Короткий клик/тап без перетаскивания (экранные координаты внутри холста). */
  onTap?: (x: number, y: number, ev: PointerEvent) => void;
  /** Движение мыши над холстом. */
  onHover?: (x: number, y: number) => void;
  onLeave?: () => void;
}

export function attachControls(r: Renderer, el: HTMLElement, h: ControlsHandlers = {}) {
  const pointers = new Map<number, { x: number; y: number }>();
  let downAt: { x: number; y: number; id: number } | null = null;
  let moved = false;
  let pinch: { dist: number; mx: number; my: number } | null = null;

  const local = (e: { clientX: number; clientY: number }) => {
    const b = el.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };

  const pinchState = () => {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button > 1) return; // правая кнопка не двигает чертёж
    el.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      downAt = { ...p, id: e.pointerId };
      moved = false;
      el.classList.add('dragging');
    } else {
      moved = true; // два пальца — это жест, а не тап
      pinch = pinchState();
    }
    el.focus({ preventScroll: true });
  });

  el.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse') h.onHover?.(p.x, p.y);
      return;
    }
    const prev = pointers.get(e.pointerId)!;
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      if (downAt && !moved && Math.hypot(p.x - downAt.x, p.y - downAt.y) > 5) moved = true;
      if (moved) r.panBy(p.x - prev.x, p.y - prev.y);
      if (e.pointerType === 'mouse') h.onHover?.(p.x, p.y);
    } else if (pointers.size === 2 && pinch) {
      const now = pinchState();
      // сначала сдвиг центра жеста, потом зум относительно нового центра
      r.panBy(now.mx - pinch.mx, now.my - pinch.my);
      r.zoomAt(now.dist / pinch.dist, now.mx, now.my);
      pinch = now;
    }
  });

  const end = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    const wasTap = !moved && downAt && downAt.id === e.pointerId && e.type === 'pointerup';
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      el.classList.remove('dragging');
      if (wasTap) {
        const p = local(e);
        h.onTap?.(p.x, p.y, e);
      }
      downAt = null;
    } else if (pointers.size === 1) {
      // после жеста второй палец остаётся — продолжаем панорамировать им, но тапом это уже не станет
      moved = true;
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && pointers.size === 0) h.onLeave?.();
  });

  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const p = local(e);
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= 400;
      // щипок на тачпаде приходит как wheel с ctrlKey и маленькими шагами
      const k = e.ctrlKey ? 0.012 : 0.0018;
      r.zoomAt(Math.exp(-dy * k), p.x, p.y);
    },
    { passive: false },
  );

  el.addEventListener('keydown', (e) => {
    const cx = r.width / 2, cy = r.height / 2;
    switch (e.key) {
      case '0':
      case 'Home':
        r.fit();
        break;
      case '+':
      case '=':
        r.zoomAt(1.25, cx, cy);
        break;
      case '-':
      case '_':
        r.zoomAt(1 / 1.25, cx, cy);
        break;
      case 'ArrowLeft':
        r.panBy(60, 0);
        break;
      case 'ArrowRight':
        r.panBy(-60, 0);
        break;
      case 'ArrowUp':
        r.panBy(0, 60);
        break;
      case 'ArrowDown':
        r.panBy(0, -60);
        break;
      default:
        return;
    }
    e.preventDefault();
  });
}
