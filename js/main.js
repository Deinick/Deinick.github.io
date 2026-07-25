(function () {
  var root = document.documentElement;

  /* ---- Theme toggle ---- */
  var toggle = document.getElementById("themeToggle");

  function isDark() {
    var attr = root.getAttribute("data-theme");
    if (attr) return attr === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function updateToggleLabel() {
    if (!toggle) return;
    var label = toggle.querySelector(".toggle-label");
    if (label) label.textContent = isDark() ? "Light" : "Dark";
  }

  updateToggleLabel();

  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = isDark() ? "light" : "dark";
      root.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
      updateToggleLabel();
    });
  }

  /* ---- Mobile nav ---- */
  var burger = document.getElementById("navBurger");
  var links = document.getElementById("navLinks");
  if (burger && links) {
    burger.addEventListener("click", function () {
      links.classList.toggle("open");
    });
    links.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        links.classList.remove("open");
      });
    });
  }

  /* ---- Back to top ---- */
  var backToTop = document.getElementById("backToTop");
  if (backToTop) {
    window.addEventListener("scroll", function () {
      if (window.scrollY > 400) {
        backToTop.classList.add("show");
      } else {
        backToTop.classList.remove("show");
      }
    });
    backToTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* ---- Nav scroll state (full-width -> floating pill) ---- */
  var navEl = document.querySelector(".nav");
  var navScrolled = false;
  window.addEventListener(
    "scroll",
    function () {
      var should = window.scrollY > 60;
      if (should === navScrolled) return;
      navScrolled = should;
      if (navEl) navEl.classList.toggle("scrolled", should);
    },
    { passive: true }
  );

  /* ---- Custom cursor (desktop/mouse only) ---- */
  if (window.matchMedia("(pointer: fine)").matches) {
    var cursorEl = document.getElementById("cursor");
    if (cursorEl) {
      document.addEventListener("mousemove", function (e) {
        cursorEl.style.transform = "translate(" + e.clientX + "px, " + e.clientY + "px)";
        cursorEl.style.opacity = "1";
      });
      document.addEventListener("mouseleave", function () {
        cursorEl.style.opacity = "0";
      });
      document.addEventListener("mouseenter", function () {
        cursorEl.style.opacity = "1";
      });

      document.querySelectorAll("a, button, .project-card").forEach(function (el) {
        el.addEventListener("mouseenter", function () {
          document.body.classList.add("is-hovering");
          var t = document.getElementById("cursorLabelText");
          if (t && el.dataset.cursor === "hi") {
            t.style.opacity = "0";
            setTimeout(function () {
              t.textContent = "Say hi! 👋";
              t.style.opacity = "1";
            }, 120);
          }
        });
        el.addEventListener("mouseleave", function () {
          document.body.classList.remove("is-hovering");
          var t = document.getElementById("cursorLabelText");
          if (t && t.textContent !== "Guest") {
            t.style.opacity = "0";
            setTimeout(function () {
              t.textContent = "Guest";
              t.style.opacity = "1";
            }, 120);
          }
        });
      });
    }
  }

  /* ---- GSAP-driven entrance + scroll reveals ---- */
  var preloader = document.getElementById("preloader");

  if (window.gsap) {
    gsap.registerPlugin(ScrollTrigger);

    var heroIn = function () {
      gsap.set([".nav-logo", ".nav-links", ".theme-toggle"], { opacity: 0 });
      gsap.to([".nav-logo", ".nav-links", ".theme-toggle"], {
        opacity: 1,
        duration: 0.7,
        stagger: 0.1,
        ease: "power2.out",
      });

      var heroLines = document.querySelectorAll(".hero .tl span, .proj-hero .tl span");
      if (heroLines.length) {
        gsap.to(heroLines, { y: 0, duration: 1.05, stagger: 0.1, ease: "power3.out", delay: 0.05 });
      }

      var heroEyebrow = document.querySelector(".hero .eyebrow, .proj-hero .eyebrow");
      if (heroEyebrow) {
        gsap.set(heroEyebrow, { opacity: 0, y: 12 });
        gsap.to(heroEyebrow, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out", delay: 0.05 });
      }

      var heroSub = document.querySelector(".hero-sub, .proj-hook");
      if (heroSub) {
        gsap.set(heroSub, { opacity: 0, y: 16 });
        gsap.to(heroSub, { opacity: 1, y: 0, duration: 0.75, ease: "power2.out", delay: 0.55 });
      }

      var badges = document.querySelectorAll(".hero-badges .badge");
      if (badges.length) {
        gsap.set(badges, { opacity: 0, x: 24 });
        gsap.to(badges, { opacity: 1, x: 0, duration: 0.55, stagger: 0.1, ease: "power2.out", delay: 0.7 });
      }

      var metaRow = document.querySelectorAll(".proj-meta-row .tag, .proj-links .btn");
      if (metaRow.length) {
        gsap.set(metaRow, { opacity: 0, y: 12 });
        gsap.to(metaRow, { opacity: 1, y: 0, duration: 0.5, stagger: 0.05, ease: "power2.out", delay: 0.65 });
      }

      initScroll();
    };

    /* Direction-aware reveal classes — each has its own hidden pose (see
       .reveal-* in style.css). Bidirectional: toggleActions plays forward
       entering downward, reverses leaving upward, and replays re-entering. */
    var REVEAL_DIRS = {
      "reveal-up": { x: 0, y: 34, rotation: 0 },
      "reveal-down": { x: 0, y: -34, rotation: 0 },
      "reveal-left": { x: -56, y: 10, rotation: -2.5 },
      "reveal-right": { x: 56, y: 10, rotation: 2.5 },
      "reveal-diag-l": { x: -48, y: 46, rotation: -3.5 },
      "reveal-diag-r": { x: 48, y: 46, rotation: 3.5 },
    };
    var REVEAL_SELECTOR = Object.keys(REVEAL_DIRS)
      .map(function (c) { return "." + c; })
      .join(", ");

    var initScroll = function () {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.set(REVEAL_SELECTOR, { opacity: 1, x: 0, y: 0, rotation: 0 });
        gsap.set(".section-head .tl span, .contact-title .tl span", { y: 0 });
        return;
      }

      Object.keys(REVEAL_DIRS).forEach(function (cls) {
        var pose = REVEAL_DIRS[cls];
        gsap.utils.toArray("." + cls).forEach(function (el) {
          gsap.fromTo(
            el,
            { opacity: 0, x: pose.x, y: pose.y, rotation: pose.rotation },
            {
              opacity: 1,
              x: 0,
              y: 0,
              rotation: 0,
              duration: 0.8,
              ease: "power2.out",
              scrollTrigger: {
                trigger: el,
                start: "top 90%",
                toggleActions: "play reverse play reverse",
              },
            }
          );
        });
      });

      gsap.utils.toArray(".section-head .tl span, .contact-title .tl span").forEach(function (span) {
        gsap.fromTo(
          span,
          { y: "110%" },
          {
            y: "0%",
            duration: 1.05,
            ease: "power3.out",
            scrollTrigger: {
              trigger: span,
              start: "top 90%",
              toggleActions: "play reverse play reverse",
            },
          }
        );
      });

      setTimeout(function () {
        ScrollTrigger.refresh();
      }, 400);
      window.addEventListener("load", function () {
        ScrollTrigger.refresh();
      });
    };

    if (preloader) {
      var plBar = document.getElementById("plBar");
      var plName = document.querySelector(".pl-name span");

      if (sessionStorage.getItem("nd_visited")) {
        preloader.style.display = "none";
        heroIn();
      } else {
        sessionStorage.setItem("nd_visited", "1");
        if (plName) gsap.to(plName, { y: 0, duration: 0.7, ease: "power3.out", delay: 0.1 });
        if (plBar) {
          setTimeout(function () {
            plBar.style.width = "100%";
          }, 150);
        }
        setTimeout(function () {
          gsap.to(preloader, {
            yPercent: -100,
            duration: 0.9,
            ease: "power3.inOut",
            onComplete: function () {
              preloader.style.display = "none";
              heroIn();
            },
          });
        }, 1300);
      }
    } else {
      heroIn();
    }
  } else {
    if (preloader) preloader.style.display = "none";
    document
      .querySelectorAll(
        ".reveal-up, .reveal-down, .reveal-left, .reveal-right, .reveal-diag-l, .reveal-diag-r, .tl span, .nav-logo, .nav-links, .theme-toggle"
      )
      .forEach(function (el) {
        el.style.opacity = "1";
        el.style.transform = "none";
      });
  }
})();
