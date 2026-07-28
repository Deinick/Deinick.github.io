import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

(function () {
  var canvas = document.getElementById("webgl-hero");
  var heroEl = document.querySelector(".hero");
  if (!canvas || !heroEl || !window.WebGLRenderingContext) return;

  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  var isSmallScreen = window.innerWidth < 780;

  /* Everything below is real work: shader compilation, a PMREM environment
     bake, and kicking off a 14MB model download. Deferring it past the
     first couple of paints keeps it from competing with the preloader
     animation and the hero text reveal for the main thread right when the
     page loads (or reloads). */
  function init() {
  var renderer;
  try {
    /* antialias is intentionally off: the EffectComposer/bloom pipeline
       below renders into its own non-multisampled render targets, so MSAA
       on the base renderer never actually reaches the final frame — it
       only pays for a heavier WebGL context. */
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, powerPreference: "high-performance" });
  } catch (e) {
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmallScreen ? 1.25 : 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0.15, 6.2);

  var pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  function readVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return v && v.trim() ? v.trim() : fallback;
  }

  function applyBackground() {
    scene.background = new THREE.Color(readVar("--bg", "#0a0a0a"));
  }
  applyBackground();

  /* ---- Lighting: warm key + accent rim + cursor-follow highlight ---- */
  var keyLight = new THREE.DirectionalLight(0xc08a3e, 3.2);
  keyLight.position.set(3, 4, 5);
  scene.add(keyLight);

  var rimLight = new THREE.PointLight(0xc9432f, 7, 14, 2);
  rimLight.position.set(-3.2, 0.8, -2.2);
  scene.add(rimLight);

  var cursorLight = new THREE.PointLight(0xf2e8d3, 5, 9, 2);
  cursorLight.position.set(0, 0.5, 3);
  scene.add(cursorLight);

  var ambient = new THREE.AmbientLight(0xffffff, 0.22);
  scene.add(ambient);

  /* ---- Katana ---- */
  var katanaGroup = new THREE.Group();
  scene.add(katanaGroup);
  var modelLoaded = false;
  var modelMaterials = [];
  var modelFadeStart = 0;
  var MODEL_FADE_MS = 900;

  var loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(
    "assets/katana.glb",
    function (gltf) {
      var model = gltf.scene;
      var box = new THREE.Box3().setFromObject(model);
      var size = new THREE.Vector3();
      var center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      model.position.sub(center);
      var maxDim = Math.max(size.x, size.y, size.z) || 1;
      var scale = 4.4 / maxDim;
      model.scale.setScalar(scale);

      /* Fade the blade in over time instead of popping in the instant the
         (large, slow-to-download-and-decode) model finishes loading. */
      model.traverse(function (o) {
        if (!o.isMesh || !o.material) return;
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(function (mat) {
          mat.transparent = true;
          mat.opacity = 0;
          modelMaterials.push(mat);
        });
      });

      var pivot = new THREE.Group();
      pivot.add(model);
      pivot.rotation.z = Math.PI / 3.1;
      pivot.rotation.x = 0.18;
      katanaGroup.add(pivot);
      modelLoaded = true;

      if (prefersReduced) {
        /* animate() never runs for reduced-motion users, so the one-shot
           renderFrame() call below fires before this async load resolves —
           without this, the katana would simply never appear for them. */
        modelMaterials.forEach(function (mat) {
          mat.opacity = 1;
        });
        modelMaterials.length = 0;
        renderFrame();
      } else {
        modelFadeStart = performance.now();
      }
    },
    undefined,
    function (err) {
      console.warn("Hero scene: katana model failed to load", err);
    }
  );

  /* ---- Ember particles ---- */
  function makeEmberTexture() {
    var size = 64;
    var c = document.createElement("canvas");
    c.width = c.height = size;
    var ctx = c.getContext("2d");
    var grd = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.35, "rgba(255,205,140,0.65)");
    grd.addColorStop(1, "rgba(255,205,140,0)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }

  var PARTICLE_COUNT = isSmallScreen ? 36 : 90;
  var positions = new Float32Array(PARTICLE_COUNT * 3);
  var speeds = new Float32Array(PARTICLE_COUNT);
  var sways = new Float32Array(PARTICLE_COUNT);
  for (var i = 0; i < PARTICLE_COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 11;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 6.5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 6;
    speeds[i] = 0.12 + Math.random() * 0.3;
    sways[i] = Math.random() * Math.PI * 2;
  }
  var particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  var particleMat = new THREE.PointsMaterial({
    size: 0.085,
    map: makeEmberTexture(),
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: 0xd9a35c,
  });
  var particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  function updateParticles(t, dt) {
    var pos = particleGeo.attributes.position.array;
    for (var i = 0; i < PARTICLE_COUNT; i++) {
      pos[i * 3 + 1] += speeds[i] * dt;
      pos[i * 3] += Math.sin(t * 0.4 + sways[i]) * 0.0025;
      if (pos[i * 3 + 1] > 3.4) pos[i * 3 + 1] = -3.4;
    }
    particleGeo.attributes.position.needsUpdate = true;
  }

  /* ---- Post-processing ---- */
  var composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  /* Bloom is computed at half resolution — a blur pass this soft doesn't
     need full-res input, and it's the single most expensive part of the
     pipeline (several downsampled blur passes run every frame). */
  var bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2),
    0.5,
    0.6,
    0.84
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ---- Pointer parallax ---- */
  var mouseX = 0,
    mouseY = 0,
    targetX = 0,
    targetY = 0;
  if (!isCoarsePointer && !prefersReduced) {
    window.addEventListener(
      "pointermove",
      function (e) {
        mouseX = (e.clientX / window.innerWidth) * 2 - 1;
        mouseY = (e.clientY / window.innerHeight) * 2 - 1;
      },
      { passive: true }
    );
  }

  /* ---- Scroll-driven exit through the hero ---- */
  var scrollProgress = 0;
  function setupScroll() {
    if (!window.gsap || !window.ScrollTrigger) return;
    ScrollTrigger.create({
      trigger: heroEl,
      start: "top top",
      end: "bottom top",
      scrub: true,
      onUpdate: function (self) {
        scrollProgress = self.progress;
      },
    });
  }
  if (document.readyState === "complete") setupScroll();
  else window.addEventListener("load", setupScroll);

  /* ---- Theme swap ---- */
  var themeObserver = new MutationObserver(applyBackground);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  /* ---- Resize ---- */
  function onResize() {
    var w = window.innerWidth,
      h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
  }
  window.addEventListener("resize", onResize);

  /* ---- Pause rendering when hero is off-screen ---- */
  var active = true;
  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        active = entry.isIntersecting;
      });
    },
    { threshold: 0 }
  );
  io.observe(heroEl);

  /* ---- Render loop ---- */
  var timer = new THREE.Timer();

  function renderFrame() {
    timer.update();
    var t = timer.getElapsed();
    var dt = timer.getDelta();

    targetX += (mouseX - targetX) * 0.045;
    targetY += (mouseY - targetY) * 0.045;

    var fade = 1 - scrollProgress;
    canvas.style.opacity = String(Math.max(fade, 0));

    if (modelLoaded) {
      katanaGroup.rotation.y = t * 0.14 + targetX * 0.35 + scrollProgress * 1.4;
      katanaGroup.rotation.x = Math.sin(t * 0.3) * 0.025 + targetY * 0.12;
      katanaGroup.position.y = Math.sin(t * 0.55) * 0.08 - scrollProgress * 1.1;
      katanaGroup.position.x = targetX * 0.25;

      if (modelMaterials.length) {
        var fadeP = Math.min(1, (performance.now() - modelFadeStart) / MODEL_FADE_MS);
        var eased = 1 - Math.pow(1 - fadeP, 3);
        for (var mi = 0; mi < modelMaterials.length; mi++) {
          modelMaterials[mi].opacity = eased;
        }
        if (fadeP >= 1) modelMaterials.length = 0;
      }
    }

    camera.position.x = targetX * 0.3;
    camera.position.y = 0.15 + targetY * 0.15;
    camera.lookAt(0, 0, 0);

    cursorLight.position.x = targetX * 3.2;
    cursorLight.position.y = -targetY * 2 + 1;

    updateParticles(t, dt);

    composer.render();
  }

  function animate() {
    requestAnimationFrame(animate);
    if (!active) return;
    renderFrame();
  }

  if (prefersReduced) {
    renderFrame();
  } else {
    animate();
  }
  }

  requestAnimationFrame(function () {
    requestAnimationFrame(init);
  });
})();
