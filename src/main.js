// Tauri 2 invoke bridge & Window control
const { invoke } = window.__TAURI__.core;
const { getCurrentWindow } = window.__TAURI__.window;
const appWindow = getCurrentWindow();

// App State
let currentState = null;
let timerInterval = null;
let clockInterval = null;
let isAlwaysOnTop = true;
let isCompactMode = false;
let isCanadaMode = localStorage.getItem("work_timer_canada_mode") === "true";
let isSettingsOpen = false;
const CANADA_TIMEZONE = "America/Toronto";

// DOM Elements
const appRoot = document.getElementById("app-root");
const screenSetup = document.getElementById("screen-setup");
const screenActive = document.getElementById("screen-active");
const screenHistory = document.getElementById("screen-history");
const screenSettings = document.getElementById("screen-settings");

const canadaInfoBar = document.getElementById("canada-info-bar");
const canadaLiveTime = document.getElementById("canada-live-time");
const localLiveTime = document.getElementById("local-live-time");

const btnSettingsToggle = document.getElementById("btn-settings-toggle");
const btnCloseSettings = document.getElementById("btn-close-settings");
const toggleCanadaMode = document.getElementById("toggle-canada-mode");
const canadaPreviewNote = document.getElementById("canada-preview-note");
const canadaSettingsPreviewTime = document.getElementById("canada-settings-preview-time");
const settingsCurrentHotkey = document.getElementById("settings-current-hotkey");
const btnSettingsConfigureHotkey = document.getElementById("btn-settings-configure-hotkey");
const btnSettingsCheckUpdate = document.getElementById("btn-settings-check-update");

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
const btnAddTodaySession = document.getElementById("btn-add-today-session");

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

// Edit Session Modal Elements
const modalEditSession = document.getElementById("modal-edit-session");
const editSessionModalTitle = document.getElementById("edit-session-modal-title");
const editSessionModalMsg = document.getElementById("edit-session-modal-msg");
const inputEditDate = document.getElementById("input-edit-date");
const inputEditStart = document.getElementById("input-edit-start");
const inputEditEndDate = document.getElementById("input-edit-end-date");
const inputEditEnd = document.getElementById("input-edit-end");
const groupEditEnd = document.getElementById("group-edit-end");
const editRunningHint = document.getElementById("edit-running-hint");
const editValidationError = document.getElementById("edit-validation-error");
const modalBtnEditCancel = document.getElementById("modal-btn-edit-cancel");
const modalBtnEditSave = document.getElementById("modal-btn-edit-save");
let editingSessionContext = null;

// Preview Session Modal Elements
const modalPreviewSession = document.getElementById("modal-preview-session");
const previewSessionNum = document.getElementById("preview-session-num");
const previewStartDt = document.getElementById("preview-start-dt");
const previewEndDt = document.getElementById("preview-end-dt");
const previewDuration = document.getElementById("preview-duration");
const modalBtnPreviewClose = document.getElementById("modal-btn-preview-close");

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

// Format time without seconds in 12-hour AM/PM format (e.g. "5:35 AM")
function formatTimeWithoutSeconds(isoString, timeZone = null) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";

  const options = {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };
  if (timeZone) {
    options.timeZone = timeZone;
  }
  return new Intl.DateTimeFormat("en-US", options).format(d);
}

// Format date as M/D/YYYY (e.g. "10/30/2026")
function formatDocDate(isoString, fallbackDateStr, timeZone = null) {
  let d = null;
  if (isoString) {
    const parsed = new Date(isoString);
    if (!isNaN(parsed.getTime())) d = parsed;
  }
  if (!d && fallbackDateStr) {
    const parts = fallbackDateStr.trim().split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      d = new Date(year, month, day);
    } else {
      const parsed = new Date(fallbackDateStr);
      if (!isNaN(parsed.getTime())) d = parsed;
    }
  }
  if (!d || isNaN(d.getTime())) return "";

  if (timeZone) {
    const options = { month: "numeric", day: "numeric", year: "numeric", timeZone };
    const parts = new Intl.DateTimeFormat("en-US", options).formatToParts(d);
    let m = "", day = "", y = "";
    for (const p of parts) {
      if (p.type === "month") m = p.value;
      if (p.type === "day") day = p.value;
      if (p.type === "year") y = p.value;
    }
    return `${m}/${day}/${y}`;
  }

  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

// Copy session data formatted for Google Docs table (Login, Logout, Time/Date Ended)
async function copySessionForDoc(session) {
  if (!session || session.is_running || !session.end_time) {
    showToast("Session must be completed to copy for Docs");
    return;
  }

  const tz = isCanadaMode ? CANADA_TIMEZONE : null;
  const loginTime = formatTimeWithoutSeconds(session.start_time, tz);
  const logoutTime = formatTimeWithoutSeconds(session.end_time, tz);
  const endDateStr = formatDocDate(session.end_time, session.end_date_str || session.date_str, tz);
  const timeDateEnded = `${logoutTime} ${endDateStr}`.trim();

  const plainText = `${loginTime}\t${logoutTime}\t${timeDateEnded}`;
  const cellStyle = "border: 1pt solid #000000; padding: 4pt 6pt;";
  const htmlTable = `<table border="1" style="border-collapse: collapse; border: 1pt solid #000000;"><tbody><tr><td style="${cellStyle}">${loginTime}</td><td style="${cellStyle}">${logoutTime}</td><td style="${cellStyle}">${timeDateEnded}</td></tr></tbody></table>`;

  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const htmlBlob = new Blob([htmlTable], { type: "text/html" });
      const textBlob = new Blob([plainText], { type: "text/plain" });
      const clipboardItem = new ClipboardItem({
        "text/html": htmlBlob,
        "text/plain": textBlob,
      });
      await navigator.clipboard.write([clipboardItem]);
    } else {
      await navigator.clipboard.writeText(plainText);
    }
    showToast(`Copied for Doc! (${loginTime}, ${logoutTime}, ${timeDateEnded})`);
  } catch (err) {
    console.warn("ClipboardItem failed, using fallback:", err);
    try {
      await navigator.clipboard.writeText(plainText);
      showToast(`Copied for Doc! (${loginTime}, ${logoutTime})`);
    } catch (e) {
      showToast("Failed to copy to clipboard: " + e);
    }
  }
}

// 12-Hour format with AM/PM (e.g. "10:00:45 PM")
function formatTimeString(isoString, timeZone = null) {
  if (!isoString) return "--:--:--";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "--:--:--";
  
  const options = {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  };
  if (timeZone) {
    options.timeZone = timeZone;
  }
  return new Intl.DateTimeFormat("en-US", options).format(d);
}

// Format date and time for live banners (e.g. "Fri, Oct 30, 2026 • 10:00:45 PM")
function formatFullDateTime(d = new Date(), timeZone = null) {
  const options = {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  };
  if (timeZone) {
    options.timeZone = timeZone;
  }
  return new Intl.DateTimeFormat("en-US", options).format(d).replace(", ", " • ");
}

// Workday title date format: "Friday, October 30, 2026"
function getFormattedWorkdayDate(d = new Date(), timeZone = null) {
  const options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  if (timeZone) {
    options.timeZone = timeZone;
  }
  return new Intl.DateTimeFormat("en-US", options).format(d);
}

// ISO YYYY-MM-DD in target timezone
function getDateStrForZone(d = new Date(), timeZone = null) {
  const options = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  };
  if (timeZone) {
    options.timeZone = timeZone;
  }
  const parts = new Intl.DateTimeFormat("en-US", options).formatToParts(d);
  let year = "";
  let month = "";
  let day = "";
  for (const p of parts) {
    if (p.type === "year") year = p.value;
    if (p.type === "month") month = p.value;
    if (p.type === "day") day = p.value;
  }
  return `${year}-${month}-${day}`;
}

// Build RFC3339 string representing the exact target timezone
function getRfc3339ForDate(d = new Date(), timeZone = null) {
  if (!timeZone) {
    // Return standard local RFC3339 with local offset
    return buildIsoFromDateAndTime(
      toInputDateValue(d.toISOString()),
      `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
    );
  }

  // Get parts in target timezone
  const options = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "shortOffset",
    timeZone,
  };
  const parts = new Intl.DateTimeFormat("en-US", options).formatToParts(d);
  let year = "", month = "", day = "", hour = "", minute = "", second = "", offset = "";
  for (const p of parts) {
    if (p.type === "year") year = p.value;
    if (p.type === "month") month = p.value;
    if (p.type === "day") day = p.value;
    if (p.type === "hour") hour = p.value;
    if (p.type === "minute") minute = p.value;
    if (p.type === "second") second = p.value;
    if (p.type === "timeZoneName") offset = p.value; // e.g. "GMT-4" or "GMT-5"
  }

  // Convert offset like "GMT-4" or "GMT-04:00" to "-04:00"
  let rfcOffset = "+00:00";
  if (offset.includes("GMT")) {
    const raw = offset.replace("GMT", "").trim();
    if (!raw) {
      rfcOffset = "+00:00";
    } else {
      const sign = raw.startsWith("-") ? "-" : "+";
      const numPart = raw.replace(/[+-]/, "");
      if (numPart.includes(":")) {
        const [h, m] = numPart.split(":");
        rfcOffset = `${sign}${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
      } else {
        rfcOffset = `${sign}${numPart.padStart(2, "0")}:00`;
      }
    }
  }

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${rfcOffset}`;
}

// Live Clock for Canada and Local times
function updateDualClockDisplay() {
  const now = new Date();
  const canadaStr = formatFullDateTime(now, CANADA_TIMEZONE);
  const localStr = formatFullDateTime(now);

  if (canadaLiveTime) canadaLiveTime.innerText = canadaStr;
  if (localLiveTime) localLiveTime.innerText = localStr;
  if (canadaSettingsPreviewTime) canadaSettingsPreviewTime.innerText = canadaStr;
}

function startClockTimer() {
  if (clockInterval) clearInterval(clockInterval);
  updateDualClockDisplay();
  clockInterval = setInterval(updateDualClockDisplay, 1000);
}

// Compact date format DD/MM/YY (e.g. 29/10/26)
function formatCompactDate(isoString, fallbackDateStr, timeZone = null) {
  let d = null;
  if (isoString) {
    const parsed = new Date(isoString);
    if (!isNaN(parsed.getTime())) {
      d = parsed;
    }
  }
  if (!d && fallbackDateStr) {
    const parts = fallbackDateStr.trim().split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      d = new Date(year, month, day);
    } else {
      const parsed = new Date(fallbackDateStr);
      if (!isNaN(parsed.getTime())) d = parsed;
    }
  }
  if (!d || isNaN(d.getTime())) return "--/--/--";

  if (timeZone) {
    const options = { day: "2-digit", month: "2-digit", year: "2-digit", timeZone };
    const parts = new Intl.DateTimeFormat("en-GB", options).formatToParts(d);
    let dd = "", mm = "", yy = "";
    for (const p of parts) {
      if (p.type === "day") dd = p.value;
      if (p.type === "month") mm = p.value;
      if (p.type === "year") yy = p.value;
    }
    return `${dd}/${mm}/${yy}`;
  }

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

// Form input date YYYY-MM-DD
function toInputDateValue(isoString, fallbackDateStr) {
  if (fallbackDateStr && /^\d{4}-\d{2}-\d{2}$/.test(fallbackDateStr.trim())) {
    return fallbackDateStr.trim();
  }
  let d = isoString ? new Date(isoString) : null;
  if (!d || isNaN(d.getTime())) {
    if (fallbackDateStr) {
      d = new Date(fallbackDateStr);
    }
  }
  if (!d || isNaN(d.getTime())) {
    d = new Date();
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalTimeInputValue(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  const secs = String(d.getSeconds()).padStart(2, "0");
  return `${hours}:${mins}:${secs}`;
}

function buildIsoFromDateAndTime(dateStr, timeStr) {
  // dateStr is YYYY-MM-DD, timeStr is HH:MM or HH:MM:SS
  const timeParts = timeStr.split(":");
  const h = parseInt(timeParts[0], 10) || 0;
  const m = parseInt(timeParts[1], 10) || 0;
  const s = parseInt(timeParts[2], 10) || 0;

  const dateParts = dateStr.split("-");
  const year = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10) - 1;
  const day = parseInt(dateParts[2], 10);

  const d = new Date(year, month, day, h, m, s);
  
  // Format to local ISO-like string with timezone offset for chrono RFC3339 compatibility
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hours = pad(d.getHours());
  const mins = pad(d.getMinutes());
  const secs = pad(d.getSeconds());

  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const absOffset = Math.abs(offset);
  const offH = pad(Math.floor(absOffset / 60));
  const offM = pad(absOffset % 60);

  return `${yyyy}-${mm}-${dd}T${hours}:${mins}:${secs}${sign}${offH}:${offM}`;
}

// Edit Session Modal Handler
function openEditSessionModal(session, onSaveSuccess, sessionNum = 1) {
  editingSessionContext = { mode: "edit", session, onSaveSuccess, sessionNum };
  editSessionModalTitle.innerText = "Edit Session";
  editSessionModalMsg.innerText = "Modify start and end dates and times for this session:";
  editValidationError.classList.add("hidden");
  editValidationError.innerText = "";

  inputEditDate.value = toInputDateValue(session.start_time, session.date_str);
  inputEditStart.value = toLocalTimeInputValue(session.start_time);

  if (session.is_running) {
    inputEditEndDate.disabled = true;
    inputEditEnd.disabled = true;
    inputEditEndDate.value = "";
    inputEditEnd.value = "";
    editRunningHint.style.display = "block";
  } else {
    inputEditEndDate.disabled = false;
    inputEditEnd.disabled = false;
    inputEditEndDate.value = toInputDateValue(session.end_time, session.end_date_str || session.date_str);
    inputEditEnd.value = toLocalTimeInputValue(session.end_time);
    editRunningHint.style.display = "none";
  }

  modalEditSession.classList.remove("hidden");
  inputEditStart.focus();
}

// Add Session Modal Handler (Manual entry to past/active workday)
function openAddSessionModal(workdayId, onSaveSuccess) {
  editingSessionContext = { mode: "add", workdayId, onSaveSuccess };
  editSessionModalTitle.innerText = "Add Session";
  editSessionModalMsg.innerText = "Enter the start and end dates and times for the new session:";
  editValidationError.classList.add("hidden");
  editValidationError.innerText = "";

  const todayStr = new Date().toISOString().slice(0, 10);
  inputEditDate.value = todayStr;
  inputEditStart.value = "09:00:00";
  inputEditEndDate.disabled = false;
  inputEditEnd.disabled = false;
  inputEditEndDate.value = todayStr;
  inputEditEnd.value = "10:00:00";
  editRunningHint.style.display = "none";

  modalEditSession.classList.remove("hidden");
  inputEditStart.focus();
}

modalBtnEditCancel.addEventListener("click", () => {
  modalEditSession.classList.add("hidden");
  editingSessionContext = null;
});

modalEditSession.addEventListener("click", (e) => {
  if (e.target === modalEditSession) {
    modalEditSession.classList.add("hidden");
    editingSessionContext = null;
  }
});

modalBtnEditSave.addEventListener("click", async () => {
  if (!editingSessionContext) return;
  const isAdd = editingSessionContext.mode === "add";
  const { session, workdayId, onSaveSuccess } = editingSessionContext;
  const targetWorkdayId = isAdd ? workdayId : session.workday_id;

  const startDateVal = inputEditDate.value.trim();
  const startTimeVal = inputEditStart.value.trim();
  const endDateVal = inputEditEndDate.value.trim();
  const endTimeVal = inputEditEnd.value.trim();

  const showEditError = (msg) => {
    editValidationError.innerText = msg;
    editValidationError.classList.remove("hidden");
  };

  if (!startDateVal) {
    showEditError("Please select a valid start date.");
    return;
  }
  if (!startTimeVal) {
    showEditError("Please enter a valid start time.");
    return;
  }

  const startIso = buildIsoFromDateAndTime(startDateVal, startTimeVal);
  const startDt = new Date(startIso);
  const now = new Date();

  // Error Prevention: Start time in future
  if (startDt.getTime() > now.getTime()) {
    showEditError("Start time cannot be set in the future.");
    return;
  }

  let endIso = null;
  let newDuration = 0;

  if (!isAdd && session && session.is_running) {
    newDuration = Math.max(0, Math.floor((now.getTime() - startDt.getTime()) / 1000));
  } else {
    if (!endDateVal) {
      showEditError("Please select a valid end date.");
      return;
    }
    if (!endTimeVal) {
      showEditError("Please enter a valid end time.");
      return;
    }
    endIso = buildIsoFromDateAndTime(endDateVal, endTimeVal);
    const endDt = new Date(endIso);

    // Error Prevention: End time earlier than start time
    if (endDt.getTime() < startDt.getTime()) {
      showEditError("End date & time cannot be earlier than start date & time.");
      return;
    }

    // Error Prevention: Session duration exceeds 24 hours
    const diffSec = Math.floor((endDt.getTime() - startDt.getTime()) / 1000);
    if (diffSec > 86400) {
      showEditError("Session duration cannot exceed 24 hours (86,400s).");
      return;
    }
    newDuration = diffSec;
  }

  // Error Prevention / Warning: session duration vs target
  if (currentState && currentState.workday && currentState.workday.id === targetWorkdayId) {
    const oldDuration = (!isAdd && session) ? (session.duration_seconds || 0) : 0;
    const durationDelta = newDuration - oldDuration;
    const currentCompleted = currentState.total_completed_seconds || 0;
    const projectedCompleted = currentCompleted + durationDelta;
    const target = currentState.workday.target_seconds || 0;

    if (projectedCompleted > 86400) {
      showEditError("Total completed workday time cannot exceed 24 hours.");
      return;
    }

    if (target > 0 && newDuration > target) {
      const confirmExceed = await confirmModal(
        `This session (${formatSeconds(newDuration)}) exceeds the entire daily target of ${formatSeconds(target)}. Do you want to proceed?`,
        "Exceeds Target Warning"
      );
      if (!confirmExceed) {
        return;
      }
    }
  }

  try {
    modalBtnEditSave.disabled = true;
    if (isAdd) {
      await invoke("add_session_to_workday", {
        workdayId: targetWorkdayId,
        startTime: startIso,
        endTime: endIso,
        dateStr: startDateVal,
        endDateStr: endDateVal,
      });
      showToast("New session added successfully!");
    } else {
      await invoke("update_session", {
        sessionId: session.id,
        startTime: startIso,
        endTime: endIso,
        dateStr: startDateVal,
        endDateStr: session.is_running ? null : endDateVal,
      });
      showToast("Session updated successfully!");
    }
    modalEditSession.classList.add("hidden");
    editingSessionContext = null;
    if (onSaveSuccess) {
      await onSaveSuccess();
    }
  } catch (err) {
    showEditError(String(err));
  } finally {
    modalBtnEditSave.disabled = false;
  }
});

// Preview Session Modal Handler
function openPreviewSessionModal(session, sessionIndex) {
  previewSessionNum.innerText = `#${sessionIndex}`;

  const tz = isCanadaMode ? CANADA_TIMEZONE : null;
  const startDateFormatted = formatCompactDate(session.start_time, session.date_str, tz);
  const startTimeFormatted = formatTimeString(session.start_time, tz);
  previewStartDt.innerText = `${startDateFormatted}  ${startTimeFormatted}`;

  if (session.is_running) {
    previewEndDt.innerText = "RUNNING (Active now)";
    previewDuration.innerText = formatSeconds(session.duration_seconds) + " (live)";
  } else {
    const endDateFormatted = formatCompactDate(session.end_time, session.end_date_str || session.date_str, tz);
    const endTimeFormatted = formatTimeString(session.end_time, tz);
    previewEndDt.innerText = `${endDateFormatted}  ${endTimeFormatted}`;
    previewDuration.innerText = formatSeconds(session.duration_seconds);
  }

  modalPreviewSession.classList.remove("hidden");
}

modalBtnPreviewClose.addEventListener("click", () => {
  modalPreviewSession.classList.add("hidden");
});

modalPreviewSession.addEventListener("click", (e) => {
  if (e.target === modalPreviewSession) {
    modalPreviewSession.classList.add("hidden");
  }
});

function computeWorkdayBadge(status, totalSeconds, targetSeconds) {
  if (status === "discarded") {
    return { label: "Discarded", cls: "status-discarded" };
  }
  if (status === "active") {
    return { label: "Active", cls: "status-active" };
  }
  if (status === "ended_early") {
    return { label: "Ended Early", cls: "status-ended_early" };
  }
  
  // Status is completed or checking against target
  if (targetSeconds > 0) {
    const totalMinutes = Math.floor(totalSeconds / 60);
    const targetMinutes = Math.floor(targetSeconds / 60);

    if (totalMinutes > targetMinutes) {
      return { label: "Overtime", cls: "status-overtime" };
    } else if (totalMinutes === targetMinutes) {
      return { label: "Completed", cls: "status-completed" };
    } else {
      // Completed early
      return { label: "Ended Early", cls: "status-ended_early" };
    }
  }

  return { label: "Completed", cls: "status-completed" };
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

// Compact Sticky Mode Toggle
async function setCompactMode(enable) {
  if (isCompactMode === enable) return;
  isCompactMode = enable;
  document.body.classList.toggle("compact-mode", isCompactMode);
  btnCompactToggle.classList.toggle("active", isCompactMode);

  try {
    if (isCompactMode) {
      await invoke("resize_window", { width: 400, height: 125 });
    } else {
      await invoke("resize_window", { width: 400, height: 520 });
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

  // Toggle Canada info bar under title bar if Canada mode is enabled
  if (isCanadaMode) {
    canadaInfoBar.classList.remove("hidden");
  } else {
    canadaInfoBar.classList.add("hidden");
  }

  // If settings is open, only update the live data (timers) — don't rearrange screens
  if (isSettingsOpen) {
    if (state.workday && state.workday.status === "active") {
      const isRunning = !!state.active_session;
      if (isRunning) {
        globalStatusDot.className = "status-dot active";
        displayCurrentSession.innerText = formatSeconds(state.active_session.duration_seconds);
      } else {
        globalStatusDot.className = "status-dot paused";
      }
      displayRemaining.innerText = formatSeconds(state.remaining_seconds);
      displayCompleted.innerText = formatSeconds(state.total_completed_seconds);
    }
    return;
  }

  if (state.workday && state.workday.status === "active") {
    // Show Screen B (Active Workday)
    btnCompactToggle.classList.remove("hidden");
    screenSetup.classList.add("hidden");
    screenHistory.classList.add("hidden");
    screenSettings.classList.add("hidden");
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

    // Sessions table: Shows #, Duration, and Actions (Doc Copy + Preview Details + Edit)
    sessionCount.innerText = state.sessions.length;
    sessionTbody.innerHTML = "";
    state.sessions.forEach((s, idx) => {
      const isRunning = s.is_running || !s.end_time;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${formatSeconds(s.duration_seconds)}</td>
        <td>
          <div class="session-actions-cell">
            <button class="btn-icon-cell btn-copy-doc-session" title="${isRunning ? "Session is running" : "Copy for Docs (Login, Logout, Ended)"}" data-session-id="${s.id}" ${isRunning ? "disabled" : ""}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="3" y1="9" x2="21" y2="9"></line>
                <line x1="3" y1="15" x2="21" y2="15"></line>
                <line x1="9" y1="3" x2="9" y2="21"></line>
                <line x1="15" y1="3" x2="15" y2="21"></line>
              </svg>
            </button>
            <button class="btn-icon-cell btn-preview-session" title="Preview details (Date, Start & End times)" data-session-id="${s.id}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
            <button class="btn-icon-cell btn-edit-session" title="Edit session times" data-session-id="${s.id}">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            </button>
          </div>
        </td>
      `;

      const btnCopyDoc = tr.querySelector(".btn-copy-doc-session");
      if (btnCopyDoc && !isRunning) {
        btnCopyDoc.addEventListener("click", () => {
          copySessionForDoc(s);
        });
      }

      const btnPreview = tr.querySelector(".btn-preview-session");
      btnPreview.addEventListener("click", () => {
        openPreviewSessionModal(s, idx + 1);
      });

      const btnEdit = tr.querySelector(".btn-edit-session");
      btnEdit.addEventListener("click", () => {
        openEditSessionModal(s, async () => {
          const updated = await invoke("get_current_state", { currentWorkdayId: state.workday.id });
          renderUI(updated);
        }, idx + 1);
      });

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
    screenSettings.classList.add("hidden");
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
    const now = new Date();
    const customDateStr = isCanadaMode ? getFormattedWorkdayDate(now, CANADA_TIMEZONE) : null;
    const customCreatedAt = isCanadaMode ? getRfc3339ForDate(now, CANADA_TIMEZONE) : null;

    const newState = await invoke("start_day", {
      targetHours: h,
      targetMinutes: m,
      customDateStr,
      customCreatedAt,
    });
    renderUI(newState);
  } catch (err) {
    showToast(String(err));
  }
});

btnToggleSession.addEventListener("click", async () => {
  if (!currentState || !currentState.workday) return;
  const isRunning = !!currentState.active_session;
  try {
    const now = new Date();
    let newState;
    if (isRunning) {
      const customEndTime = isCanadaMode ? getRfc3339ForDate(now, CANADA_TIMEZONE) : null;
      const customEndDateStr = isCanadaMode ? getDateStrForZone(now, CANADA_TIMEZONE) : null;
      newState = await invoke("stop_session", {
        workdayId: currentState.workday.id,
        customEndTime,
        customEndDateStr,
      });
    } else {
      const customStartTime = isCanadaMode ? getRfc3339ForDate(now, CANADA_TIMEZONE) : null;
      const customDateStr = isCanadaMode ? getDateStrForZone(now, CANADA_TIMEZONE) : null;
      newState = await invoke("start_session", {
        workdayId: currentState.workday.id,
        customStartTime,
        customDateStr,
      });
    }
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
    const totalMinutes = Math.floor((currentState.total_completed_seconds || 0) / 60);
    const targetMinutes = Math.floor((currentState.workday.target_seconds || 0) / 60);
    const status = totalMinutes >= targetMinutes ? "completed" : "ended_early";
    const now = new Date();
    const customCompletedAt = isCanadaMode ? getRfc3339ForDate(now, CANADA_TIMEZONE) : null;
    const customEndDateStr = isCanadaMode ? getDateStrForZone(now, CANADA_TIMEZONE) : null;

    await invoke("finish_day", {
      workdayId: currentState.workday.id,
      status,
      customCompletedAt,
      customEndDateStr,
    });
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

// Add manual session to today
if (btnAddTodaySession) {
  btnAddTodaySession.addEventListener("click", () => {
    if (!currentState || !currentState.workday) return;
    openAddSessionModal(currentState.workday.id, async () => {
      const updated = await invoke("get_current_state", { currentWorkdayId: currentState.workday.id });
      renderUI(updated);
    });
  });
}

// Copy TSV log for spreadsheets
btnCopyLog.addEventListener("click", () => {
  if (!currentState || !currentState.sessions.length) {
    showToast("No sessions to copy");
    return;
  }
  const tz = isCanadaMode ? CANADA_TIMEZONE : null;
  let tsv = "#\tStart Date\tStart Time\tEnd Date\tEnd Time\tDuration (s)\tDuration (formatted)\n";
  currentState.sessions.forEach((s, idx) => {
    const startDateVal = formatCompactDate(s.start_time, s.date_str, tz);
    const endDateVal = s.end_time
      ? formatCompactDate(s.end_time, s.end_date_str || s.date_str, tz)
      : (s.is_running ? "RUNNING" : "--/--/--");
    const startTimeVal = formatTimeString(s.start_time, tz);
    const endTimeVal = s.end_time ? formatTimeString(s.end_time, tz) : (s.is_running ? "RUNNING" : "--:--:--");

    tsv += `${idx + 1}\t${startDateVal}\t${startTimeVal}\t${endDateVal}\t${endTimeVal}\t${s.duration_seconds}\t${formatSeconds(s.duration_seconds)}\n`;
  });
  tsv += `\nDaily Target:\t${formatSeconds(currentState.workday.target_seconds)}\n`;
  tsv += `Total Completed:\t${formatSeconds(currentState.total_completed_seconds)}\n`;

  navigator.clipboard.writeText(tsv).then(() => {
    showToast(`Copied TSV to clipboard!${isCanadaMode ? " (Canada ET)" : ""}`);
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
    screenSettings.classList.add("hidden");
    screenHistory.classList.remove("hidden");
    await loadHistory();
  }
});

btnCloseHistory.addEventListener("click", () => {
  btnHistoryToggle.click();
});

// Settings Screen
function openSettingsScreen() {
  if (isCompactMode) {
    setCompactMode(false);
  }
  isSettingsOpen = true;
  btnCompactToggle.classList.add("hidden");
  screenSetup.classList.add("hidden");
  screenActive.classList.add("hidden");
  screenHistory.classList.add("hidden");
  screenSettings.classList.remove("hidden");

  // Sync settings UI controls
  toggleCanadaMode.checked = isCanadaMode;
  canadaPreviewNote.classList.toggle("hidden", !isCanadaMode);
  settingsCurrentHotkey.innerText = currentShortcut || "None (Disabled)";
  updateDualClockDisplay();
}

function closeSettingsScreen() {
  isSettingsOpen = false;
  screenSettings.classList.add("hidden");
  if (currentState && currentState.workday && currentState.workday.status === "active") {
    btnCompactToggle.classList.remove("hidden");
    screenActive.classList.remove("hidden");
  } else {
    btnCompactToggle.classList.add("hidden");
    screenSetup.classList.remove("hidden");
  }
}

btnSettingsToggle.addEventListener("click", () => {
  const isCurrentlyOpen = !screenSettings.classList.contains("hidden");
  if (isCurrentlyOpen) {
    closeSettingsScreen();
  } else {
    openSettingsScreen();
  }
});

btnCloseSettings.addEventListener("click", closeSettingsScreen);

toggleCanadaMode.addEventListener("change", (e) => {
  isCanadaMode = e.target.checked;
  localStorage.setItem("work_timer_canada_mode", isCanadaMode ? "true" : "false");
  canadaPreviewNote.classList.toggle("hidden", !isCanadaMode);

  if (isCanadaMode) {
    canadaInfoBar.classList.remove("hidden");
    showToast("Canada Mode enabled (ET - Toronto)");
  } else {
    canadaInfoBar.classList.add("hidden");
    showToast("Canada Mode disabled (Local Windows time)");
  }

  // Update clock & header
  updateDualClockDisplay();
});

btnSettingsConfigureHotkey.addEventListener("click", () => {
  inputShortcutKey.value = currentShortcut || "F9";
  modalShortcut.classList.remove("hidden");
  inputShortcutKey.focus();
});

btnSettingsCheckUpdate.addEventListener("click", async () => {
  btnSettingsCheckUpdate.disabled = true;
  showToast("Checking for updates…");
  try {
    const result = await invoke("check_for_update");
    if (result.available) {
      const modeLabel = result.is_portable ? " (Portable)" : "";
      updateVersionText.innerText = `Version ${result.version}${modeLabel} is available.`;
      updateBodyText.innerText = result.body || "";
      modalBtnUpdateInstall.innerText = result.is_portable ? "Update & Restart" : "Install & Restart";
      modalUpdate.classList.remove("hidden");
    } else {
      showToast("You're on the latest version ✓");
    }
  } catch (err) {
    showToast("Update check failed: " + err);
  } finally {
    btnSettingsCheckUpdate.disabled = false;
  }
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
      const badge = computeWorkdayBadge(item.status, item.total_seconds, item.target_seconds);
      const isDiscarded = item.status === "discarded";

      card.innerHTML = `
        <div class="history-header">
          <span>${item.date_str}</span>
          <span class="status-badge ${badge.cls}">
            ${badge.label}
          </span>
        </div>
        <div class="history-meta">
          <span>Target: ${formatSeconds(item.target_seconds)} | Worked: ${formatSeconds(item.total_seconds)}</span>
          <div style="display: flex; gap: 4px; align-items: center;">
            ${!isDiscarded ? `<button class="btn btn-xs btn-add-history-session" title="Add session to this workday" data-id="${item.id}">+ Add Session</button>` : ''}
            <button class="btn btn-xs btn-history-details" data-id="${item.id}">View Sessions (${item.session_count})</button>
          </div>
        </div>
        <div class="history-detail-panel hidden" id="history-detail-${item.id}">
          <div class="history-actions" style="margin-bottom: 6px;">
            <button class="btn btn-xs btn-copy-history" data-id="${item.id}">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:3px"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>Copy Log
            </button>
            ${!isDiscarded ? `<button class="btn btn-xs btn-resume-workday" data-id="${item.id}">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="vertical-align:middle;margin-right:3px"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>Resume as Active
            </button>` : ''}
          </div>
          <table class="session-table" style="margin-bottom: 4px;">
            <thead>
              <tr>
                <th style="width: 28px;">#</th>
                <th>Duration</th>
                <th style="width: 78px; text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody id="history-tbody-${item.id}">
              <tr><td colspan="3" style="color: var(--text-muted);">Loading...</td></tr>
            </tbody>
          </table>
        </div>
      `;

      const btnDetails = card.querySelector(".btn-history-details");
      const detailPanel = card.querySelector(`#history-detail-${item.id}`);
      const tbody = card.querySelector(`#history-tbody-${item.id}`);
      const btnCopyHistory = card.querySelector(".btn-copy-history");
      const btnAddHistorySession = card.querySelector(".btn-add-history-session");
      const btnResumeWorkday = card.querySelector(".btn-resume-workday");

      if (btnAddHistorySession) {
        btnAddHistorySession.addEventListener("click", () => {
          openAddSessionModal(item.id, async () => {
            await loadHistory();
          });
        });
      }

      if (btnResumeWorkday) {
        btnResumeWorkday.addEventListener("click", async () => {
          const confirmed = await confirmModal(
            `Resume ${item.date_str} as your currently active workday?`,
            "Resume Workday"
          );
          if (confirmed) {
            try {
              const state = await invoke("resume_workday", { workdayId: item.id });
              screenHistory.classList.add("hidden");
              renderUI(state);
              showToast("Workday resumed as active!");
            } catch (err) {
              showToast(String(err));
            }
          }
        });
      }

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
              tbody.innerHTML = '<tr><td colspan="3" style="color: var(--text-muted);">No sessions recorded.</td></tr>';
            } else {
              dayData.sessions.forEach((s, idx) => {
                const isRunning = s.is_running || !s.end_time;
                const tr = document.createElement("tr");
                tr.innerHTML = `
                  <td>${idx + 1}</td>
                  <td>${formatSeconds(s.duration_seconds)}</td>
                  <td>
                    <div class="session-actions-cell">
                      <button class="btn-icon-cell btn-history-copy-doc-session" title="${isRunning ? "Session is running" : "Copy for Docs (Login, Logout, Ended)"}" data-session-id="${s.id}" ${isRunning ? "disabled" : ""}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                          <line x1="3" y1="9" x2="21" y2="9"></line>
                          <line x1="3" y1="15" x2="21" y2="15"></line>
                          <line x1="9" y1="3" x2="9" y2="21"></line>
                          <line x1="15" y1="3" x2="15" y2="21"></line>
                        </svg>
                      </button>
                      <button class="btn-icon-cell btn-history-preview-session" title="Preview details (Date, Start & End times)" data-session-id="${s.id}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      </button>
                      <button class="btn-icon-cell btn-history-edit-session" title="Edit session times" data-session-id="${s.id}">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M12 20h9"></path>
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                        </svg>
                      </button>
                    </div>
                  </td>
                `;

                const btnCopyDoc = tr.querySelector(".btn-history-copy-doc-session");
                if (btnCopyDoc && !isRunning) {
                  btnCopyDoc.addEventListener("click", () => {
                    copySessionForDoc(s);
                  });
                }

                const btnPreview = tr.querySelector(".btn-history-preview-session");
                btnPreview.addEventListener("click", () => {
                  openPreviewSessionModal(s, idx + 1);
                });

                const btnEdit = tr.querySelector(".btn-history-edit-session");
                btnEdit.addEventListener("click", () => {
                  openEditSessionModal(s, async () => {
                    dayData = await invoke("get_workday_details", { workdayId: item.id });
                    await loadHistory();
                  }, idx + 1);
                });

                tbody.appendChild(tr);
              });
            }
            detailsLoaded = true;
          } catch (e) {
            tbody.innerHTML = `<tr><td colspan="3" style="color: var(--danger);">Failed to load sessions: ${e}</td></tr>`;
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
        const tz = isCanadaMode ? CANADA_TIMEZONE : null;
        let tsv = "#\tStart Date\tStart Time\tEnd Date\tEnd Time\tDuration (s)\tDuration (formatted)\n";
        dayData.sessions.forEach((s, idx) => {
          const startDateVal = formatCompactDate(s.start_time, s.date_str, tz);
          const endDateVal = s.end_time
            ? formatCompactDate(s.end_time, s.end_date_str || s.date_str, tz)
            : (s.is_running ? "RUNNING" : "--/--/--");
          const startTimeVal = formatTimeString(s.start_time, tz);
          const endTimeVal = s.end_time ? formatTimeString(s.end_time, tz) : (s.is_running ? "RUNNING" : "--:--:--");

          tsv += `${idx + 1}\t${startDateVal}\t${startTimeVal}\t${endDateVal}\t${endTimeVal}\t${s.duration_seconds}\t${formatSeconds(s.duration_seconds)}\n`;
        });
        tsv += `\nDaily Target:\t${formatSeconds(dayData.workday.target_seconds)}\n`;
        tsv += `Total Completed:\t${formatSeconds(dayData.total_completed_seconds)}\n`;

        navigator.clipboard.writeText(tsv).then(() => {
          showToast(`Copied ${item.date_str} log to clipboard!${isCanadaMode ? " (Canada ET)" : ""}`);
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
const inputShortcutKey = document.getElementById("input-shortcut-key");
const modalBtnShortcutSave = document.getElementById("modal-btn-shortcut-save");
const modalBtnShortcutCancel = document.getElementById("modal-btn-shortcut-cancel");
const modalBtnShortcutDisable = document.getElementById("modal-btn-shortcut-disable");

// The shortcut modal is opened from Settings > Configure Key (btnSettingsConfigureHotkey)
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
  settingsCurrentHotkey.innerText = newKey;
  modalShortcut.classList.add("hidden");
});

modalBtnShortcutDisable.addEventListener("click", async () => {
  await unregisterGlobalShortcut();
  currentShortcut = "";
  localStorage.removeItem("work_timer_shortcut");
  settingsCurrentHotkey.innerText = "None (Disabled)";
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
// Update check is triggered from Settings > "Check for Updates" (btnSettingsCheckUpdate)
const modalUpdate = document.getElementById("modal-update");
const updateVersionText = document.getElementById("update-version-text");
const updateBodyText = document.getElementById("update-body-text");
const modalBtnUpdateCancel = document.getElementById("modal-btn-update-cancel");
const modalBtnUpdateInstall = document.getElementById("modal-btn-update-install");

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
  startClockTimer();

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
