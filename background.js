// background.js — AntiTube Service Worker
// Manages the configurable timer. No shorts-count logic.

const ALARM_NAME     = "antitube_timer";
const DEFAULT_MINS   = 7;

// ── Listen for messages from the content script / popup ──────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  if (msg.type === "START_TIMER") {
    // msg.duration = minutes chosen by user
    startAlarmIfNeeded(msg.duration ?? DEFAULT_MINS);
    sendResponse({ ok: true });
  }

  if (msg.type === "RESET") {
    chrome.alarms.clear(ALARM_NAME);
    chrome.storage.local.set({
      timerStart   : null,
      timerDuration: msg.duration ?? DEFAULT_MINS,
      blocked      : false
    });
    sendResponse({ ok: true });
  }

  if (msg.type === "GET_STATE") {
    chrome.storage.local.get(
      ["timerStart", "timerDuration", "blocked"],
      (data) => sendResponse(data)
    );
    return true; // async
  }

  return true;
});

// ── Alarm fires when chosen duration has elapsed ──────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  chrome.storage.local.get("blocked", ({ blocked }) => {
    if (!blocked) {
      chrome.storage.local.set({ blocked: true }, () => {
        chrome.tabs.query({ url: "https://www.youtube.com/*" }, (tabs) => {
          tabs.forEach((tab) =>
            chrome.tabs.sendMessage(tab.id, { type: "BLOCK_NOW" }).catch(() => {})
          );
        });
      });
    }
  });
});

// ── Helper ────────────────────────────────────────────────────────────────────

function startAlarmIfNeeded(minutes) {
  chrome.alarms.get(ALARM_NAME, (existing) => {
    if (!existing) {
      chrome.alarms.create(ALARM_NAME, { delayInMinutes: minutes });
      chrome.storage.local.set({ timerStart: Date.now(), timerDuration: minutes });
    }
  });
}
