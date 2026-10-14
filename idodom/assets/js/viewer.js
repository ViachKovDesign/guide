/* IDODOM — «разворачивающаяся карточка».
   Клик по карточке в ленте: её картинка вырастает до половины экрана, справа выезжает описание.
   Внутри можно листать соседние позиции (стрелки, клавиши ←/→, колесо, свайп).
   Закрытие сворачивает картинку обратно в карточку.

   IDODOM.createViewer({ items: [{ el, kicker, title, text, specs:[[k,v]], media: () => Node }], theme: 'dark'|'light' }) */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };

  function createViewer(opts) {
    var items = opts.items, cur = -1, busy = false, isOpen = false, lastFocus = null, wheelLock = 0;
    var D = function (v) { return reduce ? 0.01 : v; };

    var root = h('div', 'vw' + (opts.theme === 'light' ? ' vw--light' : ''));
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', opts.label || 'Карточка');
    root.hidden = true;
    root.innerHTML =
      '<div class="vw__veil"></div>' +
      '<div class="vw__media"><div class="vw__layers"></div><div class="vw__shade"></div></div>' +
      '<aside class="vw__panel"><div class="vw__panel-in">' +
        '<p class="vw__kicker"></p><h3 class="vw__title"></h3><p class="vw__text"></p>' +
        '<dl class="vw__specs"></dl>' +
        '<a class="btn vw__cta" href="#contacts" data-go="contacts"><span>Запросить расчёт</span><i class="btn__arr"></i></a>' +
      '</div></aside>' +
      '<div class="vw__bar">' +
        '<div class="vw__count" aria-live="polite"><span class="vw__cur">01</span><i></i><span class="vw__tot">' + pad(items.length) + '</span></div>' +
        '<div class="vw__nav"><button type="button" class="vw__btn vw__prev" aria-label="Предыдущая позиция"><i class="btn__arr" style="transform:scaleX(-1)"></i></button>' +
        '<button type="button" class="vw__btn vw__next" aria-label="Следующая позиция"><i class="btn__arr"></i></button></div>' +
        '<button type="button" class="vw__close"><span>Закрыть</span><i></i></button>' +
      '</div>';
    document.body.appendChild(root);

    var $ = function (s) { return root.querySelector(s); };
    var media = $('.vw__media'), layers = $('.vw__layers'), panel = $('.vw__panel'), panelIn = $('.vw__panel-in');
    var elKicker = $('.vw__kicker'), elTitle = $('.vw__title'), elText = $('.vw__text'), elSpecs = $('.vw__specs');
    var elCur = $('.vw__cur'), veil = $('.vw__veil'), bar = $('.vw__bar'), shade = $('.vw__shade');

    function targetRect() {
      var W = innerWidth, H = innerHeight;
      if (W <= 860) return { left: 0, top: 0, width: W, height: Math.round(H * 0.5) };
      return { left: 0, top: 0, width: Math.round(W * 0.6), height: H };
    }
    function fillPanel(it) {
      elKicker.textContent = it.kicker || '';
      elTitle.textContent = it.title || '';
      elText.textContent = it.text || '';
      elSpecs.innerHTML = (it.specs || []).map(function (s) { return '<div><dt>' + s[0] + '</dt><dd>' + s[1] + '</dd></div>'; }).join('');
    }
    function makeLayer(i) {
      var l = h('div', 'vw__layer'); var m = items[i].media(); l.appendChild(m); return l;
    }
    function panelTargets() { return [elKicker, elTitle, elText, elSpecs, $('.vw__cta')]; }
    function panelIntro(delay) {
      gsap.fromTo(panelTargets(), { y: 36, opacity: 0 }, { y: 0, opacity: 1, duration: D(0.9), ease: 'expo.out', stagger: 0.07, delay: delay || 0 });
    }

    function open(i, from) {
      if (isOpen || busy) return;
      isOpen = true; busy = true; cur = i; lastFocus = document.activeElement;
      var src = items[i].el, r = src.getBoundingClientRect(), t = targetRect();
      root.hidden = false; root.classList.add('is-open');
      if (window.IDODOM && IDODOM.lenis) IDODOM.lenis.stop();
      document.documentElement.style.overflow = 'hidden';
      layers.innerHTML = ''; layers.appendChild(makeLayer(i));
      fillPanel(items[i]); elCur.textContent = pad(i + 1);
      gsap.set(media, { left: r.left, top: r.top, width: r.width, height: r.height, borderRadius: getComputedStyle(src).borderRadius || 0 });
      gsap.set(panel, { clipPath: 'inset(0 0 0 100%)' });
      gsap.set(panelTargets(), { opacity: 0 });
      gsap.set(bar, { opacity: 0 }); gsap.set(shade, { opacity: 0 });
      gsap.set(veil, { opacity: 0 });
      src.style.visibility = 'hidden';
      var tl = gsap.timeline({ onComplete: function () { busy = false; $('.vw__close').focus({ preventScroll: true }); } });
      tl.to(veil, { opacity: 1, duration: D(0.5), ease: 'power2.out' }, 0)
        .to(media, { left: t.left, top: t.top, width: t.width, height: t.height, borderRadius: 0, duration: D(1.15), ease: 'expo.inOut' }, 0)
        .to(shade, { opacity: 1, duration: D(0.8) }, 0.5)
        .to(panel, { clipPath: 'inset(0 0 0 0%)', duration: D(0.95), ease: 'expo.inOut' }, 0.45)
        .add(function () { panelIntro(0); }, 0.95)
        .to(bar, { opacity: 1, duration: D(0.6) }, 1.0);
    }

    function go(dir) {
      if (!isOpen || busy) return;
      var n = (cur + dir + items.length) % items.length;
      busy = true;
      var old = layers.lastElementChild, nl = makeLayer(n);
      nl.style.clipPath = dir > 0 ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)';
      layers.appendChild(nl);
      var inner = nl.firstElementChild; gsap.set(inner, { scale: 1.16 });
      items[cur].el.style.visibility = ''; items[n].el.style.visibility = 'hidden';
      var tl = gsap.timeline({ onComplete: function () { old.remove(); cur = n; busy = false; } });
      tl.to(panelTargets(), { y: -24, opacity: 0, duration: D(0.35), ease: 'power2.in', stagger: 0.03 }, 0)
        .to(nl, { clipPath: 'inset(0 0 0 0%)', duration: D(1.0), ease: 'expo.inOut' }, 0)
        .to(inner, { scale: 1, duration: D(1.2), ease: 'expo.out' }, 0.1)
        .to(old.firstElementChild, { xPercent: dir > 0 ? -14 : 14, duration: D(1.0), ease: 'expo.inOut' }, 0)
        .add(function () { fillPanel(items[n]); elCur.textContent = pad(n + 1); panelIntro(0); }, 0.42);
      gsap.fromTo(elCur, { yPercent: dir > 0 ? 80 : -80, opacity: 0 }, { yPercent: 0, opacity: 1, duration: D(0.6), ease: 'expo.out', delay: 0.4 });
    }

    function close() {
      if (!isOpen || busy) return;
      busy = true;
      var src = items[cur].el, r = src.getBoundingClientRect();
      var visible = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
      if (!visible) { // карточка уехала из кадра — подтягиваем её, чтобы свернуться в неё
        if (window.IDODOM && IDODOM.lenis) IDODOM.lenis.scrollTo(src, { immediate: true, offset: -innerHeight * 0.25 }); else src.scrollIntoView({ block: 'center' });
        r = src.getBoundingClientRect();
      }
      var tl = gsap.timeline({ onComplete: function () {
        src.style.visibility = ''; root.hidden = true; root.classList.remove('is-open'); layers.innerHTML = '';
        document.documentElement.style.overflow = ''; if (window.IDODOM && IDODOM.lenis) IDODOM.lenis.start();
        isOpen = false; busy = false; if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
      } });
      tl.to(bar, { opacity: 0, duration: D(0.25) }, 0)
        .to(panelTargets(), { opacity: 0, y: 20, duration: D(0.3), stagger: 0.02 }, 0)
        .to(panel, { clipPath: 'inset(0 0 0 100%)', duration: D(0.8), ease: 'expo.inOut' }, 0.1)
        .to(shade, { opacity: 0, duration: D(0.4) }, 0)
        .to(media, { left: r.left, top: r.top, width: r.width, height: r.height, borderRadius: getComputedStyle(src).borderRadius || 0, duration: D(1.0), ease: 'expo.inOut' }, 0.2)
        .to(veil, { opacity: 0, duration: D(0.6) }, 0.5);
    }

    $('.vw__close').addEventListener('click', close);
    $('.vw__next').addEventListener('click', function () { go(1); });
    $('.vw__prev').addEventListener('click', function () { go(-1); });
    document.addEventListener('keydown', function (e) {
      if (!isOpen) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); go(-1); }
      else if (e.key === 'Tab') { // фокус не уходит за карточку
        var f = Array.prototype.slice.call(root.querySelectorAll('button,a[href]')).filter(function (n) { return n.offsetParent !== null; });
        if (!f.length) return; var a = f[0], b = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); } else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
      }
    });
    root.addEventListener('wheel', function (e) {
      if (!isOpen || e.target.closest('.vw__panel-in')) return;
      var now = Date.now(); if (now < wheelLock || Math.abs(e.deltaY) < 24) return; wheelLock = now + 1100; go(e.deltaY > 0 ? 1 : -1);
    }, { passive: true });
    var sx = null;
    root.addEventListener('pointerdown', function (e) { sx = e.target.closest('button,a') ? null : e.clientX; });
    root.addEventListener('pointerup', function (e) { if (sx == null) return; var dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 70) go(dx < 0 ? 1 : -1); });
    root.querySelector('.vw__cta').addEventListener('click', function () { close(); });
    addEventListener('resize', function () { if (isOpen && !busy) { var t = targetRect(); gsap.set(media, { left: t.left, top: t.top, width: t.width, height: t.height }); } });

    function setItems(next) { if (isOpen) return; items = next; $('.vw__tot').textContent = pad(items.length); }
    return { open: open, close: close, go: go, setItems: setItems, get isOpen() { return isOpen; }, el: root };
  }
  window.IDODOM = window.IDODOM || {};
  window.IDODOM.createViewer = createViewer;
  /* Картинка для вьювера: портретные — на весь кадр, широкие — вписываются поверх размытой копии (ничего не обрезается). */
  window.IDODOM.fitMedia = function (p) {
    function img() { var im = new Image(); im.src = p.img; im.alt = p.name; im.draggable = false; return im; }
    if (p.r >= 0.95) return img();
    var w = document.createElement('div'); w.className = 'vw__blur';
    var bg = img(); bg.alt = ''; bg.setAttribute('aria-hidden', 'true'); w.appendChild(bg); w.appendChild(img());
    return w;
  };
})();
