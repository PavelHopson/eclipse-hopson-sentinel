const { app, BrowserWindow, shell, Menu, Tray, globalShortcut, nativeImage } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;
let win = null;
let tray = null;

Menu.setApplicationMenu(null);

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: 'Eclipse Sentinel',
    backgroundColor: '#05070A',
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#05070A',
      symbolColor: '#6B7A8A',
      height: 40,
    },
    icon: path.join(__dirname, '../public/favicon.svg'),
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Allow microphone access
  win.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'microphone') {
      callback(true);
    } else {
      callback(false);
    }
  });

  win.once('ready-to-show', () => win.show());

  // Minimize to tray instead of closing
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  if (isDev) {
    win.loadURL('http://localhost:3939');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

function createTray() {
  // Simple 16x16 icon
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA1ElEQVQ4T2NkoBAwUqifYdAY8B8E/v//z8DIyMjAwMDAwMTExPAfJIeNDdIHMoORkZHhPzZNuNgg/SBDQJpBYtgMwGkzyDCQISDD/mNzFi5xcABB/QCKfBBgYmJi+I/NEFxiID9ADAH5AWQQLhtwGfIfqhakBqIRFEAgQ4jRzMjIyAgyBJshMEOwGQLSBzMEZgg2TdgMgbkemyEwf4LkCBqCbjOlhoBdBXI9uoNJCiRYKJBbUoLYIDUkGQKyGdtQIGgILI5wGYJNP4whIFeD/EisIQAvjYFpM/RLYAAAAABJRU5ErkJggg=='
  );
  tray = new Tray(icon);
  tray.setToolTip('Eclipse Sentinel');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Открыть', click: () => { win.show(); win.focus(); } },
    { type: 'separator' },
    { label: 'Выход', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('click', () => { win.show(); win.focus(); });
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  // Global hotkey: Ctrl+Shift+S to toggle window
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Don't quit — stay in tray
  }
});

app.on('activate', () => {
  if (win) { win.show(); win.focus(); }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
