(function () {
  const root = document.getElementById('heroCarousel');
  if (!root) return;

  const bgs = root.querySelectorAll('.mega-hero-bg');
  const prevBtn = document.getElementById('heroPrev');
  const nextBtn = document.getElementById('heroNext');
  const counter = document.getElementById('heroCounter');
  const eyebrowEl = document.getElementById('heroEyebrow');
  const titleEl = document.getElementById('heroTitle');
  const subtitleEl = document.getElementById('heroSubtitle');
  const textBox = document.getElementById('heroText');

  let current = 0;
  let timer;

  function applySlideText(bg) {
    const eyebrow = bg.dataset.eyebrow || '';
    const title = bg.dataset.title || '';
    const subtitle = bg.dataset.subtitle || '';

    if (eyebrow) { eyebrowEl.textContent = eyebrow; eyebrowEl.style.display = ''; }
    else { eyebrowEl.style.display = 'none'; }

    titleEl.textContent = title;

    if (subtitle) { subtitleEl.textContent = subtitle; subtitleEl.style.display = ''; }
    else { subtitleEl.style.display = 'none'; }

    // Restart the "slide in" animation every time the slide changes, the
    // same remove-reflow-add trick used by the word cards.
    textBox.classList.remove('is-animating');
    void textBox.offsetWidth;
    textBox.classList.add('is-animating');
  }

  function goTo(index) {
    bgs[current].classList.remove('is-active');
    current = (index + bgs.length) % bgs.length;
    bgs[current].classList.add('is-active');
    applySlideText(bgs[current]);
    if (counter) {
      counter.textContent = String(current + 1).padStart(2, '0') + ' / ' + String(bgs.length).padStart(2, '0');
    }
  }

  function next() { goTo(current + 1); }
  function prev() { goTo(current - 1); }

  function startAutoplay() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    timer = setInterval(next, 6500);
  }
  function stopAutoplay() { clearInterval(timer); }

  if (nextBtn) nextBtn.addEventListener('click', () => { next(); stopAutoplay(); startAutoplay(); });
  if (prevBtn) prevBtn.addEventListener('click', () => { prev(); stopAutoplay(); startAutoplay(); });

  root.addEventListener('mouseenter', stopAutoplay);
  root.addEventListener('mouseleave', startAutoplay);

  // Play the entrance animation for the very first slide shortly after load.
  setTimeout(() => textBox.classList.add('is-animating'), 200);

  if (bgs.length > 1) startAutoplay();
})();