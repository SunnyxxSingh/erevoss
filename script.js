(function () {
  var nav = document.getElementById('nav');
  var progress = document.querySelector('.scroll-progress');
  var bar = document.getElementById('bookBar');
  var docEl = document.documentElement;

  // Nav state, scroll progress bar, sticky book bar (appears after the hero)
  var onScroll = function () {
    var y = window.scrollY;
    nav.classList.toggle('scrolled', y > 12);

    if (progress) {
      var max = docEl.scrollHeight - docEl.clientHeight;
      progress.style.transform = 'scaleX(' + (max > 0 ? y / max : 0) + ')';
    }
    if (bar) {
      var show = y > window.innerHeight * 0.8;
      bar.classList.toggle('show', show);
      document.body.classList.toggle('bar-shown', show);
    }
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Click-to-unmute overlay for the Wistia VSL. The video autoplays muted
  // (browsers allow nothing else); the overlay appears once it's playing muted
  // and clears on click, or if the viewer unmutes through Wistia's own controls.
  var video = document.getElementById('vsl-video');
  var overlay = document.getElementById('vsl-unmute');
  if (video && overlay) {
    var unmuted = false;
    var dismiss = function () { unmuted = true; overlay.hidden = true; };
    var showIfMuted = function () { if (!unmuted && video.muted) overlay.hidden = false; else dismiss(); };

    video.addEventListener('play', showIfMuted);
    video.addEventListener('mute-change', function (e) {
      if (e.detail && e.detail.isMuted === false) dismiss();
    });
    overlay.addEventListener('click', function () {
      video.muted = false;                           // same position, no restart
      if (video.state !== 'playing') video.play();   // resume if it had been paused
      dismiss();
    });
    // in case playback started before this script ran
    if (window.customElements) customElements.whenDefined('wistia-player').then(function () {
      if (video.state === 'playing') showIfMuted();
    });
  }

  // Hand-drawn headline circle: measure its on-screen length so the draw-in
  // animation covers the whole loop, whatever the width of the circled words.
  var circles = document.querySelectorAll('.circled path');
  var measureCircles = function () {
    circles.forEach(function (p) {
      var m = p.getScreenCTM();
      if (!m) return;
      var total = p.getTotalLength(), len = 0, prev = null;
      for (var i = 0; i <= 80; i++) {
        var pt = p.getPointAtLength(total * i / 80).matrixTransform(m);
        if (prev) len += Math.hypot(pt.x - prev.x, pt.y - prev.y);
        prev = pt;
      }
      p.style.setProperty('--len', Math.ceil(len) + 4);
    });
  };
  measureCircles();
  // web fonts change the width of the words, so measure again once they've loaded
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureCircles);
  circles.forEach(function (p) {
    // once drawn, drop the dash so resizing the window can't open a gap
    p.addEventListener('animationend', function () { p.style.strokeDasharray = 'none'; });
  });

  // ROI calculator: what pay-per-show costs vs. what it brings in
  var PRICE_PER_SHOW = 200;
  var dealIn = document.getElementById('calc-deal');
  if (dealIn) {
    var closeIn = document.getElementById('calc-close');
    var apptsIn = document.getElementById('calc-appts');
    var $ = function (id) { return document.getElementById(id); };
    var money = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };
    // whole numbers stay whole; otherwise one decimal, e.g. 2.3
    var count = function (n) { return Number.isInteger(Math.round(n * 10) / 10) ? String(Math.round(n)) : (Math.round(n * 10) / 10).toFixed(1); };
    var fill = function (el) { el.style.setProperty('--fill', ((el.value - el.min) / (el.max - el.min) * 100) + '%'); };

    var calc = function () {
      var deal = parseInt(dealIn.value.replace(/[^\d]/g, ''), 10) || 0;
      var rate = +closeIn.value / 100;
      var appts = +apptsIn.value;
      var spend = appts * PRICE_PER_SHOW;
      var deals = appts * rate;
      var rev = deals * deal;

      fill(closeIn); fill(apptsIn);
      $('calc-close-out').textContent = closeIn.value + '%';
      $('calc-appts-out').textContent = appts;
      $('calc-spend').textContent = money(spend);
      $('calc-deals').textContent = count(deals);
      $('calc-cpa').textContent = deals > 0 ? money(spend / deals) : '—';
      $('calc-rev').textContent = money(rev);
      $('calc-roi').textContent = (rev / spend >= 10 ? Math.round(rev / spend) : (Math.round(rev / spend * 10) / 10)) + '× return on spend';
      $('calc-say').textContent = 'Book ' + appts + ' appointments, close ' + closeIn.value + '% of them, and that’s ' +
        (Math.abs(deals - Math.round(deals)) < 1e-9 ? '' : 'roughly ') + count(deals) + ' deal' + (count(deals) === '1' ? '' : 's') +
        ' worth ' + money(rev) + ' for a ' + money(spend) + ' spend.';
    };

    // keep thousands separators in the deal value as the visitor types
    dealIn.addEventListener('input', function () {
      var digits = dealIn.value.replace(/[^\d]/g, '').slice(0, 9);
      dealIn.value = digits ? (+digits).toLocaleString('en-US') : '';
      calc();
    });
    closeIn.addEventListener('input', calc);
    apptsIn.addEventListener('input', calc);
    calc();
  }

  // Missing photos: remove the <img> so the placeholder / initials underneath show
  document.querySelectorAll('img[data-fallback]').forEach(function (img) {
    var drop = function () { img.remove(); };
    if (img.complete && img.naturalWidth === 0) drop();
    else img.addEventListener('error', drop);
  });

  // Testimonials: turn the cards into a right-to-left scrolling strip. The real cards stay in
  // index.html; a copy of the set is appended so the loop is seamless (copies are hidden from
  // screen readers). The whole strip fades in as one, instead of card by card.
  var quotes = document.querySelector('.quotes');
  if (quotes && quotes.children.length > 1) {
    var cards = Array.prototype.slice.call(quotes.children);
    var track = document.createElement('div');
    track.className = 'quotes-track';
    cards.forEach(function (card) {
      card.classList.remove('reveal', 'd1', 'd2', 'd3', 'd4', 'in');
      track.appendChild(card);
    });
    cards.forEach(function (card) {
      var copy = card.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true');
      copy.setAttribute('data-clone', '');
      track.appendChild(copy);
    });
    quotes.appendChild(track);
    quotes.classList.add('is-marquee', 'reveal');
    quotes.style.setProperty('--dur', (cards.length * 9) + 's');   // ~9s per card
  }

  // Scroll reveals. Everything in the hero (headline, video, CTA button) fades in
  // together on load, so the button never waits for a scroll; the rest reveal on scroll.
  document.querySelectorAll('.hero .reveal').forEach(function (el) { el.classList.add('in'); });
  var els = document.querySelectorAll('.reveal:not(.in)');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el) { io.observe(el); });
  } else { els.forEach(function (el) { el.classList.add('in'); }); }
})();
