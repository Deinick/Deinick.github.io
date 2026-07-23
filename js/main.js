(function () {
  var root = document.documentElement;
  var stored = localStorage.getItem("theme");
  if (stored) root.setAttribute("data-theme", stored);

  function currentIsDark() {
    var attr = root.getAttribute("data-theme");
    if (attr) return attr === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function updateToggleLabel(btn) {
    if (!btn) return;
    var label = btn.querySelector(".toggle-label");
    if (label) label.textContent = currentIsDark() ? "Light" : "Dark";
  }

  document.addEventListener("DOMContentLoaded", function () {
    var toggle = document.getElementById("themeToggle");
    updateToggleLabel(toggle);
    if (toggle) {
      toggle.addEventListener("click", function () {
        var next = currentIsDark() ? "light" : "dark";
        root.setAttribute("data-theme", next);
        localStorage.setItem("theme", next);
        updateToggleLabel(toggle);
      });
    }

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
  });
})();
