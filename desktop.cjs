const { app, BrowserWindow } = require('electron');
const path = require('node:path');

app.setName('OrderFlow Invest');
const profile = app.commandLine.getSwitchValue('orderflow-profile');
if (profile) app.setPath('userData', path.resolve(profile));

function openWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 820, minHeight: 640,
    title: 'OrderFlow Invest', backgroundColor: '#f5f7fb', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.loadFile(path.join(__dirname, 'app', 'index.html')).catch(error => {
    console.error('Cannot open OrderFlow Invest:', error);
    app.exit(1);
  });
}

if (app.requestSingleInstanceLock()) {
  app.whenReady().then(openWindow);
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.on('window-all-closed', () => app.quit());
} else app.quit();
