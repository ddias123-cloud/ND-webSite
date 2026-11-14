/* Apply the saved appearance before the first paint, including the launch screen. */
(() => {
  let theme = 'dark';
  try {
    const saved = JSON.parse(localStorage.getItem('nd-demo-v1'));
    if (saved?.theme === 'light' || saved?.theme === 'dark') theme = saved.theme;
  } catch {}
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#faf8f5' : '#0e1726');
})();
