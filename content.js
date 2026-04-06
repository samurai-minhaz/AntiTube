// content.js — AntiTube
// Detects Shorts via URL polling (reliable on YouTube SPA),
// starts the user-chosen timer instantly, kills audio on block.

(() => {
  "use strict";

  const HIDE_STYLE_ID  = "antitube-hide-css";
  const OVERLAY_ID     = "antitube-overlay";
  const POLL_MS        = 400; // URL poll interval

  // ── CSS that hides every Shorts shelf in the YouTube feed ────────────────────
  const HIDE_CSS = `
    ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]),
    ytd-reel-shelf-renderer,
    ytd-guide-entry-renderer a[href="/shorts"],
    ytd-mini-guide-entry-renderer a[href="/shorts"],
    yt-chip-cloud-chip-renderer[chip-style="STYLE_HOME_FILTER"]:has([title="Shorts"]) {
      display: none !important;
    }
  `;

  // ── Module state ──────────────────────────────────────────────────────────────
  let blocked     = false;
  let lastUrl     = location.href;
  let timerActive = false; // true once START_TIMER has been sent this session

  // ── Boot ──────────────────────────────────────────────────────────────────────
  chrome.storage.local.get(
    ["timerStart", "timerDuration", "blocked"],
    (state) => {
      blocked     = !!state.blocked;
      timerActive = !!state.timerStart;

      if (blocked) {
        applyBlock();
      } else {
        // Guard: timer was set in a previous tab and may have already expired
        if (state.timerStart && state.timerDuration) {
          const elapsed = Date.now() - state.timerStart;
          if (elapsed >= state.timerDuration * 60_000) {
            blocked = true;
            chrome.storage.local.set({ blocked: true });
            applyBlock();
            return;
          }
        }
        startPolling();
      }
    }
  );

  // ── Background alarm fired (another tab / service worker) ────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "BLOCK_NOW" && !blocked) {
      blocked = true;
      applyBlock();
    }
  });

  // ── URL polling — catches every SPA navigation instantly ─────────────────────
  function startPolling() {
    // Also patch history for zero-latency response when possible
    const _push    = history.pushState.bind(history);
    const _replace = history.replaceState.bind(history);
    history.pushState    = (...a) => { _push(...a);    onUrlMaybeChanged(); };
    history.replaceState = (...a) => { _replace(...a); onUrlMaybeChanged(); };
    window.addEventListener("popstate", onUrlMaybeChanged);

    // Polling loop — the real fix for YouTube's custom router
    setInterval(onUrlMaybeChanged, POLL_MS);

    // MutationObserver re-applies shelf hiders after DOM hydration
    new MutationObserver(debounce(hideShortsShelves, 300))
      .observe(document.body, { childList: true, subtree: true });

    // Handle the very first load
    onUrlMaybeChanged();
  }

  function onUrlMaybeChanged() {
    const current = location.href;
    if (current === lastUrl) {
      // URL unchanged — but still re-hide shelves in case DOM was rebuilt
      hideShortsShelves();
      return;
    }
    lastUrl = current;
    onNavigate();
  }

  function onNavigate() {
    if (blocked) { applyBlock(); return; }

    if (isOnShortsPage() && !timerActive) {
      timerActive = true;
      chrome.storage.local.get("timerDuration", ({ timerDuration = 7 }) => {
        chrome.runtime.sendMessage({ type: "START_TIMER", duration: timerDuration });
      });
    }

    hideShortsShelves();
  }

  // ── Blocking ──────────────────────────────────────────────────────────────────
  function applyBlock() {
    killSound();          // stop all media immediately
    injectHideCSS();
    hideShortsShelves();
    if (isOnShortsPage()) showBlockOverlay();
  }

  // Pause + mute every <video> and <audio> on the page
  function killSound() {
    document.querySelectorAll("video, audio").forEach((el) => {
      try { el.pause(); } catch (_) {}
      el.muted  = true;
      el.volume = 0;
    });
    // Also mute new media that YouTube lazily inserts
    const mo = new MutationObserver(() => {
      document.querySelectorAll("video:not([data-at-muted]), audio:not([data-at-muted])").forEach((el) => {
        try { el.pause(); } catch (_) {}
        el.muted  = true;
        el.volume = 0;
        el.setAttribute("data-at-muted", "1");
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  function injectHideCSS() {
    if (document.getElementById(HIDE_STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = HIDE_STYLE_ID;
    s.textContent = HIDE_CSS;
    document.head.appendChild(s);
  }

  function hideShortsShelves() {
    if (!blocked) return;
    document.querySelectorAll("ytd-reel-shelf-renderer").forEach(hide);
    document.querySelectorAll("ytd-rich-section-renderer").forEach((el) => {
      if (el.querySelector("ytd-rich-shelf-renderer[is-shorts]")) hide(el);
    });
    document.querySelectorAll(
      'ytd-guide-entry-renderer a[href="/shorts"], ytd-mini-guide-entry-renderer a[href="/shorts"]'
    ).forEach((a) => hide(a.closest("ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer")));
  }

  function hide(el) {
    if (el) el.style.setProperty("display", "none", "important");
  }

  // ── Full-screen block overlay ─────────────────────────────────────────────────
  function showBlockOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;

    // Inject styles
    const style = document.createElement("style");
    style.textContent = `
      #antitube-overlay {
        position: fixed; inset: 0; z-index: 2147483647;
        background: #080808;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        font-family: 'Segoe UI', system-ui, sans-serif;
        animation: at-in .4s cubic-bezier(.4,0,.2,1) both;
      }
      @keyframes at-in {
        from { opacity: 0; transform: scale(.96); }
        to   { opacity: 1; transform: scale(1); }
      }
      .at-ring {
        width: 90px; height: 90px; border-radius: 50%;
        background: radial-gradient(circle, #2a0000 0%, #0a0000 100%);
        border: 2px solid #3a0000;
        display: grid; place-items: center;
        font-size: 2.6rem;
        margin-bottom: 2rem;
        box-shadow: 0 0 40px rgba(255,0,0,.2), inset 0 0 20px rgba(255,0,0,.1);
      }
      .at-title {
        font-size: 2rem; font-weight: 700; color: #fff;
        margin: 0 0 .6rem; letter-spacing: -.5px;
      }
      .at-title span { color: #ff3333; }
      .at-sub {
        font-size: 1rem; color: #777;
        line-height: 1.7; margin: 0 0 2.5rem;
        text-align: center; max-width: 320px;
      }
      .at-back {
        display: inline-flex; align-items: center; gap: 8px;
        padding: .8rem 2rem;
        background: #ff0000; color: #fff;
        border-radius: 50px; text-decoration: none;
        font-weight: 700; font-size: .95rem; letter-spacing: .02em;
        transition: background .2s, transform .15s;
        box-shadow: 0 4px 24px rgba(255,0,0,.35);
      }
      .at-back:hover { background: #cc0000; transform: translateY(-1px); }
      .at-back svg { width: 16px; height: 16px; fill: currentColor; }
    `;
    document.head.appendChild(style);

    // Build overlay
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = `
      <div class="at-ring">🚫</div>
      <h1 class="at-title">Time's <span>up</span></h1>
      <p class="at-sub">
        Your AntiTube session has ended.<br>
        Put the phone down. Go touch some grass.
      </p>
      <a class="at-back" href="https://www.youtube.com">
        <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        Back to YouTube
      </a>
    `;
    document.body.appendChild(overlay);

    // Prevent scrolling behind the overlay
    document.documentElement.style.overflow = "hidden";
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function isOnShortsPage() {
    return /^\/shorts\//.test(location.pathname);
  }

  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }
})();
