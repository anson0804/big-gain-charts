(function (global) {
  var THEME_KEY = "anson-notes-theme";
  var THEME_COLOR = { dark: "#111214", light: "#f4f3ef" };

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function applyTheme(mode) {
    var next = mode === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    var btn = document.getElementById("themeToggle");
    if (btn) btn.textContent = next === "dark" ? "淺色" : "深色";
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEME_COLOR[next]);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (e) {
      /* ignore quota / private mode */
    }
  }

  function initTheme() {
    applyTheme(currentTheme());
    var btn = document.getElementById("themeToggle");
    if (!btn || btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", function () {
      applyTheme(currentTheme() === "light" ? "dark" : "light");
    });
  }

  global.initEssayTheme = initTheme;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTheme);
  } else {
    initTheme();
  }
})(window);
