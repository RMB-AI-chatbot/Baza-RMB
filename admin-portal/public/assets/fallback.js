/* Page start-up helpers kept out of inline scripts (the portal's Content-Security-Policy allows only files from this site). */
(function () {
  // Logo: use the official RMB logo when it has been added as /assets/rmb-logo.png, else the placeholder.
  document.querySelectorAll("img[data-fallback]").forEach(function (img) {
    function swap() { if (img.dataset.fallback) { img.src = img.dataset.fallback; img.removeAttribute("data-fallback"); } }
    if (img.complete && img.naturalWidth === 0) swap(); else img.addEventListener("error", swap);
  });
  // Static icons in the page shell.
  if (window.hi) {
    document.querySelectorAll("[data-hi]").forEach(function (el) {
      el.outerHTML = window.hi(el.dataset.hi, +el.dataset.size || 20, +el.dataset.sw || 1.5);
    });
  }
})();
