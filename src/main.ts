import './style.css';
import { ZheYiShenGame } from './game';

function showFallback(message: string): void {
  const loading = document.getElementById('loading');
  if (!loading) return;
  loading.hidden = false;
  loading.setAttribute('role', 'alert');
  loading.dataset.error = 'true';
  const copy = document.createElement('p');
  copy.textContent = message;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = '重新翻开档案';
  retry.addEventListener('click', () => window.location.reload());
  loading.replaceChildren(copy, retry);
  retry.focus();
}

window.addEventListener('error', () => showFallback('这一生出了点意外，请重新开始。'));
window.addEventListener('unhandledrejection', () => showFallback('有一段经历没能赶来，请重新开始。'));

async function init(): Promise<void> {
  const canvas = document.getElementById('game-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('缺少 Canvas 入口');
  new ZheYiShenGame(canvas);
  const loading = document.getElementById('loading');
  if (loading) loading.hidden = true;
}

init().catch((error: unknown) => {
  console.error(error);
  showFallback('这一生出了点意外，请重新开始。');
});
