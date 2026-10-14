/* Студийные «снимки» моделей: отдельный рендерер, свет «ключ + контровой + заполняющий».
   Используется генератором tools/render-products.html (картинки каталога и мозаики). */
(function () {
  'use strict';
  var T = window.THREE;
  var Thumbs = window.Thumbs = {};
  var renderer, scene, cam, floor, key, rimL, hemi, group;

  function init() {
    var c = document.createElement('canvas');
    renderer = new T.WebGLRenderer({ canvas: c, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    scene = new T.Scene();
    var pm = new T.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new T.RoomEnvironment(), 0.04).texture;
    cam = new T.PerspectiveCamera(30, 1, 0.1, 80);
    floor = new T.Mesh(new T.CircleGeometry(40, 64), new T.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    key = new T.SpotLight('#ffdcae', 150, 0, 0.6, 0.8, 2); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03; key.shadow.radius = 6; scene.add(key, key.target);
    rimL = new T.DirectionalLight('#d9efe4', 0.9); scene.add(rimL);
    hemi = new T.HemisphereLight('#8a7155', '#1a120a', 0.45); scene.add(hemi);
  }
  function gradient(top, bottom) {
    var c = document.createElement('canvas'); c.width = 4; c.height = 256; var g = c.getContext('2d');
    var gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, top); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  }

  /* item: { w, h, build, az, el, fill, light, dx, dy } → dataURL (jpeg) */
  Thumbs.render = function (item) {
    if (!renderer) init();
    var W = item.w, H = item.h;
    renderer.setSize(W, H, false); cam.aspect = W / H; cam.updateProjectionMatrix();
    if (group) scene.remove(group);
    group = item.build(); scene.add(group); group.updateMatrixWorld(true);
    var box = new T.Box3().setFromObject(group), ctr = box.getCenter(new T.Vector3());
    var az = item.az === undefined ? 0.5 : item.az, el = item.el === undefined ? 0.22 : item.el, fill = item.fill || 0.8;
    var dir = new T.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    var corners = [], i, x, y, z;
    for (i = 0; i < 8; i++) { x = i & 1 ? box.max.x : box.min.x; y = i & 2 ? box.max.y : box.min.y; z = i & 4 ? box.max.z : box.min.z; corners.push(new T.Vector3(x, y, z)); }
    var d = 8;
    for (var it = 0; it < 5; it++) {
      cam.position.copy(ctr).addScaledVector(dir, d); cam.lookAt(ctr); cam.updateMatrixWorld(true);
      var mx = 0, my = 0;
      corners.forEach(function (c) { var p = c.clone().project(cam); mx = Math.max(mx, Math.abs(p.x)); my = Math.max(my, Math.abs(p.y)); });
      d = d * Math.max(mx, my) / fill;
    }
    cam.position.copy(ctr).addScaledVector(dir, d);
    var tx = ctr.clone(); tx.y += (item.dy || 0); tx.x += (item.dx || 0);
    cam.lookAt(tx);

    var light = !!item.light;
    scene.background = light ? gradient('#e9eee8', '#b7c0b5') : gradient('#1a1209', '#4d3824');
    floor.material.color.set(light ? '#aeb8ac' : '#2b1f13');
    key.position.set(ctr.x - 3.5, 6.5, ctr.z + 4.5); key.target.position.copy(ctr);
    key.intensity = light ? 120 : 150; key.color.set(light ? '#fff3e0' : '#ffdcae');
    rimL.position.set(ctr.x + 4, 3, ctr.z - 4); rimL.intensity = light ? 0.4 : 0.9;
    hemi.intensity = light ? 1.1 : 0.45; hemi.color.set(light ? '#ffffff' : '#8a7155');
    scene.environmentIntensity = light ? 0.9 : 0.45;
    renderer.toneMappingExposure = light ? 1.05 : 1.0;
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, cam);
    return renderer.domElement.toDataURL('image/jpeg', 0.88);
  };
})();
