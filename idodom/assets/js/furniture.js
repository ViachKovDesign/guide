/* IDODOM — процедурные модели мебели для Three.js (диван, стол, стулья/кресла, полигональные фигуры).
   Все материалы и текстуры рисуются кодом, поэтому сайт не зависит от внешних картинок. */
(function () {
  'use strict';
  var T = window.THREE;
  var F = window.Furniture = {};

  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function canvasTex(w, h, draw, opts) {
    opts = opts || {};
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
    if (opts.srgb !== false) t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  /* ── текстуры ── */
  var cache = {};
  function grainTex() {
    return cache.grain || (cache.grain = canvasTex(256, 256, function (g, w, h) {
      var r = rng(7), img = g.createImageData(w, h);
      for (var i = 0; i < img.data.length; i += 4) { var v = 128 + (r() - 0.5) * 110; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
      g.putImageData(img, 0, 0);
    }, { repeat: [8, 8], srgb: false }));
  }
  function concreteTex() {
    return cache.conc || (cache.conc = canvasTex(512, 512, function (g, w, h) {
      var r = rng(11); g.fillStyle = '#c4beb2'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 1400; i++) { g.fillStyle = 'rgba(' + (r() > 0.5 ? '255,250,240' : '40,32,22') + ',' + (0.008 + r() * 0.018) + ')'; var s = 3 + r() * 30; g.beginPath(); g.arc(r() * w, r() * h, s, 0, 6.3); g.fill(); }
      for (var j = 0; j < 400; j++) { g.fillStyle = 'rgba(30,24,16,' + (0.03 + r() * 0.05) + ')'; g.fillRect(r() * w, r() * h, 1 + r() * 1.4, 1 + r() * 1.4); }
    }, { repeat: [2, 2] }));
  }
  function woodTex(base) {
    var k = 'wood' + base;
    return cache[k] || (cache[k] = canvasTex(512, 512, function (g, w, h) {
      var r = rng(23); g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 340; i++) {
        var x = r() * w, lw = 0.6 + r() * 4, a = 0.03 + r() * 0.11, dark = r() > 0.4;
        g.strokeStyle = dark ? 'rgba(20,10,2,' + a + ')' : 'rgba(255,220,170,' + a * 0.6 + ')'; g.lineWidth = lw; g.beginPath();
        for (var y = 0; y <= h; y += 16) { var xx = x + Math.sin(y * 0.02 + i) * 3 + Math.sin(y * 0.005 + i * 2) * 7; y ? g.lineTo(xx, y) : g.moveTo(xx, y); }
        g.stroke();
      }
    }, { repeat: [1, 1] }));
  }
  function marbleTex(seed) {
    var k = 'marble' + (seed || 1);
    return cache[k] || (cache[k] = canvasTex(1024, 1024, function (g, w, h) {
      var r = rng(seed || 5);
      g.fillStyle = '#0a0806'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 46; i++) { var gr = g.createRadialGradient(r() * w, r() * h, 0, r() * w, r() * h, 120 + r() * 340); gr.addColorStop(0, 'rgba(70,60,48,' + (0.05 + r() * 0.1) + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
      function vein(x, y, ang, len, wid, depth) {
        g.beginPath(); g.moveTo(x, y);
        var px = x, py = y;
        for (var s = 0; s < len; s++) {
          ang += (r() - 0.5) * 0.55; px += Math.cos(ang) * (5 + r() * 9); py += Math.sin(ang) * (5 + r() * 9); g.lineTo(px, py);
          if (depth < 3 && r() < 0.035) vein2.push([px, py, ang + (r() > 0.5 ? 1 : -1) * (0.5 + r() * 0.8), len * 0.45, wid * 0.6, depth + 1]);
        }
        g.lineWidth = wid * 2.4; g.stroke();
      }
      var vein2 = [];
      [[0.8, 'rgba(226,178,96,0.9)', 14], [2.6, 'rgba(226,178,96,0.16)', 22]].forEach(function (pass) {
        var rr = rng(seed || 5);
        for (var v = 0; v < 11; v++) {
          g.strokeStyle = pass[1]; g.shadowColor = 'rgba(240,190,100,.85)'; g.shadowBlur = pass[2]; g.lineCap = 'round';
          var sx = rr() * w, sy = rr() > 0.5 ? 0 : h * rr();
          vein2 = []; r = rr; vein(sx, sy, 0.8 + rr() * 1.6, 70 + rr() * 90, pass[0] * (0.6 + rr()), 0);
          for (var q = 0; q < vein2.length && q < 40; q++) vein.apply(null, vein2[q]);
        }
      });
      g.shadowBlur = 0;
    }, { repeat: [0.38, 0.38] }));
  }

  /* ── материалы ── */
  var M = F.mat = {};
  M.fabric = function (hex) {
    var c = new T.Color(hex), sh = c.clone().lerp(new T.Color('#ffffff'), 0.35);
    return new T.MeshPhysicalMaterial({ color: c, roughness: 0.94, metalness: 0, sheen: 1, sheenRoughness: 0.55, sheenColor: sh, bumpMap: grainTex(), bumpScale: 0.9 });
  };
  M.wood = function (hex) { return new T.MeshStandardMaterial({ color: '#ffffff', map: woodTex(hex || '#4a3019'), roughness: 0.5, metalness: 0 }); };
  M.marble = function (seed) { return new T.MeshPhysicalMaterial({ color: '#ffffff', map: marbleTex(seed), roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.6 }); };
  M.stone = function (hex) { return new T.MeshStandardMaterial({ color: hex || '#cfc8bb', map: concreteTex(), roughness: 0.88, metalness: 0 }); };
  M.dark = function (hex) { return new T.MeshStandardMaterial({ color: hex || '#17110a', roughness: 0.55, metalness: 0.2 }); };
  M.brass = function () { return new T.MeshStandardMaterial({ color: '#b98c52', roughness: 0.28, metalness: 1 }); };
  F.textures = { concrete: concreteTex, marble: marbleTex, wood: woodTex, grain: grainTex };

  function shadow(o) { o.traverse(function (m) { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; }

  /* кольцевой сектор: центр кривизны в начале координат, дуга уходит в -Z, выдавливание — вверх по Y */
  function sector(rIn, rOut, a0, a1, depth, bevel, steps) {
    steps = steps || 28;
    var s = new T.Shape(), i, a;
    for (i = 0; i <= steps; i++) { a = a0 + (a1 - a0) * i / steps; var x = rOut * Math.sin(a), y = rOut * Math.cos(a); i ? s.lineTo(x, y) : s.moveTo(x, y); }
    for (i = steps; i >= 0; i--) { a = a0 + (a1 - a0) * i / steps; s.lineTo(rIn * Math.sin(a), rIn * Math.cos(a)); }
    s.closePath();
    var g = new T.ExtrudeGeometry(s, { depth: depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, steps: 1, curveSegments: 6 });
    g.rotateX(-Math.PI / 2); g.translate(0, bevel, 0);
    return T.toCreasedNormals(g, 0.7);
  }
  function rrect(w, d, r) {
    var s = new T.Shape(), x = -w / 2, y = -d / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
    s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }

  /* ── Мягкая мебель: изогнутый модульный диван + пуф ── */
  F.sofa = function (o) {
    o = o || {};
    var col = o.color || '#d6cdbd', R = o.radius || 2.35, span = o.span || 0.82, g = new T.Group();
    var fab = M.fabric(col), dark = M.dark('#120c06');
    var n = 3, gap = 0.014;
    for (var i = 0; i < n; i++) {
      var a0 = -span + (2 * span) * i / n + gap, a1 = -span + (2 * span) * (i + 1) / n - gap;
      var seat = new T.Mesh(sector(R - 0.5, R + 0.46, a0, a1, 0.2, 0.085), fab); seat.position.set(0, 0.17, R); g.add(seat);
      var back = new T.Mesh(sector(R + 0.3, R + 0.68, a0 + 0.015, a1 - 0.015, 0.3, 0.1), fab); back.position.set(0, 0.4, R); g.add(back);
    }
    var base = new T.Mesh(sector(R - 0.34, R + 0.4, -span + 0.12, span - 0.12, 0.05, 0.03), dark); base.position.set(0, 0.0, R); g.add(base);
    // пуф
    var pr = [[0, 0], [0.4, 0], [0.45, 0.04], [0.47, 0.2], [0.44, 0.36], [0.38, 0.41], [0, 0.42]].map(function (p) { return new T.Vector2(p[0], p[1]); });
    var pouf = new T.Mesh(new T.LatheGeometry(pr, 40), M.fabric(o.accent || col)); pouf.position.set(0.9, 0.05, 1.45); pouf.scale.set(1, 1, 1); g.add(pouf);
    var cush = new T.Mesh(new T.RoundedBoxGeometry(0.5, 0.45, 0.16, 5, 0.07), M.fabric(o.cushion || '#4a3424')); cush.position.set(-0.78, 0.8, -0.28); cush.rotation.set(-0.22, 0.32, 0.04); g.add(cush);
    g.userData.height = 1.0;
    return shadow(g);
  };

  /* ── Столы: мраморная/деревянная столешница на X-образном основании ── */
  F.table = function (o) {
    o = o || {};
    var len = o.length || 2.7, wid = o.width || 1.1, g = new T.Group();
    var topMat = o.top === 'wood' ? M.wood(o.wood || '#4d321a') : (o.top === 'stone' ? M.stone(o.stone || '#bdb5a6') : M.marble(o.seed || 5));
    var legMat = o.leg === 'brass' ? M.brass() : M.dark(o.legColor || '#16100a');
    var tg = new T.ExtrudeGeometry(rrect(len, wid, 0.16), { depth: 0.045, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 10 });
    tg.rotateX(-Math.PI / 2); tg = T.toCreasedNormals(tg, 0.7);
    var top = new T.Mesh(tg, topMat); top.position.y = 0.7; g.add(top);
    function leg(sign, z) {
      var pts = [[-0.96, 0.69], [-0.6, 0.5], [-0.2, 0.28], [0.2, 0.11], [0.52, 0.045], [0.82, 0.04]].map(function (p) { return new T.Vector3(sign * p[0] * len / 2.7, p[1], z); });
      var curve = new T.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
      var m = new T.Mesh(new T.TubeGeometry(curve, 64, 0.05, 14, false), legMat); g.add(m);
      var cap = new T.Mesh(new T.SphereGeometry(0.05, 14, 10), legMat); cap.position.copy(pts[0]); g.add(cap);
      var cap2 = cap.clone(); cap2.position.copy(pts[pts.length - 1]); g.add(cap2);
    }
    var zs = [-wid * 0.26, wid * 0.26];
    zs.forEach(function (z) { leg(1, z); leg(-1, z); });
    var bar = new T.Mesh(new T.CylinderGeometry(0.034, 0.034, wid * 0.52 + 0.06, 12), legMat); bar.rotation.x = Math.PI / 2; bar.position.set(0, 0.275, 0); g.add(bar);
    g.userData.height = 0.78;
    return shadow(g);
  };

  /* ── Стулья и кресла ── */
  F.chair = function (o) {
    o = o || {};
    var kind = o.kind || 'dining', g = new T.Group();
    var fab = M.fabric(o.color || '#d6cdbd'), wood = M.wood(o.wood || '#3b2614');
    if (kind === 'lounge') {
      var seat = new T.Mesh(new T.RoundedBoxGeometry(0.92, 0.22, 0.86, 6, 0.1), fab); seat.position.set(0, 0.42, 0.02); g.add(seat);
      var back = new T.Mesh(sector(0.4, 0.58, -0.98, 0.98, 0.36, 0.09), fab); back.position.set(0, 0.5, 0.36); back.scale.set(1.12, 1, 1); g.add(back);
      [[-0.38, -0.34], [0.38, -0.34], [-0.38, 0.38], [0.38, 0.38]].forEach(function (p) {
        var l = new T.Mesh(new T.CylinderGeometry(0.028, 0.02, 0.34, 12), wood); l.position.set(p[0], 0.17, p[1]); l.rotation.z = -p[0] * 0.25; l.rotation.x = p[1] * 0.2; g.add(l);
      });
    } else {
      var s2 = new T.Mesh(new T.RoundedBoxGeometry(0.5, 0.075, 0.5, 4, 0.03), fab); s2.position.set(0, 0.45, 0); g.add(s2);
      var b2 = new T.Mesh(sector(0.215, 0.275, -0.95, 0.95, 0.34, 0.03), kind === 'arm' ? fab : wood); b2.position.set(0, 0.55, 0.06); g.add(b2);
      [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].forEach(function (p) {
        var l = new T.Mesh(new T.CylinderGeometry(0.022, 0.012, 0.46, 12), wood); l.position.set(p[0] * 1.08, 0.22, p[1] * 1.08); l.rotation.z = -p[0] * 0.3; l.rotation.x = p[1] * 0.3; g.add(l);
      });
      if (kind === 'arm') { [-1, 1].forEach(function (s) { var a = new T.Mesh(new T.CylinderGeometry(0.016, 0.016, 0.36, 8), wood); a.rotation.x = Math.PI / 2; a.position.set(s * 0.27, 0.66, -0.03); g.add(a); }); }
    }
    return shadow(g);
  };

  /* ── Фигуры: полигональная мебель (огранённые объёмы) ── */
  F.figure = function (o) {
    o = o || {};
    var pal = (o.palette || ['#e6dccb', '#3a2616', '#c9bda8', '#6a4326']).map(function (h) { return new T.Color(h); });
    var r = rng(o.seed || 9), g = new T.Group();
    var geo = new T.IcosahedronGeometry(1, o.detail === undefined ? 1 : o.detail);
    var pos = geo.attributes.position, v = new T.Vector3(), k = {};
    for (var i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); var key = v.x.toFixed(3) + v.y.toFixed(3) + v.z.toFixed(3);
      if (!k[key]) k[key] = 1 + (r() - 0.5) * 0.3;
      v.multiplyScalar(k[key]); v.x *= 1.2; v.y *= 0.9; v.y = Math.max(v.y, -0.74);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo = geo.toNonIndexed(); geo.computeVertexNormals();
    var cols = new Float32Array(geo.attributes.position.count * 3), n = new T.Vector3();
    for (var f = 0; f < geo.attributes.position.count; f += 3) {
      n.fromBufferAttribute(geo.attributes.normal, f);
      var h = r(), c = pal[h < 0.34 ? 0 : h < 0.58 ? 1 : h < 0.8 ? 2 : 3];
      if (n.y < -0.5) c = pal[1];
      for (var q = 0; q < 3; q++) { cols[(f + q) * 3] = c.r; cols[(f + q) * 3 + 1] = c.g; cols[(f + q) * 3 + 2] = c.b; }
    }
    geo.setAttribute('color', new T.BufferAttribute(cols, 3));
    var mat = new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.62, metalness: 0.05 });
    var m = new T.Mesh(geo, mat); m.position.y = 0.74 * (o.scale || 0.62); m.scale.setScalar(o.scale || 0.62); g.add(m);
    // малый табурет-октаэдр
    var og = new T.OctahedronGeometry(0.42, 0).toNonIndexed(); og.scale(1, 0.8, 1); og.computeVertexNormals();
    var oc = new Float32Array(og.attributes.position.count * 3);
    for (var j = 0; j < og.attributes.position.count; j += 3) { var cc = pal[(j / 3) % 4 === 0 ? 1 : (j / 3) % 3 === 0 ? 3 : 0]; for (var w = 0; w < 3; w++) { oc[(j + w) * 3] = cc.r; oc[(j + w) * 3 + 1] = cc.g; oc[(j + w) * 3 + 2] = cc.b; } }
    og.setAttribute('color', new T.BufferAttribute(oc, 3));
    var stool = new T.Mesh(og, mat); stool.position.set(1.25, 0.34, 0.55); stool.rotation.y = 0.5; if (o.stool !== false) g.add(stool);
    return shadow(g);
  };

  /* ── Постамент ── */
  F.plinth = function (w, d, h, hex) {
    var m = new T.Mesh(new T.RoundedBoxGeometry(w, h, d, 3, 0.03), M.stone(hex || '#cdc6b8'));
    m.position.y = h / 2; m.castShadow = true; m.receiveShadow = true; return m;
  };
})();
