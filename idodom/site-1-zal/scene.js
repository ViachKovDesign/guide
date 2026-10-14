/* Сайт 1 «Зал» — WebGL-сцена: тёмный зал с порталами и четырьмя постаментами.
   Камера летит по заранее заданным позам, а позы двигает прокрутка (см. main.js). */
(function () {
  'use strict';
  var T = window.THREE, F = window.Furniture;
  var canvas = document.getElementById('gl');
  var small = matchMedia('(max-width:820px)').matches;
  var Hall = window.Hall = { active: true, ok: false };

  var renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: !small, powerPreference: 'high-performance' });
  } catch (e) { document.documentElement.classList.add('no-webgl'); return; }
  Hall.ok = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;           // сцена статична: тени считаем один раз
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  var BG = '#0f0a05';
  var scene = new T.Scene();
  scene.background = new T.Color(BG);
  scene.fog = new T.Fog(BG, 12, 46);

  var pm = new T.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new T.RoomEnvironment(), 0.05).texture;
  scene.environmentIntensity = 0.32;

  var cam = new T.PerspectiveCamera(36, 1, 0.1, 140);

  /* ── свет ── */
  scene.add(new T.HemisphereLight('#7a6246', '#0f0a05', 0.55));
  var rim = new T.DirectionalLight('#d7efe4', 0.55); rim.position.set(-5, 5, -2); scene.add(rim); scene.add(rim.target);

  /* ── зал: порталы-рамы, как в коридоре из референса ── */
  var concrete = new T.MeshStandardMaterial({ color: '#2f2820', roughness: 0.96, metalness: 0 });
  var portalGeo = {
    pillar: new T.BoxGeometry(1.25, 9.4, 1.25),
    lintel: new T.BoxGeometry(16.2, 1.25, 1.25)
  };
  for (var k = 0; k < 11; k++) {
    var z = 2.5 - k * 5;
    [-7.4, 7.4].forEach(function (x) { var p = new T.Mesh(portalGeo.pillar, concrete); p.position.set(x, 4.7, z); p.castShadow = p.receiveShadow = true; scene.add(p); });
    var l = new T.Mesh(portalGeo.lintel, concrete); l.position.set(0, 9.4, z); l.receiveShadow = true; scene.add(l);
  }
  // тёплый свет в конце зала: мягкий градиент, а не плоская коробка
  var glowTex = (function () { var c = document.createElement('canvas'); c.width = c.height = 256; var g = c.getContext('2d'); var gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, 'rgba(255,205,140,.95)'); gr.addColorStop(0.35, 'rgba(210,140,70,.35)'); gr.addColorStop(1, 'rgba(60,35,12,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; })();
  var endGlow = new T.Mesh(new T.PlaneGeometry(34, 22), new T.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, fog: false, opacity: 0.55 }));
  endGlow.position.set(0, 4.2, -56); scene.add(endGlow);

  /* ── пол: зеркало + затемняющая плёнка = глянцевый камень ── */
  var floorY = 0;
  if (!small) {
    var mirror = new T.Reflector(new T.PlaneGeometry(90, 120), { textureWidth: Math.round(innerWidth * 0.5), textureHeight: Math.round(innerHeight * 0.5), color: 0x4a3c2c, clipBias: 0.003 });
    mirror.rotation.x = -Math.PI / 2; mirror.position.set(0, floorY + 0.001, -25); scene.add(mirror);
    Hall.mirror = mirror;
  }
  var floor = new T.Mesh(new T.PlaneGeometry(90, 120), new T.MeshStandardMaterial({ color: '#1a130b', roughness: 0.6, metalness: 0.1, transparent: !small, opacity: small ? 1 : 0.8 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, floorY + 0.004, -25); floor.receiveShadow = true; scene.add(floor);

  /* ── четыре постамента ── */
  var warm = '#ffd9a6';
  var stages = [
    { key: 'soft', z: 0, w: 5.6, d: 4.6, h: 0.36 },
    { key: 'tables', z: -10, w: 4.2, d: 2.6, h: 0.3 },
    { key: 'chairs', z: -20, w: 5.2, d: 2.6, h: 0.3 },
    { key: 'figures', z: -30, w: 4.4, d: 3.4, h: 0.4 }
  ];
  var objs = {};
  objs.soft = F.sofa({ color: '#a39580', accent: '#4a3424' }); objs.soft.position.set(0, stages[0].h, -0.2);
  objs.tables = F.table({ top: 'marble', seed: 5 }); objs.tables.position.set(0, stages[1].h, 0);
  objs.chairs = new T.Group();
  var ch1 = F.chair({ kind: 'lounge', color: '#b3a691', wood: '#3b2614' }); ch1.position.set(-1.7, 0, 0.1); ch1.rotation.y = 0.35;
  var ch2 = F.chair({ kind: 'arm', color: '#2d2118', wood: '#4a3019' }); ch2.position.set(-0.3, 0, 0.2); ch2.rotation.y = 0.12; ch2.scale.setScalar(1.25);
  var ch3 = F.chair({ kind: 'dining', color: '#d6cdbd', wood: '#3b2614' }); ch3.position.set(0.95, 0, 0.1); ch3.rotation.y = -0.15; ch3.scale.setScalar(1.25);
  var ch4 = F.chair({ kind: 'dining', color: '#2d2118', wood: '#16100a' }); ch4.position.set(1.95, 0, 0.0); ch4.rotation.y = -0.4; ch4.scale.setScalar(1.25);
  objs.chairs.add(ch1, ch2, ch3, ch4); objs.chairs.position.y = stages[2].h;
  objs.figures = F.figure({ seed: 9 }); objs.figures.position.set(-0.3, stages[3].h, 0); objs.figures.scale.setScalar(1.25);

  var coneMat = function (h) {
    return new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false,
      uniforms: { uColor: { value: new T.Color(warm) }, uH: { value: h } },
      vertexShader: 'varying vec3 vN;varying vec3 vV;varying float vY;void main(){vY=position.y;vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'uniform vec3 uColor;uniform float uH;varying vec3 vN;varying vec3 vV;varying float vY;void main(){float f=pow(abs(dot(normalize(vN),normalize(vV))),1.7);float h=clamp((vY+uH*.5)/uH,0.,1.);float a=f*mix(.012,.12,h*h);gl_FragColor=vec4(uColor*a*2.2,a);}'
    });
  };

  stages.forEach(function (s) {
    var g = new T.Group(); g.position.z = s.z; scene.add(g);
    var plinth = F.plinth(s.w, s.d, s.h, '#aaa497'); g.add(plinth);
    var o = objs[s.key]; g.add(o);
    var spot = new T.SpotLight(warm, 165, 0, 0.46, 0.85, 2);
    spot.position.set(1.6, 8.4, s.z + 2.2); spot.target.position.set(0, 0.6, s.z); spot.castShadow = true;
    spot.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048); spot.shadow.bias = -0.0003; spot.shadow.normalBias = 0.03; spot.shadow.camera.near = 3; spot.shadow.camera.far = 16; spot.shadow.radius = 5;
    scene.add(spot, spot.target);
    var wash = new T.PointLight('#e8b878', 22, 15, 2); wash.position.set(0, 5.4, s.z - 1.6); scene.add(wash);
    // луч: узкий конец у источника света, широкий — на постаменте
    var from = spot.position.clone(), to = new T.Vector3(0, 0.3, s.z), dir = to.clone().sub(from), len = dir.length();
    var cone = new T.Mesh(new T.CylinderGeometry(0.16, 3.3, len, 40, 1, true), coneMat(len));
    cone.position.copy(from).add(to).multiplyScalar(0.5);
    cone.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), dir.normalize());
    scene.add(cone);
    s.group = g; s.obj = o;
  });
  Hall.stages = stages;

  /* ── пыль в лучах ── */
  var N = small ? 420 : 900, pos = new Float32Array(N * 3), seed = new Float32Array(N), r = 1;
  function rnd() { r = (r * 16807) % 2147483647; return r / 2147483647; }
  for (var i = 0; i < N; i++) {
    var st = stages[i % 4];
    pos[i * 3] = (rnd() - 0.5) * 9; pos[i * 3 + 1] = rnd() * 8; pos[i * 3 + 2] = st.z + (rnd() - 0.4) * 9; seed[i] = rnd();
  }
  var dg = new T.BufferGeometry(); dg.setAttribute('position', new T.BufferAttribute(pos, 3)); dg.setAttribute('aSeed', new T.BufferAttribute(seed, 1));
  var dustMat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: renderer.getPixelRatio() }, uColor: { value: new T.Color('#ffe2b8') } },
    vertexShader: 'attribute float aSeed;uniform float uTime;uniform float uPx;varying float vA;void main(){vec3 p=position;p.y+=sin(uTime*.2+aSeed*20.)*.4;p.x+=sin(uTime*.15+aSeed*31.)*.35;p.z+=cos(uTime*.12+aSeed*17.)*.35;vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=(1.4+aSeed*2.6)*uPx*(9./-mv.z);vA=.25+.6*fract(aSeed*7.);gl_Position=projectionMatrix*mv;}',
    fragmentShader: 'uniform vec3 uColor;varying float vA;void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,0.,d)*vA;gl_FragColor=vec4(uColor,a*.7);}'
  });
  var dust = new T.Points(dg, dustMat); dust.frustumCulled = false; scene.add(dust);

  /* ── камера: состояние двигает GSAP, здесь только применяем ── */
  var cs = Hall.cs = { px: 0, py: 1.5, pz: 8, lx: 0, ly: 0.95, lz: 0 };
  var mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  addEventListener('pointermove', function (e) { mouse.x = e.clientX / innerWidth - 0.5; mouse.y = e.clientY / innerHeight - 0.5; }, { passive: true });
  var tmp = new T.Vector3(), look = new T.Vector3(), zoomK = 1;

  Hall.poses = {
    hero: { px: 0.2, py: 1.5, pz: 8.4, lx: 0, ly: 0.95, lz: 0 },
    front: { px: 0, py: 1.25, pz: 6.6, lx: 0, ly: 0.72, lz: 0 },
    quarter: { px: 4.9, py: 1.9, pz: 4.4, lx: 0, ly: 0.65, lz: -0.3 },
    top: { px: 0.3, py: 7.6, pz: 2.8, lx: 0, ly: 0.2, lz: 0.4 },
    detail: { px: 1.9, py: 1.15, pz: 2.1, lx: 0.9, ly: 0.7, lz: -0.9 },
    soft: { px: -0.4, py: 1.7, pz: 9.2, lx: -3.1, ly: 0.8, lz: 0 },
    tables: { px: 1.6, py: 1.6, pz: -1.6, lx: 3.0, ly: 0.8, lz: -10 },
    chairs: { px: -1.2, py: 1.55, pz: -11.4, lx: -3.0, ly: 0.7, lz: -20 },
    figures: { px: 1.0, py: 1.7, pz: -21.2, lx: 3.0, ly: 0.85, lz: -30 }
  };
  Object.assign(cs, Hall.poses.hero);

  function resize() {
    var w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    cam.aspect = w / h; cam.fov = w / h < 0.85 ? 52 : 36; cam.updateProjectionMatrix();
    zoomK = w / h < 1 ? 1 + (1 - w / h) * 1.15 : 1;
    if (Hall.mirror) Hall.mirror.getRenderTarget().setSize(Math.round(w * 0.5 * renderer.getPixelRatio()), Math.round(h * 0.5 * renderer.getPixelRatio()));
    renderer.shadowMap.needsUpdate = true;
    Hall.draw();
  }
  Hall.draw = function (t) {
    mouse.sx += (mouse.x - mouse.sx) * 0.05; mouse.sy += (mouse.y - mouse.sy) * 0.05;
    look.set(cs.lx, cs.ly, cs.lz);
    tmp.set(cs.px, cs.py, cs.pz).sub(look).multiplyScalar(zoomK).add(look);
    cam.position.set(tmp.x + mouse.sx * 0.7, tmp.y - mouse.sy * 0.35, tmp.z);
    cam.lookAt(look);
    rim.position.set(cs.px - 5, 5, cs.pz - 2); rim.target.position.set(cs.lx, 0.8, cs.lz);
    dustMat.uniforms.uTime.value = (t || 0) / 1000;
    renderer.render(scene, cam);
  };
  var raf;
  function loop(t) { raf = requestAnimationFrame(loop); if (Hall.active) Hall.draw(t); }
  Hall.start = function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); };
  Hall.setActive = function (v) { Hall.active = v; canvas.style.visibility = v ? 'visible' : 'hidden'; };
  addEventListener('resize', resize);
  resize(); Hall.start();
  Hall.renderer = renderer; Hall.scene = scene; Hall.cam = cam;
})();
