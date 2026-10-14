/* Список снимков: id, пропорция (высота/ширина), камера и свет. Файлы → assets/img/p/<id>.jpg */
(function () {
  var F = window.Furniture, T = window.THREE, BASE = 720;
  function group(list) { var g = new T.Group(); list.forEach(function (o) { g.add(o); }); return g; }
  var graphite = ['#2b2621', '#4a423a', '#6a6054', '#1b1713'];
  var S = [
    // — мягкая мебель
    { id: 'duga', r: 1.25, az: 0.55, el: 0.25, fill: 0.84, build: function () { return F.sofa({ color: '#a39580', accent: '#4a3424' }); } },
    { id: 'luna', r: 0.75, az: 0.2, el: 0.18, fill: 1.1, light: true, build: function () { return F.sofa({ color: '#8a5a36', accent: '#2d2118', radius: 1.7, span: 1.05 }); } },
    { id: 'modul', r: 1.0, az: -0.5, el: 0.2, fill: 1.25, build: function () { return F.sofa({ color: '#3b332b', accent: '#a39580', radius: 4.2, span: 0.5, cushion: '#a39580' }); } },
    { id: 'duga-graphite', r: 0.66, az: 0.0, el: 0.12, fill: 1.2, light: true, build: function () { return F.sofa({ color: '#2e2822', accent: '#a39580', cushion: '#a39580' }); } },
    { id: 'duga-detail', r: 1.45, az: 0.7, el: 0.35, fill: 2.2, dx: 0.9, dy: 0.1, build: function () { return F.sofa({ color: '#a39580', accent: '#4a3424' }); } },
    { id: 'duga-top', r: 0.85, az: 0, el: 1.25, fill: 1.0, light: true, build: function () { return F.sofa({ color: '#a39580', accent: '#4a3424' }); } },
    // — столы
    { id: 'iks', r: 0.7, az: 0.05, el: 0.12, fill: 0.92, build: function () { return F.table({ top: 'marble', seed: 5 }); } },
    { id: 'iks-3q', r: 1.1, az: 0.8, el: 0.3, fill: 0.92, light: true, build: function () { return F.table({ top: 'marble', seed: 5 }); } },
    { id: 'dub', r: 1.0, az: -0.6, el: 0.25, fill: 0.9, build: function () { return F.table({ top: 'wood', wood: '#5a3a1e', leg: 'brass', length: 2.2, width: 0.95 }); } },
    { id: 'kamen', r: 1.3, az: 0.4, el: 0.4, fill: 0.88, light: true, build: function () { return F.table({ top: 'stone', stone: '#bdb5a6', length: 1.4, width: 1.4, legColor: '#2a2118' }); } },
    // — стулья и кресла
    { id: 'nota', r: 1.3, az: 0.6, el: 0.15, fill: 0.82, light: true, build: function () { return F.chair({ kind: 'dining', color: '#a39580', wood: '#3b2614' }); } },
    { id: 'nota-dark', r: 1.15, az: -0.7, el: 0.18, fill: 0.82, build: function () { return F.chair({ kind: 'dining', color: '#2d2118', wood: '#16100a' }); } },
    { id: 'obhvat', r: 1.0, az: 0.5, el: 0.2, fill: 0.86, build: function () { return F.chair({ kind: 'lounge', color: '#a39580', wood: '#3b2614' }); } },
    { id: 'ruka', r: 1.45, az: 0.3, el: 0.1, fill: 0.8, light: true, build: function () { return F.chair({ kind: 'arm', color: '#2d2118', wood: '#4a3019' }); } },
    { id: 'trio', r: 0.62, az: 0.3, el: 0.25, fill: 0.9, build: function () {
      var a = F.chair({ kind: 'dining', color: '#a39580' }), b = F.chair({ kind: 'dining', color: '#2d2118', wood: '#16100a' }), c = F.chair({ kind: 'dining', color: '#8a5a36' });
      a.position.x = -0.8; b.position.x = 0; c.position.x = 0.8; a.rotation.y = 0.3; c.rotation.y = -0.3; return group([a, b, c]); } },
    { id: 'obhvat-brown', r: 0.85, az: -0.5, el: 0.2, fill: 0.86, light: true, build: function () { return F.chair({ kind: 'lounge', color: '#5a3a24', wood: '#2a1a0c' }); } },
    // — фигуры
    { id: 'gran', r: 1.0, az: 0.5, el: 0.3, fill: 0.86, build: function () { return F.figure({ seed: 9 }); } },
    { id: 'skala', r: 1.3, az: -0.3, el: 0.25, fill: 0.84, light: true, build: function () { return F.figure({ seed: 4, palette: graphite, stool: false }); } },
    { id: 'kristall', r: 0.85, az: 0.9, el: 0.2, fill: 0.86, build: function () { return F.figure({ seed: 21, detail: 0, palette: ['#e6dccb', '#6a4326', '#b07a45', '#2b1a0c'], stool: false }); } },
    { id: 'duo', r: 0.66, az: 0.2, el: 0.2, fill: 0.9, light: true, build: function () { return F.figure({ seed: 12 }); } },
    { id: 'gran-close', r: 1.45, az: 0.4, el: 0.45, fill: 1.9, dy: 0.15, build: function () { return F.figure({ seed: 9, stool: false }); } },
    { id: 'gran-top', r: 0.8, az: 0.2, el: 1.15, fill: 0.86, light: true, build: function () { return F.figure({ seed: 9 }); } },
    // — ракурсы дивана «Дуга» (страница «Ракурсы»)
    { id: 'ang-front', r: 0.75, az: 0.0, el: 0.1, fill: 1.15, build: function () { return F.sofa({ color: '#a39580', accent: '#4a3424' }); } },
    { id: 'ang-quarter', r: 1.2, az: 0.95, el: 0.28, fill: 0.92, build: function () { return F.sofa({ color: '#a39580', accent: '#4a3424' }); } },
    { id: 'ang-top', r: 1.0, az: 0, el: 1.3, fill: 1.0, build: function () { return F.sofa({ color: '#a39580', accent: '#4a3424' }); } },
    { id: 'ang-detail', r: 1.35, az: 0.9, el: 0.3, fill: 2.6, dx: 1.1, dy: 0.0, build: function () { return F.sofa({ color: '#a39580', accent: '#4a3424' }); } }
  ];
  window.SPECS = S.map(function (s) { return { id: s.id, w: BASE, h: Math.round(BASE * s.r) }; });
  window.renderSpec = function (i) { var s = S[i]; return window.Thumbs.render({ w: BASE, h: Math.round(BASE * s.r), build: s.build, az: s.az, el: s.el, fill: s.fill, light: s.light, dx: s.dx, dy: s.dy }); };
  window.RENDER_READY = true;
})();
