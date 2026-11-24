// The countdown. The browser only displays it: the server decides everything. The server's clock is used (not the
// phone's), by remembering the difference when the game information arrives.
import { formatDuration, preStartText, STATUS_TEXT } from './format.js';

export function createStatusLine(node) {
  let info = null;
  let offset = 0;
  let timer = null;
  let onChange = () => {};

  const phase = () => {
    if (!info || info.status === 'unconfigured') return 'unconfigured';
    const now = Date.now() + offset;
    if (now < info.startMs) return 'pre';
    if (now <= info.endMs) return 'active';
    return 'post';
  };

  function paint() {
    const status = phase();
    const now = Date.now() + offset;
    node.dataset.phase = status;
    const countdown = status === 'pre' ? info.startMs - now : status === 'active' ? info.endMs - now : null;
    node.textContent = status === 'pre' ? preStartText(info.startMs, now, info.timeZone)
      : countdown === null ? STATUS_TEXT[status] : `${STATUS_TEXT[status]}: ${formatDuration(countdown)}`;
    return status;
  }

  let last = null;
  function tick() {
    const status = paint();
    if (status !== last) { last = status; onChange(status); }
  }

  return {
    onPhaseChange(fn) { onChange = fn; },
    update(next) {
      info = next;
      offset = next.serverNowMs - Date.now();
      tick();
      clearInterval(timer);
      timer = setInterval(tick, 1000);
    },
    phase,
  };
}
