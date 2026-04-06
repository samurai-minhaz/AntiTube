// popup.js — AntiTube
// Manages the duration slider and live timer display.

const DEFAULT_MINS = 7;

const $badge         = document.getElementById("statusBadge");
const $statusText    = document.getElementById("statusText");
const $timerVal      = document.getElementById("timerVal");
const $timerBar      = document.getElementById("timerBar");
const $slider        = document.getElementById("durationSlider");
const $durDisplay    = document.getElementById("durDisplay");
const $pickerSection = document.getElementById("pickerSection");
const $resetBtn      = document.getElementById("resetBtn");

let chosenDuration = DEFAULT_MINS; // minutes, may be overridden by stored value

// ── Boot: load stored settings ────────────────────────────────────────────────
chrome.storage.local.get(
  ["timerStart", "timerDuration", "blocked"],
  (state) => {
    chosenDuration = state.timerDuration ?? DEFAULT_MINS;
    $slider.value = chosenDuration;
    $durDisplay.textContent = `${chosenDuration} min`;

    render(state);
    setInterval(() => {
      chrome.storage.local.get(
        ["timerStart", "timerDuration", "blocked"],
        (s) => render(s)
      );
    }, 1000);
  }
);

// ── Render ────────────────────────────────────────────────────────────────────
function render(state) {
  const { timerStart = null, timerDuration = DEFAULT_MINS, blocked = false } = state;
  const totalMs = timerDuration * 60 * 1000;

  // Keep slider in sync with stored duration (another tab might have changed it)
  if (timerDuration !== chosenDuration && !timerStart) {
    chosenDuration = timerDuration;
    $slider.value = chosenDuration;
    $durDisplay.textContent = `${chosenDuration} min`;
  }

  // Timer bar
  let elapsedMs = timerStart ? Math.min(Date.now() - timerStart, totalMs) : 0;
  const pct = (elapsedMs / totalMs) * 100;
  $timerBar.style.width = pct + "%";
  $timerBar.classList.toggle("danger", pct > 75);

  const limitStr = `${Math.floor(timerDuration)}:00`;
  $timerVal.textContent = timerStart
    ? `${fmt(elapsedMs)} / ${limitStr}`
    : `0:00 / ${limitStr}`;

  // Status badge
  if (blocked) {
    $badge.className = "status-badge blocked";
    $statusText.textContent = "Blocked";
  } else if (timerStart) {
    $badge.className = "status-badge active";
    $statusText.textContent = "Tracking";
  } else {
    $badge.className = "status-badge active";
    $statusText.textContent = "Idle";
  }

  // Lock slider while session is active
  const running = !!timerStart || blocked;
  $pickerSection.classList.toggle("running", running);
}

// ── Slider interaction ────────────────────────────────────────────────────────
$slider.addEventListener("input", () => {
  chosenDuration = parseInt($slider.value, 10);
  $durDisplay.textContent = `${chosenDuration} min`;
  // Persist chosen duration immediately so content script picks it up
  chrome.storage.local.set({ timerDuration: chosenDuration });
});

// ── Reset ─────────────────────────────────────────────────────────────────────
$resetBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "RESET", duration: chosenDuration }, () => {
    $pickerSection.classList.remove("running");
    chrome.storage.local.get(
      ["timerStart", "timerDuration", "blocked"],
      (s) => render(s)
    );
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
