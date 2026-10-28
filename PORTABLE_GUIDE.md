# Work Timer — Portable App Guide & Testing Instructions

## 1. How to Test and Run the App on This PC

### Running in Development Mode
To launch the app with live hot-reloading and debug tools:

```bash
npm run tauri dev
```

### What to check:
1. **Always-On-Top & Sticky Note Mode**:
   - The app starts in a compact sticky-note window (`340x480`).
   - Notice the pin icon (📌) in the top right. When lit, the window floats on top of all other windows (browsers, IDEs, spreadsheets). You can click it to toggle always-on-top.
   - You can drag the corners of the window to resize it to any size you prefer.
2. **Timer Accuracy**:
   - Set your target (e.g. 8 Hours 30 Minutes) and click **Start Day**.
   - Click **Start Session** (it turns red into **Stop Session**).
   - Time calculations are backed by system wall-clock timestamps in Rust, ensuring zero time drift even if the computer sleeps or the UI updates are delayed.
3. **Spreadsheet Export**:
   - Click **Copy** (📋) on the session log table.
   - Paste directly into Microsoft Excel or Google Sheets. All columns (Session #, Start, End, Duration in seconds, Duration formatted) will align into tabular columns.
4. **Crash Recovery Test**:
   - Start a session.
   - Close the app or terminate it via Task Manager.
   - Reopen the app: it will detect the unclosed workday and prompt you to **Resume Day** or **Discard**.

---

## 2. How to Build the Standalone Portable Executable (.exe)

When you're ready to produce the `.exe`:

```bash
npm run tauri build
```

This compiles a standalone Windows executable to:
```
src-tauri/target/release/work-timer.exe
```

---

## 3. How to Use on Other PCs as a Portable Application

1. **Copy the Executable**:
   - Copy `work-timer.exe` onto a USB drive or send it to another PC.
   - Place it anywhere (e.g., `D:\Tools\WorkTimer\` or on your Desktop).
2. **Database Portability**:
   - The app automatically creates and looks for `work_timer.db` (SQLite) in the **same directory as the executable**.
   - If you keep `work-timer.exe` and `work_timer.db` in a folder together, you can move that entire folder across different computers and keep all your workday histories.
3. **No Installation Required**:
   - Windows 10 and Windows 11 include **Microsoft Edge WebView2** out of the box.
   - Double-clicking `work-timer.exe` runs immediately with zero background services, zero installer wizards, and zero cloud logins.
