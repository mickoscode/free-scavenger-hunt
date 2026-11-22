// "Back to top" links (href="#top"). They scroll instead of changing the address, because some pages keep their place in the address
// (the hunt manager's tabs, the play page's zones) and a #top would send them somewhere else.
document.addEventListener('click', (event) => {
  const link = event.target.closest?.('a[href="#top"]');
  if (!link) return;
  event.preventDefault();
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});
