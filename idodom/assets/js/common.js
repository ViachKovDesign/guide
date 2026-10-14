/* IDODOM — общий каркас: логотип, шапка (слева разделы, по центру логотип, справа категории),
   мобильное меню, плавный скролл, курсор, магнитные кнопки, формы. */
(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var IDODOM = window.IDODOM = { reduce: reduce, targets: {}, lenis: null, tone: 'dark' };

  /* ── Логотип (воссоздан из исходника: слово, рамка и подпись HOME PRIORITY) ── */
  function logoSVG(variant) {
    var full = variant === 'full';
    var h = full ? 251 : 236;
    var frame = full ? 'M176 227H8V52H769V227H601' : 'M8 227H769V52H8Z';
    var tag = full ? '<text class="logo__tag" x="388.5" y="243" text-anchor="middle" font-size="42" textLength="290" lengthAdjust="spacing">HOME PRIORITY</text>' : '';
    return '<svg class="logo" viewBox="0 0 777 ' + h + '" role="img" aria-label="IDODOM — Home priority">' +
      '<path class="logo__frame" pathLength="1" d="' + frame + '"/>' +
      '<text class="logo__word" x="388.5" y="185" text-anchor="middle" font-size="218" textLength="584" lengthAdjust="spacingAndGlyphs">IDODOM</text>' +
      tag + '</svg>';
  }
  IDODOM.logoSVG = logoSVG;
  function injectLogos() {
    $$('[data-logo]').forEach(function (el) { el.innerHTML = logoSVG(el.getAttribute('data-logo')); });
  }

  /* ── Шапка ── */
  var LEFT = [['views', 'Ракурсы'], ['sections', 'Разделы'], ['about', 'О нас'], ['contacts', 'Контакты']];
  var RIGHT = [['soft', 'Мягкая мебель'], ['tables', 'Столы'], ['chairs', 'Стулья и кресла'], ['figures', 'Фигуры']];
  function links(list, cls) {
    return list.map(function (i) {
      return '<a class="lnk" href="#' + i[0] + '" data-go="' + i[0] + '" data-t="' + i[1] + '"><span>' + i[1] + '</span></a>';
    }).join('');
  }
  function buildHeader() {
    var host = $('#hdr');
    if (!host) return;
    host.className = 'hdr';
    host.setAttribute('data-tone', IDODOM.tone);
    host.innerHTML =
      '<nav class="hdr__nav hdr__nav--l" aria-label="Страница">' + links(LEFT) + '</nav>' +
      '<a class="hdr__logo" href="#top" data-go="top" aria-label="IDODOM — на главную" data-logo="mark"></a>' +
      '<nav class="hdr__nav hdr__nav--r" aria-label="Разделы каталога">' + links(RIGHT) + '</nav>' +
      '<button class="hdr__burger" type="button" aria-expanded="false" aria-controls="sheet"><span>Меню</span><i></i></button>';
    var sheet = document.createElement('div');
    sheet.className = 'sheet'; sheet.id = 'sheet';
    sheet.innerHTML =
      '<div class="sheet__cols"><div><h3>Страница</h3>' +
      LEFT.map(function (i) { return '<a href="#' + i[0] + '" data-go="' + i[0] + '">' + i[1] + '</a>'; }).join('') + '</div>' +
      '<div><h3>Каталог</h3>' +
      RIGHT.map(function (i) { return '<a href="#' + i[0] + '" data-go="' + i[0] + '">' + i[1] + '</a>'; }).join('') + '</div></div>';
    host.insertAdjacentElement('afterend', sheet);
    var burger = $('.hdr__burger', host);
    burger.addEventListener('click', function () { toggleMenu(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') toggleMenu(false); });
  }
  function toggleMenu(force) {
    var open = typeof force === 'boolean' ? force : !document.body.classList.contains('menu-open');
    document.body.classList.toggle('menu-open', open);
    var b = $('.hdr__burger'); if (b) { b.setAttribute('aria-expanded', open); b.firstChild.textContent = open ? 'Закрыть' : 'Меню'; }
    if (IDODOM.lenis) { open ? IDODOM.lenis.stop() : IDODOM.lenis.start(); }
  }

  /* переход по ссылкам меню: сайт сам решает, что делать (камера, лист, прокрутка) */
  IDODOM.go = function (key) {
    toggleMenu(false);
    var t = IDODOM.targets[key];
    if (typeof t === 'function') return t(key);
    var el = typeof t === 'string' ? $(t) : (t instanceof Element ? t : (key === 'top' ? null : document.getElementById(key)));
    if (key === 'top') return IDODOM.scrollTo(0);
    if (el) IDODOM.scrollTo(el);
  };
  IDODOM.scrollTo = function (target, opts) {
    opts = opts || {};
    if (IDODOM.lenis) IDODOM.lenis.scrollTo(target, { duration: reduce ? 0 : (opts.duration || 1.6), easing: function (t) { return 1 - Math.pow(1 - t, 4); }, offset: opts.offset || 0, immediate: reduce, lock: false });
    else window.scrollTo({ top: typeof target === 'number' ? target : target.getBoundingClientRect().top + scrollY + (opts.offset || 0) });
  };
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-go]');
    if (!a) return;
    e.preventDefault();
    IDODOM.go(a.getAttribute('data-go'));
  });
  IDODOM.setActive = function (keys) {
    keys = [].concat(keys || []);
    $$('.hdr .lnk').forEach(function (l) { l.classList.toggle('is-active', keys.indexOf(l.getAttribute('data-go')) > -1); });
  };

  /* ── Цвет шапки по секции под ней ── */
  function trackTone() {
    var hdr = $('#hdr'); if (!hdr) return;
    var ticking = false;
    function update() {
      ticking = false;
      var y = 28, els = document.elementsFromPoint(Math.round(innerWidth / 2), y), tone = null;
      for (var i = 0; i < els.length; i++) {
        var t = els[i].closest && els[i].closest('[data-tone]');
        if (t && t.id !== 'hdr') { tone = t.getAttribute('data-tone'); break; }
      }
      if (tone && tone !== IDODOM.tone) { IDODOM.tone = tone; hdr.setAttribute('data-tone', tone); }
      hdr.classList.toggle('is-solid', scrollY > 90);
    }
    function req() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
    addEventListener('scroll', req, { passive: true }); addEventListener('resize', req);
    update();
  }

  /* ── Плавный скролл ── */
  function initLenis() {
    if (reduce || typeof Lenis === 'undefined') return;
    var lenis = IDODOM.lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true });
    if (window.gsap && window.ScrollTrigger) {
      gsap.registerPlugin(ScrollTrigger);
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      gsap.ticker.lagSmoothing(0);
    } else {
      (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(0);
    }
  }

  /* ── Курсор ── */
  function initCursor() {
    if (!window.matchMedia('(hover:hover) and (pointer:fine)').matches) return;
    document.documentElement.classList.add('has-cursor');
    var cur = document.createElement('div');
    cur.className = 'cur'; cur.setAttribute('aria-hidden', 'true');
    cur.innerHTML = '<div class="cur__dot"></div><div class="cur__ring"><span></span></div>';
    document.body.appendChild(cur);
    var ring = $('.cur__ring', cur), lab = $('span', ring), dot = $('.cur__dot', cur);
    var x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y;
    addEventListener('mousemove', function (e) { x = e.clientX; y = e.clientY; }, { passive: true });
    (function loop() {
      rx += (x - rx) * 0.2; ry += (y - ry) * 0.2;
      dot.style.translate = x + 'px ' + y + 'px';
      ring.style.translate = rx + 'px ' + ry + 'px';
      requestAnimationFrame(loop);
    })();
    document.addEventListener('mouseover', function (e) {
      var l = e.target.closest && e.target.closest('[data-cursor]');
      var k = e.target.closest && e.target.closest('a,button,input,textarea,select,[data-hover]');
      cur.classList.toggle('is-label', !!l);
      cur.classList.toggle('is-link', !!k && !l);
      if (l) lab.textContent = l.getAttribute('data-cursor');
    });
    document.addEventListener('mouseleave', function () { cur.classList.remove('is-label', 'is-link'); });
  }

  /* ── Магнитные кнопки ── */
  function initMagnetic() {
    if (!window.gsap || !window.matchMedia('(hover:hover) and (pointer:fine)').matches || reduce) return;
    $$('[data-magnetic]').forEach(function (el) {
      var xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3' });
      var yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3' });
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * 0.28);
        yTo((e.clientY - (r.top + r.height / 2)) * 0.4);
      });
      el.addEventListener('mouseleave', function () { xTo(0); yTo(0); });
    });
  }

  /* ── Слова с маской: <h2 data-words>Текст</h2> → слова выезжают снизу ── */
  IDODOM.words = function (el) {
    if (el.__words) return el.__words;
    var walker = function (node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (w) {
            if (!w) return;
            if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(' ')); return; }
            var m = document.createElement('span'); m.className = 'mask';
            var s = document.createElement('span'); s.textContent = w; m.appendChild(s); frag.appendChild(m);
          });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1 && !n.classList.contains('mask')) walker(n);
      });
    };
    walker(el);
    el.__words = $$('.mask > span', el);
    return el.__words;
  };
  IDODOM.revealWords = function (el, vars) {
    var w = IDODOM.words(el);
    if (!window.gsap || reduce) { w.forEach(function (s) { s.style.transform = 'none'; }); return; }
    gsap.set(w, { yPercent: 110 });
    ScrollTrigger.create({
      trigger: el, start: 'top 86%', once: true,
      onEnter: function () { gsap.to(w, Object.assign({ yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: 0.045 }, vars || {})); }
    });
  };

  /* ── Формы (демо: сервера нет, поэтому только подтверждение на странице) ── */
  function initForms() {
    $$('[data-form]').forEach(function (f) {
      var status = $('[data-form-status]', f);
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!f.checkValidity()) { f.reportValidity(); return; }
        var name = (f.elements.name && f.elements.name.value || '').trim();
        if (status) status.textContent = 'Спасибо' + (name ? ', ' + name : '') + '. Заявка принята — мы ответим в течение рабочего дня.';
        f.classList.add('is-sent'); f.reset();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.documentElement.classList.remove('no-js');
    buildHeader(); injectLogos(); initLenis(); trackTone(); initCursor(); initMagnetic(); initForms();
    document.dispatchEvent(new CustomEvent('idodom:ready'));
  });
  IDODOM.toggleMenu = toggleMenu;
})();
