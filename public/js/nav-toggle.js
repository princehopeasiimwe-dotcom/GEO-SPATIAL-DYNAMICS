(function () {
  const btn = document.getElementById('navMenuBtn');
  const links = document.getElementById('navLinks');
  if (!btn || !links) return;

  btn.addEventListener('click', () => {
    const isOpen = links.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    btn.textContent = isOpen ? '✕' : '☰';
  });

  // Close the menu automatically after tapping a link, so it doesn't stay
  // open when the new page loads.
  links.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => links.classList.remove('is-open'));
  });
})();