/* ---------------------------------------------------------
   Katana page-transition: straight left-to-right wipe between
   home <-> project pages, with a spark trail along the leading edge.

   The wipe + sparks are the guaranteed effect and never wait on
   anything. A real three.js render of katana.glb (blade sub-meshes
   isolated by bounding box, scaled to fill the frame) layers on top
   ONLY if it happens to already be loaded by the moment of the click —
   there is no waiting/racing for it, so it can never make the
   transition feel slow or hang.
--------------------------------------------------------- */
(function () {
  var FLAG = "nd_pt_active";
  var DURATION = 850; // must match the .pt-panel CSS transition duration
  var THREE_URL = "https://unpkg.com/three@0.160.0/build/three.module.js";
  var LOADER_URL = "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
  var ROOMENV_URL = "https://unpkg.com/three@0.160.0/examples/jsm/environments/RoomEnvironment.js";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var overlay = document.getElementById("pageTransition");
  var panel = document.getElementById("ptPanel");
  var canvas = document.getElementById("ptCanvas");
  var sparkLayer = document.getElementById("ptSparkles");
  if (!overlay || !panel) return;

  var glbUrl = overlay.getAttribute("data-glb");
  var threePromise = null;
  var loaderPromise = null;
  var scenePromise = null;
  var scene = null; // set once buildScene resolves; presence = "ready to render"
  var warmed = false;

  function ensureThree() {
    threePromise = threePromise || import(THREE_URL);
    return threePromise;
  }
  function ensureLoader() {
    loaderPromise = loaderPromise || import(LOADER_URL);
    return loaderPromise;
  }
  var roomEnvPromise = null;
  function ensureRoomEnv() {
    roomEnvPromise = roomEnvPromise || import(ROOMENV_URL);
    return roomEnvPromise;
  }

  function buildScene() {
    if (scenePromise) return scenePromise;
    scenePromise = Promise.all([ensureThree(), ensureLoader(), ensureRoomEnv()])
      .then(function (mods) {
        var THREE = mods[0];
        var GLTFLoader = mods[1].GLTFLoader;
        var RoomEnvironment = mods[2].RoomEnvironment;
        return new Promise(function (resolve, reject) {
          new GLTFLoader().load(
            glbUrl,
            function (gltf) {
              resolve({ THREE: THREE, RoomEnvironment: RoomEnvironment, root: gltf.scene });
            },
            undefined,
            reject
          );
        });
      })
      .then(function (r) {
        var THREE = r.THREE;
        var RoomEnvironment = r.RoomEnvironment;
        var root = r.root;

        // This model's blade meshes span local Y ~ -0.39..1.0 (long, thin);
        // the hilt/guard/pommel cluster sits at Y ~ -1.0..-0.44. Isolate the
        // blade portion by each mesh's own bounding-box center instead of
        // guessing — measured directly from the file's accessor bounds.
        var bladeGroup = new THREE.Group();
        var meshes = [];
        root.traverse(function (o) {
          if (o.isMesh) meshes.push(o);
        });
        meshes.forEach(function (m) {
          var box = new THREE.Box3().setFromObject(m);
          var centerY = (box.min.y + box.max.y) / 2;
          if (centerY > -0.4) bladeGroup.add(m.clone());
        });
        var target = bladeGroup.children.length ? bladeGroup : root;

        // The glTF materials are fully metallic (metallicFactor defaults to
        // 1.0 per spec) with no baseColor/metalness overrides — under only
        // point/directional lights and no environment map, a fully metallic
        // surface renders almost black (metals have ~no diffuse response,
        // only specular/reflected light). Nudge metalness down so direct
        // lighting alone still reads clearly, on top of the env map below.
        target.traverse(function (o) {
          if (o.isMesh && o.material) {
            var mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach(function (mat) {
              if ("metalness" in mat) mat.metalness = Math.min(mat.metalness, 0.55);
              if ("roughness" in mat) mat.roughness = Math.min(mat.roughness, 0.5);
            });
          }
        });

        // Align the blade's long axis (local Y) to world X for a
        // horizontal, screen-filling close-up.
        target.rotation.z = -Math.PI / 2;

        // Measure BEFORE scaling, purely to size the scale factor.
        var preSize = new THREE.Vector3();
        new THREE.Box3().setFromObject(target).getSize(preSize);

        var fovDeg = 50;
        var camDist = 3;
        var visibleHeight = 2 * camDist * Math.tan(((fovDeg * Math.PI) / 180) / 2);
        var fillDim = preSize.y || 0.113; // the blade's width (face height), not its wafer-thin edge thickness
        var scale = (visibleHeight * 2.2) / fillDim;
        target.scale.setScalar(scale);

        // Re-measure AFTER scaling and center against THIS box — centering
        // before scaling leaves a (scale-1)x residual offset, since position
        // and scale are independent transform components in three.js.
        var center = new THREE.Vector3();
        new THREE.Box3().setFromObject(target).getCenter(center);
        target.position.sub(center);

        var renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(window.innerWidth, window.innerHeight, false);

        var camera = new THREE.PerspectiveCamera(fovDeg, window.innerWidth / window.innerHeight, 0.1, 100);
        camera.position.set(0, 0, camDist);

        var sc = new THREE.Scene();
        sc.add(new THREE.HemisphereLight(0xffe8c0, 0x1a0d0d, 1.3));
        var rim = new THREE.DirectionalLight(0xffffff, 2.0);
        rim.position.set(-2, 3, 4);
        sc.add(rim);
        var glint = new THREE.PointLight(0xc08a3e, 3, 20);
        glint.position.set(1, -1, 2);
        sc.add(glint);
        sc.add(target);

        // Metallic PBR materials need something to reflect — a generic
        // studio-style environment (three.js's built-in RoomEnvironment)
        // gives real specular highlights instead of relying on the metalness
        // tweak alone.
        var pmrem = new THREE.PMREMGenerator(renderer);
        sc.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();

        return { renderer: renderer, scene: sc, camera: camera, target: target };
      });
    scenePromise.then(
      function (r) {
        scene = r;
      },
      function () {}
    );
    return scenePromise;
  }

  function warmAssets() {
    if (warmed || !glbUrl) return;
    warmed = true;
    buildScene().catch(function () {});
  }

  // Start warming on the first real interaction anywhere on the page (not
  // on load) — gives the 14MB model lead time before an actual click.
  ["pointerdown", "pointermove", "touchstart", "scroll", "keydown"].forEach(function (evt) {
    window.addEventListener(evt, warmAssets, { once: true, passive: true });
  });

  /* Renders the (already-loaded) blade sliding gently across a close-up
     frame for DURATION ms — a modest travel range, since the point is a
     screen-filling close-up, not a long journey. No-ops if not ready. */
  function render3D() {
    if (!scene) return;
    canvas.style.opacity = "1";
    var baseX = scene.target.position.x; // the centering offset computed in buildScene
    var obj = { d: -2.4 };
    var render = function () {
      scene.target.position.x = baseX + obj.d;
      scene.renderer.render(scene.scene, scene.camera);
    };
    if (window.gsap) {
      gsap.to(obj, { d: 2.4, duration: DURATION / 1000, ease: "power1.inOut", onUpdate: render });
    } else {
      var t0 = performance.now();
      (function tick(now) {
        var p = Math.min(1, (now - t0) / DURATION);
        obj.d = -2.4 + 4.8 * p;
        render();
        if (p < 1) requestAnimationFrame(tick);
      })(t0);
    }
    setTimeout(function () {
      canvas.style.opacity = "0";
    }, DURATION);
  }

  /* ---- Spark trail: bright particles tracking the wipe's leading edge ---- */
  function spawnSpark(x, y) {
    if (!sparkLayer) return;
    var el = document.createElement("div");
    el.className = "pt-spark";
    el.style.left = x + "px";
    el.style.top = y + "px";
    sparkLayer.appendChild(el);
    var dx = (Math.random() - 0.5) * 70;
    var dy = (Math.random() - 0.5) * 70;
    var s = 0.6 + Math.random() * 0.9;
    requestAnimationFrame(function () {
      el.style.transition = "transform 460ms ease-out, opacity 460ms ease-out";
      el.style.opacity = "1";
      el.style.transform = "translate(" + dx + "px, " + dy + "px) scale(" + s + ")";
      setTimeout(function () {
        el.style.opacity = "0";
      }, 180);
    });
    setTimeout(function () {
      el.remove();
    }, 700);
  }

  function runSparkTrail() {
    if (!sparkLayer) return;
    var t0 = performance.now();
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var timer = setInterval(function () {
      var progress = Math.min(1, (performance.now() - t0) / DURATION);
      var edgeX = progress * vw;
      spawnSpark(edgeX + (Math.random() - 0.5) * 30, Math.random() * vh);
      spawnSpark(edgeX + (Math.random() - 0.5) * 30, Math.random() * vh);
      if (progress >= 1) clearInterval(timer);
    }, 45);
    setTimeout(function () {
      clearInterval(timer);
    }, DURATION + 40);
  }

  /* ---- Phase 1: exit (user clicked a transition link) ---- */
  function playExit(targetHref) {
    if (reduceMotion) {
      window.location.href = targetHref;
      return;
    }
    overlay.classList.add("active");
    warmAssets();
    runSparkTrail();
    if (scene) render3D();

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        panel.classList.add("cover");
      });
    });

    setTimeout(function () {
      try {
        sessionStorage.setItem(FLAG, "1");
      } catch (e) {}
      window.location.href = targetHref;
    }, DURATION);
  }

  /* ---- Phase 2: entrance (landed on a page after a katana nav) ---- */
  function playEntrance() {
    document.documentElement.classList.remove("pt-incoming");
    try {
      sessionStorage.removeItem(FLAG);
    } catch (e) {}

    if (reduceMotion) {
      overlay.classList.remove("active");
      return;
    }

    overlay.classList.add("active");
    panel.style.transition = "none";
    panel.classList.add("cover");
    void panel.offsetHeight; // force reflow so the covered state paints before transitions re-enable
    panel.style.transition = "";
    warmAssets();
    runSparkTrail();
    if (scene) render3D();

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        panel.classList.add("off-exit");
        panel.classList.remove("cover");
      });
    });

    setTimeout(function () {
      overlay.classList.remove("active");
      panel.classList.remove("off-exit");
    }, DURATION + 80);
  }

  /* ---- Wire triggers ---- */
  var triggers = document.querySelectorAll('[data-transition="katana"]');
  triggers.forEach(function (a) {
    a.addEventListener("mouseenter", warmAssets, { passive: true });
    a.addEventListener("touchstart", warmAssets, { passive: true });
    a.addEventListener("click", function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // let modified clicks behave normally
      e.preventDefault();
      playExit(a.href);
    });
  });

  var wasIncoming = document.documentElement.classList.contains("pt-incoming");
  if (wasIncoming) {
    playEntrance();
  }
})();
