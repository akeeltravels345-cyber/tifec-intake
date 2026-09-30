// Sets the theme (Auto/Light/Dark) on <html> before first paint so there's no
// flash. Loaded via next/script beforeInteractive, so it runs before hydration.
// Intake forms (/intake) are client-facing and must ALWAYS render light.
(function () {
  try {
    var p = location.pathname;
    var forceLight = p === "/intake" || p.indexOf("/intake/") === 0;
    var t = localStorage.getItem("tifec-theme") || "system";
    var d = !forceLight && (t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches));
    document.documentElement.setAttribute("data-theme", d ? "dark" : "light");
  } catch (e) { /* storage/matchMedia unavailable — leave default */ }
})();
