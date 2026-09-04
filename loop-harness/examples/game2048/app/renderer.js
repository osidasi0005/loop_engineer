import { render, keyToAction, reduce, createGame } from '../src/view.mjs';
import { createRng } from '../src/game.mjs';

const appEl = document.getElementById('app');

const { size } = await window.desktop.getSettings();
document.documentElement.style.setProperty('--size', `${size}px`);

const best = await window.desktop.getBest();
const rng = createRng(Date.now());
let state = createGame(rng, best);
let savedBest = best;

/**
 * 現在の state を #app に描画する。
 */
function draw() {
  appEl.innerHTML = render(state);
}

/**
 * 操作を適用し、必要なら再描画・ベストスコア保存を行う（内部ヘルパー）。
 * @param {string} action
 */
function apply(action) {
  if (action === 'quit') {
    window.desktop.quit();
    return;
  }
  const next = reduce(state, action, rng);
  if (next !== state) {
    state = next;
    draw();
    if (state.best > savedBest) {
      savedBest = state.best;
      window.desktop.setBest(state.best);
    }
  }
}

window.addEventListener('keydown', (event) => {
  const action = keyToAction(event.key);
  if (!action) return;
  if (event.key.startsWith('Arrow')) {
    event.preventDefault();
  }
  apply(action);
});

appEl.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  apply(target.dataset.action);
});

draw();
