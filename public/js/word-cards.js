(function () {
  // Turns "Hello" into <span>H</span><span>e</span>... so each letter can be
  // animated independently. Spaces are preserved as real spaces (not spans),
  // so word-wrapping still behaves normally.
  function splitIntoLetters(el) {
    const text = el.textContent;
    el.textContent = '';
    text.split('').forEach((char, i) => {
      if (char === ' ') {
        el.appendChild(document.createTextNode(' '));
        return;
      }
      const span = document.createElement('span');
      span.className = 'letter';
      span.textContent = char;
      // Randomize each letter's starting position/rotation so the "drop"
      // looks organic rather than mechanical. These become CSS variables
      // that the stylesheet's initial (scattered) state reads from.
      const dy = -18 - Math.random() * 26;      // starts somewhere above
      const rot = (Math.random() * 30 - 15);     // slight random tilt
      span.style.setProperty('--dy', `${dy}px`);
      span.style.setProperty('--rot', `${rot}deg`);
      // Stagger: each letter's transition starts slightly after the last one.
      span.style.transitionDelay = `${i * 18}ms`;
      el.appendChild(span);
    });
  }

  const textEls = document.querySelectorAll('.word-card-text');
  textEls.forEach(splitIntoLetters);

  const cards = document.querySelectorAll('.word-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      // Toggling this class off then back on lets the animation replay
      // every time the card is clicked, not just the first time.
      card.classList.remove('is-revealed');
      // Forces the browser to acknowledge the class removal before we
      // re-add it, so the transition actually restarts.
      void card.offsetWidth;
      card.classList.add('is-revealed');
    });
  });

  // Reveal automatically once, shortly after the page loads, so visitors
  // who never click still see the effect.
  setTimeout(() => {
    cards.forEach(card => card.classList.add('is-revealed'));
  }, 400);
})();