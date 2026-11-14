/* One brief introduction per opening; a login redirect must not replay it. */
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const now = Date.now();
  try {
    const last = Number(sessionStorage.getItem('nd-entry-at')) || 0;
    sessionStorage.setItem('nd-entry-at', String(now));
    if (now - last < 15000) return;
  } catch {}
  const entry = document.createElement('div');
  entry.className = 'nd-entry';
  entry.setAttribute('aria-hidden', 'true');
  const word = document.createElement('div');
  word.className = 'nd-entry-word';
  for (const letter of ['N', '&', 'D']) {
    const span = document.createElement('span');
    span.textContent = letter;
    word.append(span);
  }
  const caption = document.createElement('div');
  caption.className = 'nd-entry-caption';
  caption.textContent = 'UNIVERSITY';
  entry.append(word, caption);
  document.body.append(entry);
  const dismiss = () => entry.remove();
  entry.addEventListener('animationend', event => {
    if (event.target === entry) dismiss();
  });
  // Also dismiss if animations are disabled or the page is backgrounded.
  setTimeout(dismiss, 1450);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) dismiss();
  }, {once: true});
})();
