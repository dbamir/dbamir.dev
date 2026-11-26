document.documentElement.classList.add('js');
// Safety net: if the page script below ever fails, fall back to plain scrolling.
document.addEventListener('DOMContentLoaded', () => {
  if (window.pagesReady) return;
  document.documentElement.classList.remove('js');
  document.querySelectorAll('.page').forEach((page) => page.removeAttribute('style'));
});
