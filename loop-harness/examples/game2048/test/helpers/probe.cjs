// probe.cjs — app/index.html を非表示ウィンドウで読み込み、指定した状態を描画して
// 計算済みスタイルと矩形を JSON で 1 行（PROBE {...}）出力する Electron のメインスクリプト。
// 使い方: electron test/helpers/probe.cjs <size> <state JSON>
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const appDir = path.join(__dirname, '..', '..', 'app');
const size = Number(process.argv[2] || 600);
const stateJson = process.argv[3] || 'null';

ipcMain.handle('settings:get', () => ({ size }));
ipcMain.handle('best:get', () => 0);
ipcMain.handle('best:set', () => {});
ipcMain.handle('app:quit', () => app.exit(0));

function fail(msg) {
  process.stdout.write(`PROBE ${JSON.stringify({ error: String(msg) })}\n`);
  app.exit(1);
}
process.on('unhandledRejection', fail);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: size,
    height: Math.round(size * 1.16),
    useContentSize: true,
    show: false,
    webPreferences: { preload: path.join(appDir, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  win.webContents.on('did-fail-load', (_e, code, desc) => fail(`did-fail-load ${code} ${desc}`));
  await win.loadFile(path.join(appDir, 'index.html'));
  await new Promise((r) => setTimeout(r, 400));

  const script = `
    (async () => {
      const state = ${stateJson};
      if (state) {
        const m = await import('../src/view.mjs');
        document.getElementById('app').innerHTML = m.render(state);
        await new Promise((r) => setTimeout(r, 350)); // 出現アニメーション（120ms）が終わるのを待つ
      }
      const pick = (sel, props) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const out = { rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } };
        for (const p of props) out[p] = cs.getPropertyValue(p);
        return out;
      };
      const P = ['background-color', 'color', 'border-style', 'border-color', 'font-size', 'font-weight', 'box-shadow', 'font-family', 'animation-name'];
      return {
        tiles: document.querySelectorAll('.tile').length,
        empty: pick('.tile.empty', P),
        v2: pick('.tile.v2', P),
        v16: pick('.tile.v16', P),
        v32: pick('.tile.v32', P),
        v128: pick('.tile.v128', P),
        v256: pick('.tile.v256', P),
        v2048: pick('.tile.v2048', P),
        v4096: pick('.tile.v4096', P),
        newTile: pick('.tile.new', P),
        hud: pick('.hud', P),
        label: pick('.hud .label', P),
        score: pick('.hud .score', P),
        best: pick('.hud .best', P),
        board: pick('.board', P),
        foot: pick('.foot', P),
        veil: pick('.veil', P),
        title: pick('.veil .title', P),
        btn: pick('.veil .btn.primary', P),
        app: pick('#app', P),
        body: pick('body', P),
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        inner: [window.innerWidth, window.innerHeight],
      };
    })()`;
  try {
    const result = await win.webContents.executeJavaScript(script);
    process.stdout.write(`PROBE ${JSON.stringify(result)}\n`);
    app.exit(0);
  } catch (e) {
    fail(e && e.message ? e.message : e);
  }
});
