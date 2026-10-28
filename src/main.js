// Tauri 2 invoke bridge & Window control
const { invoke } = window.__TAURI__.core;
const { getCurrentWindow } = window.__TAURI__.window;
const appWindow = getCurrentWindow();

// App State
let currentState = null;
let timerInterval = null;
let isAlwaysOnTop = true;
let isCompactMode = false;

// DOM Elements
const appRoot = document.getElementById("app-root");
const screenSetup = document.getElementById("screen-setup");
const screenActive = document.getElementById("screen-active");
const screenHistory = document.getElementById("screen-history");

const inputHours = document.getElementById("input-hours");
const inputMinutes = document.getElementById("input-minutes");
const targetSummaryText = document.getElementById("target-summary-text");
const btnStartDay = document.getElementById("btn-start-day");

const recoveryBanner = document.getElementById("recovery-banner");
const recoveryDesc = document.getElementById("recovery-desc");
const btnRecover = document.getElementById("btn-recover");
const btnDiscard = document.getElementById("btn-discard");

const activeDateDisplay = document.getElementById("active-date-display");
const displayRemaining = document.getElementById("display-remaining");
const displayCompleted = document.getElementById("display-completed");
const sessionStatusText = document.getElementById("session-status-text");
const displayCurrentSession = document.getElementById("display-current-session");
const btnToggleSession = document.getElementById("btn-toggle-session");
const btnToggleSvg = document.getElementById("btn-toggle-svg");
const btnToggleText = document.getElementById("btn-toggle-text");
const targetMetBanner = document.getElementById("target-met-banner");
const sessionCount = document.getElementById("session-count");
const sessionTbody = document.getElementById("session-tbody");

const btnFinishDay = document.getElementById("btn-finish-day");
const btnDiscardDay = document.getElementById("btn-discard-day");
const btnCopyLog = document.getElementById("btn-copy-log");

const btnPin = document.getElementById("btn-pin");
const btnCompactToggle = document.getElementById("btn-compact-toggle");
const btnHistoryToggle = document.getElementById("btn-history-toggle");
const btnCloseHistory = document.getElementById("btn-close-history");
const btnWinMinimize = document.getElementById("btn-win-minimize");
const btnWinClose = document.getElementById("btn-win-close");

const historyContainer = document.getElementById("history-container");
const globalStatusDot = document.getElementById("global-status-dot");
const toast = document.getElementById("toast");

// Modal Elements
const modalConfirm = document.getElementById("modal-confirm");
const modalTitle = document.getElementById("modal-title");
const modalMessage = document.getElementById("modal-message");
const modalBtnCancel = document.getElementById("modal-btn-cancel");
const modalBtnOk = document.getElementById("modal-btn-ok");

// Promise-based in-app confirmation modal (replaces window.confirm)
function confirmModal(message, title = "Confirmation") {
  return new Promise((resolve) => {
    modalTitle.innerText = title;
    modalMessage.innerText = message;
    modalConfirm.classList.remove("hidden");

    const onOk = () => {
      cleanup();
      resolve(true);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    const onBackdrop = (e) => {
      if (e.target === modalConfirm) {
        onCancel();
      }
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };

    const cleanup = () => {
      modalConfirm.classList.add("hidden");
      modalBtnOk.removeEventListener("click", onOk);
      modalBtnCancel.removeEventListener("click", onCancel);
      modalConfirm.removeEventListener("click", onBackdrop);
      window.removeEventListener("keydown", onKeyDown);
    };

    modalBtnOk.addEventListener("click", onOk);
    modalBtnCancel.addEventListener("click", onCancel);
    modalConfirm.addEventListener("click", onBackdrop);
    window.addEventListener("keydown", onKeyDown);
  });
}

// Helpers
function formatSeconds(totalSec) {
  if (totalSec < 0) totalSec = 0;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatTimeString(isoString) {
  if (!isoString) return "--:--:--";
  const d = new Date(isoString);
  return d.toTimeString().split(" ")[0];
}

function showToast(msg) {
  toast.innerText = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2000);
}

// Target input update
function updateTargetSummary() {
  const h = parseInt(inputHours.value, 10) || 0;
  const m = parseInt(inputMinutes.value, 10) || 0;
  targetSummaryText.innerText = `Target: ${h}h ${m}m`;
}
inputHours.addEventListener("input", updateTargetSummary);
inputMinutes.addEventListener("input", updateTargetSummary);

// Window controls (Minimize & Close)
btnWinMinimize.addEventListener("click", async () => {
  try {
    await invoke("minimize_window");
  } catch (err) {
    console.error("Minimize error:", err);
  }
});

btnWinClose.addEventListener("click", async () => {
  try {
    await invoke("close_window");
  } catch (err) {
    console.error("Close error:", err);
  }
});

// Explicit dragging support on header
const appHeader = document.querySelector(".app-header");
if (appHeader) {
  appHeader.addEventListener("mousedown", async (e) => {
    // Only drag when clicking on header or title, not on action buttons
    if (!e.target.closest("button") && !e.target.closest("input")) {
      try {
        await invoke("start_dragging");
      } catch (err) {
        console.error("Drag error:", err);
      }
    }
  });
}

// Always on top toggle
btnPin.addEventListener("click", async () => {
  isAlwaysOnTop = !isAlwaysOnTop;
  try {
    await invoke("set_always_on_top", { alwaysOnTop: isAlwaysOnTop });
    btnPin.classList.toggle("active", isAlwaysOnTop);
    showToast(isAlwaysOnTop ? "Pinned on top" : "Unpinned");
  } catch (err) {
    console.error("Failed to set always on top:", err);
  }
});

// Compact Sticky Mode Toggle & Header Auto-hide
let headerHideTimeout = null;

function showCompactHeaderBriefly() {
  if (!isCompactMode || !appHeader) return;
  appHeader.classList.add("header-visible");
  if (headerHideTimeout) clearTimeout(headerHideTimeout);
  headerHideTimeout = setTimeout(() => {
    appHeader.classList.remove("header-visible");
  }, 2200);
}

async function setCompactMode(enable) {
  if (isCompactMode === enable) return;
  isCompactMode = enable;
  document.body.classList.toggle("compact-mode", isCompactMode);
  btnCompactToggle.classList.toggle("active", isCompactMode);

  try {
    if (isCompactMode) {
      await invoke("resize_window", { width: 280, height: 110 });
      showCompactHeaderBriefly();
    } else {
      if (headerHideTimeout) clearTimeout(headerHideTimeout);
      appHeader.classList.remove("header-visible");
      await invoke("resize_window", { width: 320, height: 480 });
    }
  } catch (err) {
    console.error("Failed to resize window:", err);
  }
}

btnCompactToggle.addEventListener("click", () => {
  setCompactMode(!isCompactMode);
});

// UI Rendering
function renderUI(state) {
  currentState = state;

  if (state.workday && state.workday.status === "active") {
    // Show Screen B (Active Workday)
    btnCompactToggle.classList.remove("hidden");
    screenSetup.classList.add("hidden");
    screenHistory.classList.add("hidden");
    screenActive.classList.remove("hidden");

    activeDateDisplay.innerText = state.workday.date_str;
    displayRemaining.innerText = formatSeconds(state.remaining_seconds);
    displayCompleted.innerText = formatSeconds(state.total_completed_seconds);

    const isRunning = !!state.active_session;

    if (isRunning) {
      globalStatusDot.className = "status-dot active";
      sessionStatusText.innerText = "ACTIVE";
      btnToggleSession.className = "btn btn-action btn-stop";
      btnToggleSvg.innerHTML = '<rect x="6" y="6" width="12" height="12"></rect>';
      btnToggleText.innerText = "STOP SESSION";
      displayCurrentSession.innerText = formatSeconds(state.active_session.duration_seconds);
    } else {
      globalStatusDot.className = "status-dot paused";
      sessionStatusText.innerText = "PAUSED";
      btnToggleSession.className = "btn btn-action btn-start";
      btnToggleSvg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
      btnToggleText.innerText = "START SESSION";
      displayCurrentSession.innerText = "00:00:00";
    }

    if (state.is_target_reached) {
      targetMetBanner.classList.remove("hidden");
    } else {
      targetMetBanner.classList.add("hidden");
    }

    // Sessions table
    sessionCount.innerText = state.sessions.length;
    sessionTbody.innerHTML = "";
    state.sessions.forEach((s, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${formatTimeString(s.start_time)}</td>
        <td>${s.end_time ? formatTimeString(s.end_time) : (s.is_running ? "RUNNING" : "--")}</td>
        <td>${formatSeconds(s.duration_seconds)}</td>
      `;
      sessionTbody.appendChild(tr);
    });

    startTickTimer();
  } else {
    // Show Screen A (Setup)
    btnCompactToggle.classList.add("hidden");
    stopTickTimer();
    globalStatusDot.className = "status-dot";
    screenActive.classList.add("hidden");
    screenHistory.classList.add("hidden");
    screenSetup.classList.remove("hidden");

    if (isCompactMode) {
      setCompactMode(false);
    }

    if (state.unclosed_workday) {
      recoveryBanner.classList.remove("hidden");
      recoveryDesc.innerText = `${state.unclosed_workday.date_str} (${formatSeconds(state.unclosed_workday.target_seconds)} target)`;
    } else {
      recoveryBanner.classList.add("hidden");
    }
  }
}

// Live timer tick without drifting (polls Rust state every second)
function startTickTimer() {
  if (timerInterval) return;
  timerInterval = setInterval(async () => {
    if (currentState && currentState.workday && currentState.workday.status === "active") {
      try {
        const updated = await invoke("get_current_state", {
          currentWorkdayId: currentState.workday.id,
        });
        renderUI(updated);
      } catch (err) {
        console.error("Tick error:", err);
      }
    }
  }, 1000);
}

function stopTickTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// Actions
btnStartDay.addEventListener("click", async () => {
  const h = parseInt(inputHours.value, 10) || 0;
  const m = parseInt(inputMinutes.value, 10) || 0;
  try {
    const newState = await invoke("start_day", { targetHours: h, targetMinutes: m });
    renderUI(newState);
  } catch (err) {
    showToast(String(err));
  }
});

btnToggleSession.addEventListener("click", async () => {
  if (!currentState || !currentState.workday) return;
  const isRunning = !!currentState.active_session;
  try {
    const newState = isRunning
      ? await invoke("stop_session", { workdayId: currentState.workday.id })
      : await invoke("start_session", { workdayId: currentState.workday.id });
    renderUI(newState);
  } catch (err) {
    showToast(String(err));
  }
});

btnRecover.addEventListener("click", async () => {
  if (currentState && currentState.unclosed_workday) {
    try {
      const state = await invoke("get_current_state", {
        currentWorkdayId: currentState.unclosed_workday.id,
      });
      renderUI(state);
    } catch (err) {
      showToast(String(err));
    }
  }
});

btnDiscard.addEventListener("click", async () => {
  if (currentState && currentState.unclosed_workday) {
    const confirmed = await confirmModal("Are you sure you want to discard this unfinished workday?", "Discard Workday");
    if (confirmed) {
      await invoke("discard_workday", { workdayId: currentState.unclosed_workday.id });
      initApp();
    }
  }
});

btnFinishDay.addEventListener("click", async () => {
  if (!currentState || !currentState.workday) return;
  const confirmed = await confirmModal("Finish today's workday and mark as completed?", "Finish Day");
  if (confirmed) {
    const status = currentState.is_target_reached ? "completed" : "ended_early";
    await invoke("finish_day", { workdayId: currentState.workday.id, status });
    initApp();
  }
});

btnDiscardDay.addEventListener("click", async () => {
  if (!currentState || !currentState.workday) return;
  const confirmed = await confirmModal("Are you sure you want to discard this entire workday?", "Discard Day");
  if (confirmed) {
    await invoke("discard_workday", { workdayId: currentState.workday.id });
    initApp();
  }
});

// Copy TSV log for spreadsheets
btnCopyLog.addEventListener("click", () => {
  if (!currentState || !currentState.sessions.length) {
    showToast("No sessions to copy");
    return;
  }
  let tsv = "#\tStart Time\tEnd Time\tDuration (s)\tDuration (formatted)\n";
  currentState.sessions.forEach((s, idx) => {
    tsv += `${idx + 1}\t${formatTimeString(s.start_time)}\t${formatTimeString(s.end_time)}\t${s.duration_seconds}\t${formatSeconds(s.duration_seconds)}\n`;
  });
  tsv += `\nDaily Target:\t${formatSeconds(currentState.workday.target_seconds)}\n`;
  tsv += `Total Completed:\t${formatSeconds(currentState.total_completed_seconds)}\n`;

  navigator.clipboard.writeText(tsv).then(() => {
    showToast("Copied TSV to clipboard!");
  });
});

// History Screen
btnHistoryToggle.addEventListener("click", async () => {
  const isCurrentlyOpen = !screenHistory.classList.contains("hidden");
  if (isCurrentlyOpen) {
    // Return to active screen or setup
    screenHistory.classList.add("hidden");
    if (currentState && currentState.workday && currentState.workday.status === "active") {
      btnCompactToggle.classList.remove("hidden");
      screenActive.classList.remove("hidden");
    } else {
      btnCompactToggle.classList.add("hidden");
      screenSetup.classList.remove("hidden");
    }
  } else {
    // Open History: exit compact mode if currently compact
    if (isCompactMode) {
      setCompactMode(false);
    }
    btnCompactToggle.classList.add("hidden");
    screenSetup.classList.add("hidden");
    screenActive.classList.add("hidden");
    screenHistory.classList.remove("hidden");
    await loadHistory();
  }
});

btnCloseHistory.addEventListener("click", () => {
  btnHistoryToggle.click();
});

async function loadHistory() {
  historyContainer.innerHTML = "<p style='font-size: 11px; color: var(--text-muted);'>Loading history...</p>";
  try {
    const list = await invoke("get_history");
    if (!list.length) {
      historyContainer.innerHTML = "<p style='font-size: 11px; color: var(--text-muted);'>No past workdays recorded yet.</p>";
      return;
    }
    historyContainer.innerHTML = "";
    list.forEach((item) => {
      const card = document.createElement("div");
      card.className = "history-card";
      card.innerHTML = `
        <div class="history-header">
          <span>${item.date_str}</span>
          <span style="color: ${item.status === 'completed' ? 'var(--success)' : (item.status === 'discarded' ? 'var(--danger)' : 'var(--warning)')}; text-transform: capitalize;">
            ${item.status.replace('_', ' ')}
          </span>
        </div>
        <div class="history-meta">
          <span>Target: ${formatSeconds(item.target_seconds)} | Worked: ${formatSeconds(item.total_seconds)}</span>
          <button class="btn btn-xs btn-history-details" data-id="${item.id}">View Sessions (${item.session_count})</button>
        </div>
        <div class="history-detail-panel hidden" id="history-detail-${item.id}">
          <div class="history-actions" style="margin-bottom: 6px;">
            <button class="btn btn-xs btn-copy-history" data-id="${item.id}">📋 Copy Log</button>
          </div>
          <table class="session-table" style="margin-bottom: 4px;">
            <thead>
              <tr>
                <th>#</th>
                <th>Start</th>
                <th>End</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody id="history-tbody-${item.id}">
              <tr><td colspan="4" style="color: var(--text-muted);">Loading...</td></tr>
            </tbody>
          </table>
        </div>
      `;

      const btnDetails = card.querySelector(".btn-history-details");
      const detailPanel = card.querySelector(`#history-detail-${item.id}`);
      const tbody = card.querySelector(`#history-tbody-${item.id}`);
      const btnCopyHistory = card.querySelector(".btn-copy-history");

      let detailsLoaded = false;
      let dayData = null;

      btnDetails.addEventListener("click", async () => {
        const isHidden = detailPanel.classList.toggle("hidden");
        btnDetails.innerText = isHidden ? `View Sessions (${item.session_count})` : "Hide Sessions";

        if (!isHidden && !detailsLoaded) {
          try {
            dayData = await invoke("get_workday_details", { workdayId: item.id });
            tbody.innerHTML = "";
            if (!dayData.sessions.length) {
              tbody.innerHTML = '<tr><td colspan="4" style="color: var(--text-muted);">No sessions recorded.</td></tr>';
            } else {
              dayData.sessions.forEach((s, idx) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                  <td>${idx + 1}</td>
                  <td>${formatTimeString(s.start_time)}</td>
                  <td>${s.end_time ? formatTimeString(s.end_time) : (s.is_running ? "RUNNING" : "--")}</td>
                  <td>${formatSeconds(s.duration_seconds)}</td>
                `;
                tbody.appendChild(tr);
              });
            }
            detailsLoaded = true;
          } catch (e) {
            tbody.innerHTML = `<tr><td colspan="4" style="color: var(--danger);">Failed to load sessions: ${e}</td></tr>`;
          }
        }
      });

      btnCopyHistory.addEventListener("click", async () => {
        if (!dayData) {
          try {
            dayData = await invoke("get_workday_details", { workdayId: item.id });
          } catch (e) {
            showToast("Failed to load details");
            return;
          }
        }
        if (!dayData.sessions.length) {
          showToast("No sessions to copy");
          return;
        }
        let tsv = "#\tStart Time\tEnd Time\tDuration (s)\tDuration (formatted)\n";
        dayData.sessions.forEach((s, idx) => {
          tsv += `${idx + 1}\t${formatTimeString(s.start_time)}\t${formatTimeString(s.end_time)}\t${s.duration_seconds}\t${formatSeconds(s.duration_seconds)}\n`;
        });
        tsv += `\nDaily Target:\t${formatSeconds(dayData.workday.target_seconds)}\n`;
        tsv += `Total Completed:\t${formatSeconds(dayData.total_completed_seconds)}\n`;

        navigator.clipboard.writeText(tsv).then(() => {
          showToast(`Copied ${item.date_str} log to clipboard!`);
        });
      });

      historyContainer.appendChild(card);
    });
  } catch (err) {
    historyContainer.innerHTML = `<p style='color: var(--danger); font-size: 11px;'>Failed to load history: ${err}</p>`;
  }
}

// Global Shortcut Management
let currentShortcut = localStorage.getItem("work_timer_shortcut") || "F9";
const modalShortcut = document.getElementById("modal-shortcut");
const btnShortcutToggle = document.getElementById("btn-shortcut-toggle");
const inputShortcutKey = document.getElementById("input-shortcut-key");
const modalBtnShortcutSave = document.getElementById("modal-btn-shortcut-save");
const modalBtnShortcutCancel = document.getElementById("modal-btn-shortcut-cancel");
const modalBtnShortcutDisable = document.getElementById("modal-btn-shortcut-disable");

btnShortcutToggle.addEventListener("click", () => {
  if (isCompactMode) {
    setCompactMode(false);
  }
  inputShortcutKey.value = currentShortcut || "F9";
  modalShortcut.classList.remove("hidden");
  inputShortcutKey.focus();
});

// Interactive Keybind Recording: capture key presses directly when focused
inputShortcutKey.addEventListener("keydown", (e) => {
  e.preventDefault();
  e.stopPropagation();

  // Ignore bare modifier key presses
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
    return;
  }

  const parts = [];
  if (e.ctrlKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  // Format key name nicely
  let keyName = e.key;
  if (keyName.length === 1) {
    keyName = keyName.toUpperCase();
  } else if (keyName.startsWith("Arrow")) {
    keyName = keyName.replace("Arrow", "");
  }

  parts.push(keyName);
  inputShortcutKey.value = parts.join("+");
});

modalBtnShortcutCancel.addEventListener("click", () => {
  modalShortcut.classList.add("hidden");
});

modalShortcut.addEventListener("click", (e) => {
  if (e.target === modalShortcut) {
    modalShortcut.classList.add("hidden");
  }
});

modalBtnShortcutSave.addEventListener("click", async () => {
  const newKey = inputShortcutKey.value.trim();
  if (!newKey) {
    showToast("Please enter a valid key");
    return;
  }
  await registerGlobalShortcut(newKey);
  modalShortcut.classList.add("hidden");
});

modalBtnShortcutDisable.addEventListener("click", async () => {
  await unregisterGlobalShortcut();
  currentShortcut = "";
  localStorage.removeItem("work_timer_shortcut");
  modalShortcut.classList.add("hidden");
  showToast("Global shortcut disabled");
});

async function unregisterGlobalShortcut() {
  if (window.__TAURI_PLUGIN_GLOBAL_SHORTCUT__ && currentShortcut) {
    try {
      await window.__TAURI_PLUGIN_GLOBAL_SHORTCUT__.unregister(currentShortcut);
    } catch (e) {
      console.warn("Unregister error:", e);
    }
  }
}

async function registerGlobalShortcut(shortcutKey) {
  if (!window.__TAURI_PLUGIN_GLOBAL_SHORTCUT__) return;
  await unregisterGlobalShortcut();
  try {
    await window.__TAURI_PLUGIN_GLOBAL_SHORTCUT__.register(shortcutKey, (event) => {
      if (event.state === "Pressed") {
        // Toggle session when hotkey is pressed from anywhere (stays in compact mode if compact)
        if (btnToggleSession && !btnToggleSession.disabled) {
          btnToggleSession.click();
        }
      }
    });
    currentShortcut = shortcutKey;
    localStorage.setItem("work_timer_shortcut", shortcutKey);
    showToast(`Global hotkey set to ${shortcutKey}`);
  } catch (err) {
    console.error("Failed to register shortcut:", err);
    showToast(`Failed to register ${shortcutKey}: ${err}`);
  }
}

// ─── Updater ────────────────────────────────────────────────────────────────
const btnCheckUpdate = document.getElementById("btn-check-update");
const modalUpdate = document.getElementById("modal-update");
const updateVersionText = document.getElementById("update-version-text");
const updateBodyText = document.getElementById("update-body-text");
const modalBtnUpdateCancel = document.getElementById("modal-btn-update-cancel");
const modalBtnUpdateInstall = document.getElementById("modal-btn-update-install");

btnCheckUpdate.addEventListener("click", async () => {
  btnCheckUpdate.disabled = true;
  showToast("Checking for updates…");
  try {
    const result = await invoke("check_for_update");
    if (result.available) {
      updateVersionText.innerText = `Version ${result.version} is available.`;
      updateBodyText.innerText = result.body || "";
      modalUpdate.classList.remove("hidden");
    } else {
      showToast("You're on the latest version ✓");
    }
  } catch (err) {
    showToast("Update check failed: " + err);
  } finally {
    btnCheckUpdate.disabled = false;
  }
});

modalBtnUpdateCancel.addEventListener("click", () => {
  modalUpdate.classList.add("hidden");
});

modalUpdate.addEventListener("click", (e) => {
  if (e.target === modalUpdate) modalUpdate.classList.add("hidden");
});

modalBtnUpdateInstall.addEventListener("click", async () => {
  modalBtnUpdateInstall.disabled = true;
  modalBtnUpdateInstall.innerText = "Downloading…";
  try {
    await invoke("install_update");
    // App will restart automatically — no further action needed
  } catch (err) {
    showToast("Update failed: " + err);
    modalBtnUpdateInstall.disabled = false;
    modalBtnUpdateInstall.innerText = "Install & Restart";
  }
});

// ─── Initial App Boot ────────────────────────────────────────────────────────
async function initApp() {
  try {
    const state = await invoke("get_current_state", { currentWorkdayId: null });
    renderUI(state);
  } catch (err) {
    console.error("Init failed:", err);
  }

  // Register saved shortcut
  if (currentShortcut) {
    setTimeout(() => {
      registerGlobalShortcut(currentShortcut);
    }, 500);
  }
}

window.addEventListener("DOMContentLoaded", initApp);
