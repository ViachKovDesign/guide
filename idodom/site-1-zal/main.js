/* Сайт 1 «Зал» — сценарий прокрутки: камера по позам, пин-секции, раскрытие видео, каталог с разворотом карточек. */
(function () {
  'use strict';
  var P = window.IDODOM_PRODUCTS, CATS = window.IDODOM_CATS, ANG = window.IDODOM_ANGLES;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var mobile = function () { return window.matchMedia('(max-width:820px)').matches; };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('idodom:ready', function () {
    gsap.registerPlugin(ScrollTrigger, Flip);
    var Hall = window.Hall || {}, cs = Hall.cs || {}, poses = Hall.poses || {};
    if (!Hall.ok) document.documentElement.classList.add('no-webgl');
    document.documentElement.classList.add('is-loading');
    if (IDODOM.lenis) IDODOM.lenis.stop();
    scrollTo(0, 0);

    buildCatalog();
    var viewer = IDODOM.createViewer({ items: [], theme: 'dark', label: 'Карточка товара' });
    setupCatalog(viewer);
    intro(function () { setupScroll(Hall, cs, poses); });
  });

  /* ── Вступление: рамка логотипа дорисовывается, затем занавес уходит вверх ── */
  function intro(done) {
    var loader = $('#loader'), pct = $('#loaderPct'), hdr = $('#hdr');
    gsap.set(hdr, { opacity: 0, y: -16 });
    gsap.set('[data-hero-title] .line > span', { yPercent: 112 });
    gsap.set(['.hero__eyebrow', '.hero__foot > *'], { opacity: 0, y: 24 });
    var o = { v: 0 };
    var min = reduce ? 0.05 : 1.9;
    var fontsReady = (document.fonts && document.fonts.ready) || Promise.resolve();
    gsap.to(o, { v: 100, duration: min, ease: 'power1.inOut', onUpdate: function () { pct.textContent = Math.round(o.v); } });
    var minWait = new Promise(function (r) { setTimeout(r, min * 1000); });
    Promise.all([fontsReady, minWait]).then(function () {
      pct.textContent = '100';
      var tl = gsap.timeline({ onComplete: function () { loader.remove(); document.documentElement.classList.remove('is-loading'); if (IDODOM.lenis) IDODOM.lenis.start(); done(); } });
      tl.to(loader, { clipPath: 'inset(0 0 100% 0)', duration: reduce ? 0.01 : 1.1, ease: 'expo.inOut' })
        .to('[data-hero-title] .line > span', { yPercent: 0, duration: reduce ? 0.01 : 1.3, ease: 'expo.out', stagger: 0.1 }, '-=0.55')
        .to(['.hero__eyebrow', '.hero__foot > *'], { opacity: 1, y: 0, duration: reduce ? 0.01 : 0.9, ease: 'expo.out', stagger: 0.08 }, '-=0.9')
        .to(hdr, { opacity: 1, y: 0, duration: reduce ? 0.01 : 0.9, ease: 'expo.out' }, '-=0.9');
    });
  }

  /* ── Каталог: карточки из данных ── */
  var cards = [];
  function buildCatalog() {
    var track = $('#track');
    var order = ['soft', 'tables', 'chairs', 'figures'];
    var items = P.filter(function (p) { return p.catalog; }).sort(function (a, b) { return order.indexOf(a.cat) - order.indexOf(b.cat); });
    track.innerHTML = '';
    items.forEach(function (p) {
      var a = document.createElement('article');
      a.className = 'card'; a.dataset.cat = p.cat; a.dataset.id = p.id; a.tabIndex = 0; a.setAttribute('role', 'button');
      a.setAttribute('aria-label', 'Открыть: ' + p.name);
      a.innerHTML = (p.tag ? '<span class="card__tag">' + p.tag + '</span>' : '') +
        '<div class="card__img" data-cursor="Открыть" style="aspect-ratio:1/' + Math.min(1.3, Math.max(0.8, p.r)).toFixed(2) + '"><img src="' + p.img + '" alt="' + CATS[p.cat] + ' «' + p.name + '»" loading="lazy" decoding="async"></div>' +
        '<div class="card__meta"><span class="card__cat">' + CATS[p.cat] + '</span><h3 class="card__name">' + p.name + '</h3><p class="card__spec">' + p.size + ' · ' + p.material + '</p></div>';
      a.__p = p; track.appendChild(a); cards.push(a);
    });
  }
  function setupCatalog(viewer) {
    var track = $('#track'), bar = $('#trackBar'), current = 'all';
    function visible() { return cards.filter(function (c) { return !c.hidden; }); }
    function sync() {
      viewer.setItems(visible().map(function (c) {
        var p = c.__p;
        return { el: $('.card__img', c), kicker: CATS[p.cat] + ' · ' + p.year, title: p.name, text: p.text,
          specs: [['Размер', p.size], ['Материал', p.material], ['Год', p.year]],
          media: function () { return IDODOM.fitMedia(p); } };
      }));
    }
    function applyFilter(f, scroll) {
      current = f;
      $$('.pill').forEach(function (b) { b.classList.toggle('is-on', b.dataset.f === f); });
      var state = Flip.getState(cards);
      cards.forEach(function (c) { c.hidden = !(f === 'all' || c.dataset.cat === f); });
      track.scrollLeft = 0;
      Flip.from(state, { duration: reduce ? 0.01 : 0.95, ease: 'expo.inOut', stagger: 0.035, scale: false, onEnter: function (els) { return gsap.fromTo(els, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out', stagger: 0.05 }); } });
      sync(); updBar();
      if (scroll) IDODOM.scrollTo($('#catalog'), { offset: 0 });
    }
    $$('.pill').forEach(function (b) { b.addEventListener('click', function () { applyFilter(b.dataset.f); }); });
    $$('[data-filter]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); applyFilter(a.dataset.filter, true); }); });
    sync();

    cards.forEach(function (c) {
      function open() { var v = visible(), i = v.indexOf(c); if (i > -1) viewer.open(i); }
      c.addEventListener('click', function () { if (track.__moved) return; open(); });
      c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });

    // перетаскивание ленты мышью
    var down = false, sx = 0, sl = 0;
    track.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') return; down = true; track.__moved = false; sx = e.clientX; sl = track.scrollLeft; });
    addEventListener('pointermove', function (e) {
      if (!down) return; var dx = e.clientX - sx;
      if (Math.abs(dx) > 6) { track.__moved = true; track.classList.add('is-drag'); }
      track.scrollLeft = sl - dx;
    });
    addEventListener('pointerup', function () { if (!down) return; down = false; track.classList.remove('is-drag'); setTimeout(function () { track.__moved = false; }, 30); });
    function updBar() { var max = track.scrollWidth - track.clientWidth; bar.style.transform = 'scaleX(' + (max > 0 ? Math.max(0.12, track.scrollLeft / max) : 1) + ')'; }
    track.addEventListener('scroll', updBar, { passive: true }); addEventListener('resize', updBar); updBar();
    $('#trackNext').addEventListener('click', function () { track.scrollBy({ left: track.clientWidth * 0.7, behavior: 'smooth' }); });
    $('#trackPrev').addEventListener('click', function () { track.scrollBy({ left: -track.clientWidth * 0.7, behavior: 'smooth' }); });
  }

  /* ── Прокрутка ── */
  function setupScroll(Hall, cs, poses) {
    var M = mobile();
    // Камера ведётся функцией от прогресса секции: никаких твинов, которые перебивают друг друга.
    var KEYS = ['px', 'py', 'pz', 'lx', 'ly', 'lz'];
    function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
    function sample(frames, total, progress) {
      var t = progress * total, i = 0;
      while (i < frames.length - 2 && t > frames[i + 1][0]) i++;
      var a = frames[i], b = frames[i + 1], k = b[0] === a[0] ? 1 : Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])));
      k = ease(k);
      KEYS.forEach(function (key) { cs[key] = a[1][key] + (b[1][key] - a[1][key]) * k; });
    }

    // — Первый экран: камера слегка приближается
    var HERO = [[0, poses.hero], [1, poses.front]];
    ScrollTrigger.create({ trigger: '.hero', start: 'top top', end: 'bottom top', onUpdate: function (s) { sample(HERO, 1, s.progress); }, onLeave: function () { sample(HERO, 1, 1); }, onLeaveBack: function () { sample(HERO, 1, 0); } });
    gsap.to('.hero__copy', { yPercent: -18, opacity: 0, ease: 'none', scrollTrigger: { trigger: '.hero', start: '15% top', end: 'bottom top', scrub: true } });

    // — Ракурсы: камера обходит диван
    var T_ANG = [0, 1.2, 2.4, 3.6], TOTAL = 4.2, angleIdx = -1;
    var VF = [[0, poses.front], [0.4, poses.front], [1.2, poses.quarter], [1.6, poses.quarter], [2.4, poses.top], [2.8, poses.top], [3.6, poses.detail], [4.2, poses.detail]];
    var tlV = gsap.timeline({ scrollTrigger: { trigger: '.views', start: 'top top', end: M ? '+=300%' : '+=380%', pin: true, scrub: 0.5, anticipatePin: 1,
      onUpdate: function (self) {
        var t = self.progress * TOTAL, best = 0;
        T_ANG.forEach(function (a, i) { if (Math.abs(t - a) < Math.abs(t - T_ANG[best])) best = i; });
        setAngle(best); $('#angleBar').style.transform = 'scaleX(' + self.progress + ')';
        sample(VF, TOTAL, self.progress);
      },
      onLeave: function () { sample(VF, TOTAL, 1); }, onLeaveBack: function () { sample(VF, TOTAL, 0); },
      onToggle: function (self) { if (self.isActive) IDODOM.setActive('views'); else IDODOM.setActive([]); } } });
    tlV.to({}, { duration: TOTAL });
    var stViews = tlV.scrollTrigger;
    function setAngle(i) {
      if (i === angleIdx) return; angleIdx = i;
      var nm = $('#angleName'), tx = $('#angleText');
      gsap.fromTo(nm, { yPercent: 105 }, { yPercent: 0, duration: 0.8, ease: 'expo.out', overwrite: true });
      gsap.fromTo(tx, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.7, ease: 'expo.out', delay: 0.1, overwrite: true });
      nm.textContent = ANG[i].name; tx.textContent = ANG[i].text;
      $$('#angleList button').forEach(function (b) { b.classList.toggle('is-on', +b.dataset.angle === i); });
    }
    setAngle(0);
    $$('#angleList button').forEach(function (b) {
      b.addEventListener('click', function () { var i = +b.dataset.angle; IDODOM.scrollTo(stViews.start + (T_ANG[i] / TOTAL) * (stViews.end - stViews.start) + 2); });
    });

    // — Видео: рамка раскрывается на весь экран
    var video = $('#reelVideo'), frame = $('#reelFrame');
    gsap.fromTo(frame, { clipPath: M ? 'inset(18% 8% 30% 8% round 14px)' : 'inset(22% 30% 22% 30% round 18px)' }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none',
      scrollTrigger: { trigger: '.reel', start: 'top 85%', end: 'top top', scrub: 0.6 } });
    gsap.fromTo(video, { scale: 1.25 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.reel', start: 'top 85%', end: 'bottom bottom', scrub: 0.6 } });
    gsap.to('.reel__copy', { opacity: 1, y: 0, ease: 'power2.out', scrollTrigger: { trigger: '.reel', start: 'top 20%', end: 'top -10%', scrub: true } });
    gsap.set('.reel__title .mask > span', { yPercent: 105 });
    ScrollTrigger.create({ trigger: '.reel', start: 'top 10%', once: true, onEnter: function () { gsap.to('.reel__title .mask > span', { yPercent: 0, duration: 1.2, ease: 'expo.out' }); } });
    ScrollTrigger.create({ trigger: '.reel', start: 'top bottom', end: 'bottom top', onToggle: function (s) { if (reduce) return; if (s.isActive) video.play().catch(function () {}); else video.pause(); } });
    frame.addEventListener('click', function () { if (video.paused) video.play(); else video.pause(); });

    // — Разделы: полёт вдоль зала
    var STOPS = ['soft', 'tables', 'chairs', 'figures'], S_T = [0.9, 2.0, 3.1, 4.2], D = 4.7;
    var FF = [[0, poses.detail], [0.9, poses.soft], [1.3, poses.soft], [2.0, poses.tables], [2.4, poses.tables], [3.1, poses.chairs], [3.5, poses.chairs], [4.2, poses.figures], [4.7, poses.figures]];
    var tlF = gsap.timeline({ scrollTrigger: { trigger: '.flight', start: 'top top', end: M ? '+=380%' : '+=520%', pin: true, scrub: 0.5, anticipatePin: 1,
      onUpdate: function (self) {
        var t = self.progress * D, best = 0;
        S_T.forEach(function (s, i) { if (Math.abs(t - s) < Math.abs(t - S_T[best])) best = i; });
        setStop(best); sample(FF, D, self.progress);
      },
      onLeave: function () { sample(FF, D, 1); }, onLeaveBack: function () { sample(FF, D, 0); },
      onToggle: function (self) { if (!self.isActive) IDODOM.setActive([]); } } });
    tlF.to({}, { duration: D });
    var panels = $$('.panel');
    panels.forEach(function (p, i) {
      var kids = [$('.panel__title', p), $('.panel__text', p), $('.panel__more', p)];
      tlF.set(p, { visibility: 'visible' }, S_T[i] - 0.4);
      tlF.fromTo(kids, { opacity: 0, y: 46 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.07, ease: 'power3.out', immediateRender: false }, S_T[i] - 0.35);
      tlF.set(p, { opacity: 1 }, S_T[i] - 0.4);
      if (i < 3) { tlF.to(kids, { opacity: 0, y: -40, duration: 0.3, stagger: 0.03, ease: 'power2.in' }, S_T[i] + 0.38); tlF.set(p, { visibility: 'hidden' }, S_T[i] + 0.75); }
    });
    var stFlight = tlF.scrollTrigger, stopIdx = -1;
    function setStop(i) {
      if (i === stopIdx) return; stopIdx = i;
      var num = $('#flightNum'); gsap.fromTo(num, { yPercent: 90, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.6, ease: 'expo.out', overwrite: true });
      num.textContent = '0' + (i + 1);
      $$('#flightDots li').forEach(function (d, k) { d.classList.toggle('is-on', k === i); });
      if (stFlight && stFlight.isActive) IDODOM.setActive(['sections', STOPS[i]]);

    }
    setStop(0);

    // — Каталог закрывает зал: рендер на паузу
    if (Hall.setActive) {
      ScrollTrigger.create({ trigger: '.catalog', start: 'top top', onEnter: function () { Hall.setActive(false); }, onLeaveBack: function () { Hall.setActive(true); } });
      document.addEventListener('visibilitychange', function () { if (document.hidden) Hall.active = false; else if (window.scrollY < $('.catalog').offsetTop) Hall.active = true; });
    }

    // — О нас: слова проявляются по мере прокрутки
    var lead = $('#aboutLead'), words = lead.textContent.trim().split(/\s+/);
    lead.innerHTML = words.map(function (w) { return '<span class="w">' + w + '</span>'; }).join(' ');
    var ws = $$('.w', lead);
    gsap.to(ws, { opacity: 1, ease: 'none', stagger: 0.12, scrollTrigger: { trigger: lead, start: 'top 80%', end: 'bottom 45%', scrub: true } });
    gsap.from('.about__cols li', { opacity: 0, y: 50, duration: 1.1, ease: 'expo.out', stagger: 0.12, scrollTrigger: { trigger: '.about__cols', start: 'top 85%' } });

    // — Заголовки со слов
    $$('[data-words]').forEach(function (el) { IDODOM.revealWords(el); });
    gsap.from('.contacts__logo', { opacity: 0, y: 60, scale: 0.96, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: '.contacts', start: 'top 70%' } });

    // — Меню: куда ведут ссылки
    function toTime(st, t, total) { return st.start + (t / total) * (st.end - st.start); }
    IDODOM.targets = {
      views: function () { IDODOM.scrollTo(stViews.start + 2, { duration: 2.4 }); },
      sections: function () { IDODOM.scrollTo(stFlight.start + 2, { duration: 2.4 }); },
      soft: function () { IDODOM.scrollTo(toTime(stFlight, S_T[0] + 0.15, D), { duration: 2.4 }); },
      tables: function () { IDODOM.scrollTo(toTime(stFlight, S_T[1] + 0.15, D), { duration: 2.4 }); },
      chairs: function () { IDODOM.scrollTo(toTime(stFlight, S_T[2] + 0.15, D), { duration: 2.4 }); },
      figures: function () { IDODOM.scrollTo(toTime(stFlight, S_T[3] + 0.15, D), { duration: 2.4 }); },
      about: '#about', contacts: '#contacts', catalog: '#catalog'
    };
    ScrollTrigger.create({ trigger: '#about', start: 'top 60%', end: 'bottom 60%', onToggle: function (s) { if (s.isActive) IDODOM.setActive('about'); } });
    ScrollTrigger.create({ trigger: '#contacts', start: 'top 60%', onToggle: function (s) { if (s.isActive) IDODOM.setActive('contacts'); else IDODOM.setActive('about'); } });
    ScrollTrigger.refresh();
  }
})();
