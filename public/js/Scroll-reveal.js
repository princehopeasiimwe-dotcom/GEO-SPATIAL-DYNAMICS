(function () {
  let lastScrollY = window.scrollY;
  let scrollDir = 'down';

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    scrollDir = y > lastScrollY ? 'down' : 'up';
    lastScrollY = y;
  }, { passive: true });

  const targets = document.querySelectorAll('.reveal');
  if (!targets.length) return;

  // Respect people who've asked their OS/browser to reduce motion: just
  // show everything immediately instead of animating.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    targets.forEach(el => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const el = entry.target;
      if (entry.isIntersecting) {
        // Scrolling down -> element should look like it's falling in from
        // above. Scrolling up -> it should look like it's rising from below.
        el.classList.remove('reveal-from-top', 'reveal-from-bottom', 'is-visible');
        el.classList.add(scrollDir === 'down' ? 'reveal-from-top' : 'reveal-from-bottom');
        // Force the browser to register the starting position before we
        // transition to the final one, or the animation won't play.
        void el.offsetWidth;
        el.classList.add('is-visible');
      } else {
        // Leaving the viewport resets it, so scrolling back past it later
        // replays the animation rather than just staying visible forever.
        el.classList.remove('is-visible');
      }
    });
  }, { threshold: 0.15 });

  targets.forEach(el => observer.observe(el));
})();