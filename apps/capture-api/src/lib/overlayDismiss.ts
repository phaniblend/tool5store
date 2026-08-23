/**
 * Injected into the page before any site JS runs (via page.addInitScript).
 * Best-effort: clicks common cookie-consent / overlay "accept" buttons and
 * hides a handful of well-known consent-manager containers as a fallback.
 * This is heuristic, not exhaustive — sites with bespoke consent UIs will
 * slip through.
 */
export const OVERLAY_DISMISS_SCRIPT = `
(() => {
  const CLICK_SELECTORS = [
    // OneTrust
    "#onetrust-accept-btn-handler",
    // Cookiebot
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    "#CybotCookiebotDialogBodyButtonAccept",
    // Quantcast Choice / IAB TCF CMPs
    ".qc-cmp2-summary-buttons button[mode='primary']",
    // Generic "accept" buttons by common id/class naming
    "#accept-cookies",
    "#cookie-accept",
    "#cookie-consent-accept",
    ".cookie-consent-accept",
    ".cc-accept",
    ".cc-allow",
    ".cc-dismiss",
    "[data-testid='cookie-accept']",
    "[aria-label='Accept cookies']",
    "[aria-label='Accept all cookies']",
  ];

  const HIDE_SELECTORS = [
    "#onetrust-banner-sdk",
    "#onetrust-consent-sdk",
    "#CybotCookiebotDialog",
    ".qc-cmp2-container",
    "#cookie-banner",
    "#cookie-notice",
    ".cookie-banner",
    ".cookie-notice",
    ".cookie-consent",
    "[class*='cookie-consent']",
    "[id*='cookie-consent']",
  ];

  function tryClickAll() {
    for (const sel of CLICK_SELECTORS) {
      try {
        document.querySelectorAll(sel).forEach((el) => {
          if (el instanceof HTMLElement) el.click();
        });
      } catch {}
    }
  }

  function hideAll() {
    const style = document.createElement("style");
    style.setAttribute("data-injected-by", "capture-api");
    style.textContent = HIDE_SELECTORS.map((s) => \`\${s} { display: none !important; }\`).join("\\n");
    document.documentElement?.appendChild(style);
  }

  // Run as soon as DOM is interactive, then again shortly after in case
  // the consent widget renders asynchronously.
  const run = () => {
    hideAll();
    tryClickAll();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }

  setTimeout(tryClickAll, 800);
  setTimeout(tryClickAll, 2000);
})();
`;
