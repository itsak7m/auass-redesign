// Lunar craters explorer: crater list + details (always), and a WebGL Moon
// (when available) built on NASA's LRO colour map. Without WebGL, the flat
// map with pins stays visible and drives the same details panel.
import * as THREE from '../vendor/three.module.min.js';

const root = document.querySelector('[data-moon]');
if (root) init();

function init() {
  root.classList.add('is-js');
  const DATA = JSON.parse(document.getElementById('moon-data').textContent);
  const byId = Object.fromEntries(DATA.craters.map((c) => [c.id, c]));
  const isAr = document.documentElement.lang === 'ar';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = root) => r.querySelector(s);
  const $$ = (s, r = root) => [...r.querySelectorAll(s)];

  const intro = $('[data-intro]');
  const details = Object.fromEntries($$('[data-detail]').map((el) => [el.dataset.detail, el]));
  const buttons = $$('.crater-btn');
  const list = $('[data-list]');
  let globe = null;
  let current = null;

  function select(id, { fly = true } = {}) {
    if (!byId[id]) return;
    current = id;
    intro.hidden = true;
    Object.entries(details).forEach(([k, el]) => el.classList.toggle('is-on', k === id));
    buttons.forEach((b) => b.toggleAttribute('aria-current', b.dataset.crater === id));
    $$('.map-pin').forEach((p) => p.classList.toggle('is-on', p.dataset.crater === id));
    const btn = buttons.find((b) => b.dataset.crater === id);
    if (btn) {
      const lr = list.getBoundingClientRect(), br = btn.getBoundingClientRect();
      if (br.top < lr.top || br.bottom > lr.bottom) list.scrollTop += br.top - lr.top - 8;
    }
    history.replaceState(null, '', '#' + id);
    if (globe) globe.select(id, fly);
  }

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-crater]');
    if (!a) return;
    e.preventDefault();
    select(a.dataset.crater);
    // On narrow screens the list sits below the Moon; scroll back up so the fly-to is visible.
    if (matchMedia('(max-width: 900px)').matches) $('[data-stage]').scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  });

  // Search + near/far filter
  const q = $('[data-q]');
  const sides = $('[data-sides]');
  let side = '';
  const norm = (s) => s.toLowerCase().replace(/[ً-ْ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
  function filter() {
    const v = norm(q.value.trim());
    buttons.forEach((b) => {
      const okSide = !side || (side === 'near' ? b.dataset.side !== 'far' : b.dataset.side === side);
      b.parentElement.hidden = !(okSide && (!v || norm(b.dataset.text).includes(v)));
    });
  }
  q.addEventListener('input', filter);
  sides.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    side = b.dataset.value;
    $$('.chip', sides).forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    filter();
  });

  globe = createGlobe({ DATA, byId, isAr, reduce, onPick: (id) => select(id) });
  const fromHash = decodeURIComponent(location.hash.slice(1));
  if (byId[fromHash]) select(fromHash, { fly: true });
}

function createGlobe({ DATA, byId, isAr, reduce, onPick }) {
  const stage = root.querySelector('[data-stage]');
  const canvas = root.querySelector('[data-canvas]');
  const label = root.querySelector('[data-label]');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    return null; // keep the flat map
  }
  const DEG = Math.PI / 180;
  const R_MOON_KM = 1737.4;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  scene.add(camera);
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(-1.6, 1.0, 2.2);
  camera.add(sun); // light follows the viewer so the visible face is always lit
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));

  // Globe: group carries yaw/pitch; the mesh is turned so longitude 0 faces the camera.
  const globe = new THREE.Group();
  scene.add(globe);
  const moonMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, color: 0xffffff });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), moonMat);
  moon.rotation.y = -Math.PI / 2;
  globe.add(moon);

  const local = (lat, lon, r = 1) => {
    const phi = ((lon + 180) / 360) * Math.PI * 2, th = lat * DEG;
    return new THREE.Vector3(-Math.cos(phi) * Math.cos(th) * r, Math.sin(th) * r, Math.sin(phi) * Math.cos(th) * r);
  };

  // Brass graticule every 30°, like the engraved grid of an astrolabe.
  const gpts = [];
  const seg = (a, b) => gpts.push(a.x, a.y, a.z, b.x, b.y, b.z);
  for (let lat = -60; lat <= 60; lat += 30) for (let lon = -180; lon < 180; lon += 4) seg(local(lat, lon, 1.003), local(lat, lon + 4, 1.003));
  for (let lon = -180; lon < 180; lon += 30) for (let lat = -88; lat < 88; lat += 4) seg(local(lat, lon, 1.003), local(lat + 4, lon, 1.003));
  const ggeo = new THREE.BufferGeometry();
  ggeo.setAttribute('position', new THREE.Float32BufferAttribute(gpts, 3));
  moon.add(new THREE.LineSegments(ggeo, new THREE.LineBasicMaterial({ color: 0xc9a063, transparent: true, opacity: 0.16 })));

  // Crater markers: a brass ring sized to the crater (with a minimum) and a larger invisible hit disc.
  const BRASS = new THREE.Color(0xc9a063), BRIGHT = new THREE.Color(0xffe2a8);
  const markers = {};
  const hits = [];
  const Z = new THREE.Vector3(0, 0, 1);
  DATA.craters.forEach((c) => {
    const n = local(c.lat, c.lon).normalize();
    const outer = Math.max((c.diam / 2) / R_MOON_KM, 0.02);
    const ring = new THREE.Mesh(new THREE.RingGeometry(outer - 0.0065, outer, 64), new THREE.MeshBasicMaterial({ color: BRASS, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0055, 16), new THREE.MeshBasicMaterial({ color: BRASS, side: THREE.DoubleSide }));
    const hit = new THREE.Mesh(new THREE.CircleGeometry(Math.max(outer * 1.2, 0.055), 16), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
    const g = new THREE.Group();
    g.add(ring, dot, hit);
    g.position.copy(n.clone().multiplyScalar(1.004));
    g.quaternion.setFromUnitVectors(Z, n);
    hit.userData.id = c.id;
    moon.add(g);
    markers[c.id] = { g, ring, dot, n };
    hits.push(hit);
  });

  // View state
  let yaw = 0, pitch = 0, dist = 4.4;
  let tYaw = null, tPitch = null, tDist = null;
  let vYaw = 0.0, auto = !reduce, selected = null, hovered = null;
  const MIN_D = 1.45, MAX_D = 6;
  const clampP = (p) => Math.max(-1.45, Math.min(1.45, p));

  function select(id, fly) {
    selected = id;
    auto = false;
    Object.entries(markers).forEach(([k, m]) => {
      const on = k === id;
      m.ring.material.color.copy(on ? BRIGHT : BRASS);
      m.dot.material.color.copy(on ? BRIGHT : BRASS);
      m.g.scale.setScalar(on ? 1.25 : 1);
    });
    if (!fly) return;
    const c = byId[id];
    let ty = -c.lon * DEG;
    while (ty - yaw > Math.PI) ty -= Math.PI * 2;
    while (ty - yaw < -Math.PI) ty += Math.PI * 2;
    tYaw = ty;
    tPitch = clampP(c.lat * DEG);
    tDist = Math.max(1.75, Math.min(2.7, 1.55 + c.diam / 90));
    if (reduce) { yaw = tYaw; pitch = tPitch; dist = tDist; tYaw = tPitch = tDist = null; }
  }

  // Size
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  // Picking
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(x, y) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects([moon, ...hits], false)[0];
    return hit && hit.object.userData.id ? hit.object.userData.id : null;
  }

  // Pointer: drag to rotate, tap to pick, wheel / pinch to zoom.
  const pts = new Map();
  let start = null, moved = 0, pinch0 = 0, dist0 = dist;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    start = { x: e.clientX, y: e.clientY };
    moved = 0;
    auto = false; tYaw = tPitch = null; vYaw = 0;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = dist; }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) {
      if (e.pointerType === 'mouse') { hovered = pick(e.clientX, e.clientY); canvas.style.cursor = hovered ? 'pointer' : 'grab'; }
      return;
    }
    const prev = pts.get(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0) { dist = Math.max(MIN_D, Math.min(MAX_D, dist0 * (pinch0 / d))); tDist = null; }
      return;
    }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    moved += Math.abs(dx) + Math.abs(dy);
    const k = 0.0055 * (dist / 4);
    yaw += dx * k; pitch = clampP(pitch + dy * k);
    vYaw = dx * k;
    canvas.style.cursor = 'grabbing';
  });
  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch0 = 0;
    if (e.type === 'pointerup' && moved < 6 && start) {
      const id = pick(e.clientX, e.clientY);
      if (id) onPick(id);
    }
    canvas.style.cursor = 'grab';
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    dist = Math.max(MIN_D, Math.min(MAX_D, dist * (1 + e.deltaY * 0.0012)));
    tDist = null; auto = false;
  }, { passive: false });
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', (e) => {
    const s = 0.12, m = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
    if (!m) return;
    e.preventDefault(); auto = false; tYaw = tPitch = null;
    yaw += m[0]; pitch = clampP(pitch + m[1]);
  });

  root.querySelector('[data-ctrl]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    auto = false;
    const act = b.dataset.act;
    if (act === 'in') tDist = Math.max(MIN_D, (tDist || dist) * 0.8);
    if (act === 'out') tDist = Math.min(MAX_D, (tDist || dist) * 1.25);
    if (act === 'flip') { tYaw = (tYaw ?? yaw) + Math.PI; tPitch = 0; tDist = Math.max(dist, 3.6); }
    if (act === 'reset') {
      let ty = 0;
      while (ty - yaw > Math.PI) ty -= Math.PI * 2;
      while (ty - yaw < -Math.PI) ty += Math.PI * 2;
      tYaw = ty; tPitch = 0; tDist = 4.4;
    }
  });

  // Floating name label for the hovered or selected crater.
  const wp = new THREE.Vector3(), wn = new THREE.Vector3(), toCam = new THREE.Vector3();
  function placeLabel() {
    const id = hovered || selected;
    if (!id) { label.hidden = true; return; }
    const m = markers[id];
    m.g.getWorldPosition(wp);
    wn.copy(m.n).applyQuaternion(moon.getWorldQuaternion(new THREE.Quaternion()));
    toCam.copy(camera.position).sub(wp).normalize();
    if (wn.dot(toCam) < 0.15) { label.hidden = true; return; }
    wp.project(camera);
    label.textContent = byId[id].name;
    label.style.left = canvas.offsetLeft + ((wp.x + 1) / 2) * canvas.clientWidth + 'px';
    label.style.top = canvas.offsetTop + ((1 - wp.y) / 2) * canvas.clientHeight + 'px';
    label.hidden = false;
  }

  // Animation loop, paused while off screen.
  let visible = true;
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; }).observe(stage);
  // Time-based easing so the fly-to takes the same time on slow and fast devices.
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.25, ((now || performance.now()) - last) / 1000);
    last = now || performance.now();
    if (!visible || document.hidden) return;
    const ease = 1 - Math.pow(1 - 0.075, dt * 60);
    const spin = dt * 60;
    if (tYaw !== null) { yaw += (tYaw - yaw) * ease; if (Math.abs(tYaw - yaw) < 1e-4) tYaw = null; }
    else if (!pts.size) { if (Math.abs(vYaw) > 1e-5) { yaw += vYaw * spin; vYaw *= Math.pow(0.94, spin); } else if (auto) yaw += 0.0012 * spin; }
    if (tPitch !== null) { pitch += (tPitch - pitch) * ease; if (Math.abs(tPitch - pitch) < 1e-4) tPitch = null; }
    if (tDist !== null) { dist += (tDist - dist) * ease; if (Math.abs(tDist - dist) < 1e-3) tDist = null; }
    globe.rotation.set(pitch, yaw, 0, 'XYZ');
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    placeLabel();
  }

  // Textures: 4K on large screens, 2K otherwise (and when the user asks to save data).
  const big = Math.max(innerWidth, innerHeight) * (devicePixelRatio || 1) >= 1600 && !(navigator.connection && navigator.connection.saveData);
  const loader = new THREE.TextureLoader();
  loader.load(big ? DATA.tex4k : DATA.tex2k, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    moonMat.map = tex;
    moonMat.needsUpdate = true;
    loader.load(DATA.relief, (bump) => { moonMat.bumpMap = bump; moonMat.bumpScale = 2.2; moonMat.needsUpdate = true; });
    canvas.hidden = false;
    root.querySelector('[data-map]').hidden = true;
    root.querySelector('[data-ctrl]').hidden = false;
    root.querySelector('[data-hint]').hidden = false;
    stage.classList.add('is-3d');
    resize();
    requestAnimationFrame(frame);
  }, undefined, () => { /* keep the flat map */ });

  return { select };
}
