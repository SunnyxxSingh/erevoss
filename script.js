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

  // ROI calculator (ported from erevoss-roi-v3.html; maths unchanged). Element IDs carry a "roi-"
  // prefix so they can't clash with the rest of the page.
  (function () {
    if (!document.getElementById("roi-calculator")) return;
    const BOOK_URL = "#contact";          // on-page booking calendar
    let PRICE_PER_MEETING = 250;           // default; the hidden "Cost per show" dropdown can change it for the session
    document.querySelectorAll("#roi-calculator .book").forEach((a) => (a.href = BOOK_URL));

    // Hidden price control: tiny square after "22 sending days/mo" shows/hides a price dropdown
    const priceToggle = document.getElementById("roi-price-toggle");
    const pricePanel = document.getElementById("roi-price-panel");
    const priceSel = document.getElementById("roi-price");
    if (priceToggle && pricePanel && priceSel) {
      priceToggle.addEventListener("click", () => {
        pricePanel.hidden = !pricePanel.hidden;
        priceToggle.setAttribute("aria-expanded", String(!pricePanel.hidden));
      });
      priceSel.addEventListener("change", () => { PRICE_PER_MEETING = +priceSel.value; calc(); });
    }

    const STOPS = [1000, 2000, 3000, 5000, 10000];
    const REPLY = 0.01, POSITIVE = 0.05, BOOK = 0.40, DAYS = 22;

    const $ = (id) => document.getElementById("roi-" + id);
    const fmt = (n) => Math.round(n).toLocaleString("en-US");
    const paint = (r) => r.style.setProperty("--p", ((r.value - r.min) / (r.max - r.min)) * 100 + "%");
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const num = (s) => parseFloat(String(s).replace(/,/g, ""));

    // Emails per day: slider snaps to the five stops
    const vol = $("vol");
    vol.addEventListener("input", calc);

    // Build rulers
    const tick = (x, inner) => { const t = document.createElement("div"); t.className = "t"; t.style.setProperty("--x", x); t.appendChild(inner); return t; };
    const label = (txt) => { const s = document.createElement("span"); s.textContent = txt; return s; };
    ["1k", "2k", "3k", "5k", "10k"].forEach((txt, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = txt;
      b.addEventListener("click", () => { vol.value = i; calc(); });
      $("sc-vol").appendChild(tick(i / 4, b));
    });
    const stopTicks = $("sc-vol").querySelectorAll(".t");
    [500, 50000].forEach((v) =>
      $("sc-ltv").appendChild(tick((v - 500) / 49500, label(String(v)))));
    [5, 100].forEach((v) =>
      $("sc-close").appendChild(tick((v - 5) / 95, label(String(v)))));

    // LTV and close rate: slider and box stay in sync
    [["ltv", 500, 50000], ["close", 5, 100]].forEach(([id, min, max]) => {
      const r = $(id), n = $(id + "-n");
      r.addEventListener("input", () => { n.value = r.value; calc(); });
      const show = (v) => (id === "ltv" ? (+v).toLocaleString("en-US") : String(v));
      r.addEventListener("input", () => { n.value = show(r.value); calc(); });
      n.addEventListener("input", () => { const v = num(n.value); if (isFinite(v)) r.value = clamp(v, min, max); calc(); });
      n.addEventListener("blur", () => { const v = num(n.value); const c = isFinite(v) ? clamp(v, min, max) : +r.value; r.value = c; n.value = show(c); calc(); });
    });

    function calc() {
      const i = +vol.value;
      const perDay = STOPS[i];
      stopTicks.forEach((t, k) => { t.classList.toggle("on", k === i); t.firstChild.setAttribute("aria-pressed", k === i); });
      $("vol-v").textContent = fmt(perDay) + "/day";
      vol.setAttribute("aria-valuetext", fmt(perDay) + " per day");

      const nLtv = num($("ltv-n").value), nClose = num($("close-n").value);
      const ltv = isFinite(nLtv) ? clamp(nLtv, 0, 1e9) : +$("ltv").value;
      const close = (isFinite(nClose) ? clamp(nClose, 0, 100) : +$("close").value) / 100;
      [vol, $("ltv"), $("close")].forEach(paint);

      const replies = perDay * DAYS * REPLY;
      const leads = replies * POSITIVE;
      const meetings = leads * BOOK;
      const deals = meetings * close;
      const revenue = deals * ltv;
      const cost = Math.round(meetings) * PRICE_PER_MEETING;
      const roi = cost > 0 ? (revenue - cost) / cost * 100 : 0;

      $("r-replies").textContent = fmt(replies);
      $("r-leads").textContent = fmt(leads);
      $("r-meet").textContent = fmt(meetings);
      $("r-deals").textContent = fmt(deals);
      $("r-rev").textContent = "$" + fmt(revenue);
      $("r-cost").textContent = "$" + fmt(cost) + "/mo";
      $("r-roi").textContent = fmt(roi) + "%";
      $("r-roi").classList.toggle("neg", roi < 0);
    }

    calc();
  })();

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
