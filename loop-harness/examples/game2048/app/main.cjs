'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, Menu, ipcMain } = require('electron');

const DEFAULT_SIZE = 600;

/**
 * process.argv からオプションを読み取る。
 * @returns {{ userData: string | null, smoke: boolean }}
 */
function parseArgs() {
  const argv = process.argv.slice(app.isPackaged ? 1 : 2);
  let userData = null;
  let smoke = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--user-data') {
      userData = argv[i + 1] ?? null;
      i += 1;
    } else if (argv[i] === '--smoke') {
      smoke = true;
    }
  }
  return { userData, smoke };
}

const { userData, smoke } = parseArgs();

if (userData) {
  app.setPath('userData', userData);
} else {
  app.setName('2048');
}

/**
 * size が妥当な整数(300〜1200)かどうかを返す（内部ヘルパー）。
 * @param {*} size
 * @returns {boolean}
 */
function isValidSize(size) {
  return Number.isInteger(size) && size >= 300 && size <= 1200;
}

/**
 * settings.json のパスを返す（内部ヘルパー）。
 * @returns {string}
 */
function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

/**
 * best.json のパスを返す（内部ヘルパー）。
 * @returns {string}
 */
function bestPath() {
  return path.join(app.getPath('userData'), 'best.json');
}

/**
 * settings.json を読み、検証済みの size を返す。無ければ既定値で書き出す。
 * @returns {{ size: number }}
 */
function loadSettings() {
  const file = settingsPath();
  if (!fs.existsSync(file)) {
    const initial = { size: DEFAULT_SIZE };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(initial));
    return initial;
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { size: DEFAULT_SIZE };
  }
  const size = isValidSize(parsed.size) ? parsed.size : DEFAULT_SIZE;
  return { size };
}

/**
 * best.json から best を読む。無ければ 0。
 * @returns {number}
 */
function loadBest() {
  const file = bestPath();
  if (!fs.existsSync(file)) return 0;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Number.isFinite(parsed.best) ? parsed.best : 0;
  } catch {
    return 0;
  }
}

/**
 * best.json へ best を書き込む。
 * @param {number} value
 */
function saveBest(value) {
  const file = bestPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ best: value }));
}

let mainWindow = null;

ipcMain.handle('settings:get', () => loadSettings());
ipcMain.handle('best:get', () => loadBest());
ipcMain.handle('best:set', (_event, value) => {
  saveBest(value);
});
ipcMain.handle('app:quit', () => {
  app.quit();
});

/**
 * ウィンドウを作成し、index.html を読み込む。
 */
function createWindow() {
  const { size } = loadSettings();
  const height = Math.round(size * 1.16);

  mainWindow = new BrowserWindow({
    width: size,
    height,
    useContentSize: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: '2048',
    backgroundColor: '#fbfaf5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.setContentSize(size, height);
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  if (smoke) {
    setupSmoke(mainWindow, size);
  }
}

/**
 * --smoke モード: 起動後に検証用の情報を stdout へ出力して終了する。
 * @param {import('electron').BrowserWindow} win
 * @param {number} size 検証済みの設定値
 */
function setupSmoke(win, size) {
  const fail = (message) => {
    process.stdout.write(`SMOKE error=${message}\n`);
    app.exit(1);
  };

  win.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
    fail(`did-fail-load ${errorCode} ${errorDescription}`);
  });

  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const tiles = await win.webContents.executeJavaScript(
          'document.querySelectorAll(".tile").length',
        );
        const hud = await win.webContents.executeJavaScript(
          'document.querySelector(".best").textContent',
        );
        const [w, h] = win.getContentSize();
        const best = loadBest();
        process.stdout.write(`SMOKE size=${size}\n`);
        process.stdout.write(`SMOKE window=${w}x${h}\n`);
        process.stdout.write(`SMOKE tiles=${tiles}\n`);
        process.stdout.write(`SMOKE best=${best}\n`);
        process.stdout.write(`SMOKE hud=${hud}\n`);
        app.exit(tiles === 16 ? 0 : 1);
      } catch (err) {
        fail(String(err && err.message ? err.message : err));
      }
    }, 300);
  });
}

process.on('unhandledRejection', (reason) => {
  if (smoke) {
    process.stdout.write(`SMOKE error=${String(reason)}\n`);
    app.exit(1);
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});
