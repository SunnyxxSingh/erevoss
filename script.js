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
    const roiSection = document.getElementById("roi-calculator");
    if (!roiSection) return;
    const BOOK_URL = roiSection.dataset.bookUrl || "#contact";   // set per page via data-book-url
    // default price per show: 250, unless the page sets data-default-price (roi.html uses 150).
    // The hidden "Cost per show" dropdown can change it for the session.
    let PRICE_PER_MEETING = +roiSection.dataset.defaultPrice || 250;
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
      priceSel.value = String(PRICE_PER_MEETING);
      priceSel.addEventListener("change", () => { PRICE_PER_MEETING = +priceSel.value; calc(); });
    }

    // second hidden square (roi.html only): shows / hides the tech fee dropdown
    const feeToggle = document.getElementById("roi-fee-toggle");
    const feePanel = document.getElementById("roi-fee-panel");
    if (feeToggle && feePanel) {
      feeToggle.addEventListener("click", () => {
        feePanel.hidden = !feePanel.hidden;
        feeToggle.setAttribute("aria-expanded", String(!feePanel.hidden));
      });
    }

    // third hidden square (roi.html only): staged reveal of the costs. Hidden by default.
    // click 1 = tech fee fades in, click 2 = Erevoss cost, net profit and ROI fade in, click 3 = hide everything again.
    const costsToggle = document.getElementById("roi-costs-toggle");
    const costsBox = document.getElementById("roi-costs");
    if (costsToggle && costsBox) {
      const stages = [costsBox.querySelector(".roi-s1"), costsBox.querySelector(".roi-s2")];
      let step = 0;
      costsToggle.addEventListener("click", () => {
        step = (step + 1) % 3;
        costsBox.dataset.step = String(step);
        stages.forEach((el, i) => {
          const on = step > i;
          el.setAttribute("aria-hidden", String(!on));
          if (on) el.removeAttribute("inert"); else el.setAttribute("inert", "");
        });
        costsToggle.setAttribute("aria-expanded", String(step > 0));
      });
    }

    const STOPS = [1000, 2000, 3000, 5000, 10000];
    const REPLY = 0.01, POSITIVE = 0.05, BOOK = 0.40, DAYS = 22;

    const $ = (id) => document.getElementById("roi-" + id);
    const fmt = (n) => Math.round(n).toLocaleString("en-US");
    const paint = (r) => r.style.setProperty("--p", ((r.value - r.min) / (r.max - r.min)) * 100 + "%");
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const num = (s) => parseFloat(String(s).replace(/,/g, ""));

    // roi.html only (the page with the tech fee line): the "Showed meetings" number can be typed over, quietly, with no hint that it's editable.
    // The typed number flows through deals, revenue, cost, net profit and ROI. Touching any slider or number box drops it and goes back to the calculated value.
    const meetEl = $("r-fee") ? $("r-meet") : null;
    let meetOverride = null;
    if (meetEl) {
      meetEl.contentEditable = "true";
      meetEl.spellcheck = false;
      meetEl.setAttribute("inputmode", "numeric");
      meetEl.style.cursor = "default";
      meetEl.style.outline = "none";
      meetEl.addEventListener("input", () => {
        const d = meetEl.textContent.replace(/\D/g, "").slice(0, 4);
        if (d !== meetEl.textContent) {
          meetEl.textContent = d;
          const r = document.createRange(); r.selectNodeContents(meetEl); r.collapse(false);
          const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
        }
        meetOverride = d === "" ? null : +d;
        calc();
      });
      meetEl.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); meetEl.blur(); } });
      meetEl.addEventListener("blur", () => { calc(); });   // tidy the text (or put the calculated number back if it was left empty)
      ["vol", "ltv", "ltv-n", "close", "close-n"].forEach((id) => {
        const el = $(id);
        if (el) el.addEventListener("input", () => { meetOverride = null; });
      });
    }

    // Emails per day: slider snaps to the five stops
    const vol = $("vol");
    vol.addEventListener("input", () => { if ($("fee")) { window.__feeOverride = null; window.dispatchEvent(new Event("erevoss-fee")); } });
    vol.addEventListener("input", calc);
    if ($("fee")) {
      // picking a rate by hand overrides the volume schedule (the cost card on the page listens too)
      $("fee").addEventListener("change", () => { window.__feeOverride = +$("fee").value; window.dispatchEvent(new Event("erevoss-fee")); calc(); });
      window.addEventListener("erevoss-fee", calc);
    }

    // Build rulers
    const tick = (x, inner) => { const t = document.createElement("div"); t.className = "t"; t.style.setProperty("--x", x); t.appendChild(inner); return t; };
    const label = (txt) => { const s = document.createElement("span"); s.textContent = txt; return s; };
    ["1k", "2k", "3k", "5k", "10k"].forEach((txt, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = txt;
      b.addEventListener("click", () => { vol.value = i; meetOverride = null; if ($("fee")) { window.__feeOverride = null; window.dispatchEvent(new Event("erevoss-fee")); } calc(); });
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

    // ---- Option cards (roi.html only): hidden toggles under the calculator, one summary card per volume picked ----
    let curLtv = 0, curClose = 0;
    const optBox = document.getElementById("roi-options");
    const optOn = new Set();
    const optCards = {};
    // one line under each volume: edit freely
    const OPT_VOLUMES = [1000, 2000, 3000, 4000, 5000, 10000];
    const OPTION_NOTES = ["If you want to start steady", "If you want steady growth", "If you want that faster growth", "If you want to push harder", "If you want to scale hard", "If you want maximum volume"];
    const money = (n) => (n < 0 ? "-$" : "$") + fmt(Math.abs(n));
    function optNumbers(perDay) {
      const meetings = perDay * DAYS * REPLY * POSITIVE * BOOK;
      const cost = Math.round(meetings) * PRICE_PER_MEETING;
      const rate = window.__feeOverride != null ? window.__feeOverride : Math.round(1000 * Math.max(0.8, 1 - 0.1 * (perDay / 1000 - 1)));
      const fee = rate * perDay / 1000;
      const revenue = meetings * curClose * curLtv;
      const invested = cost + fee;
      const net = revenue - invested;
      return { meetings, fee, revenue, net, roi: invested > 0 ? net / invested * 100 : 0 };
    }
    function renderOptions() {
      if (!optBox) return;
      let n = 0;
      OPT_VOLUMES.forEach((perDay, i) => {
        const card = optCards[i];
        if (!card) return;
        n += 1;
        const o = optNumbers(perDay);
        card.style.order = String(i);
        card.querySelector(".opt-tag").textContent = "Option " + String.fromCharCode(64 + n);   // Option A, B, C ... in volume order
        card.querySelector(".opt-vol").textContent = fmt(perDay) + " emails a day";
        card.querySelector(".opt-note").textContent = OPTION_NOTES[i];
        card.querySelector(".o-tech").textContent = "$" + fmt(o.fee) + "/month";
        card.querySelector(".o-appt").textContent = "$" + fmt(PRICE_PER_MEETING);
        card.querySelector(".o-meet").textContent = fmt(o.meetings);
        card.querySelector(".o-rev").textContent = "$" + fmt(o.revenue);
        const net = card.querySelector(".o-net"), roi = card.querySelector(".o-roi");
        net.textContent = money(o.net); net.classList.toggle("neg", o.net < 0);
        roi.textContent = fmt(o.roi) + "%"; roi.classList.toggle("neg", o.roi < 0); roi.classList.toggle("g", o.roi >= 0);
      });
    }
    function makeCard(i) {
      const c = document.createElement("article");
      c.className = "opt-card";
      c.innerHTML =
        '<span class="opt-tag"></span><h3 class="opt-vol"></h3><p class="opt-note"></p>' +
        '<div class="opt-row"><span>Tech</span><b class="o-tech"></b></div>' +
        '<div class="opt-row"><span>Qualified attended appointment</span><b class="o-appt"></b></div>' +
        '<hr class="opt-hr">' +
        '<div class="opt-row sm"><span>Showed meetings / month</span><b class="o-meet"></b></div>' +
        '<div class="opt-row sm"><span>Projected revenue</span><b class="o-rev"></b></div>' +
        '<div class="opt-big"><span>Net profit</span><b class="o-net"></b></div>' +
        '<div class="opt-big"><span>ROI</span><b class="o-roi"></b></div>';
      return c;
    }
    document.querySelectorAll(".opt-pick").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = +btn.dataset.i;
        if (optOn.has(i)) {
          optOn.delete(i);
          const c = optCards[i]; delete optCards[i];
          c.classList.remove("in");
          setTimeout(() => c.remove(), 300);
          btn.setAttribute("aria-pressed", "false");
        } else {
          optOn.add(i);
          const c = makeCard(i); optCards[i] = c; optBox.appendChild(c);
          btn.setAttribute("aria-pressed", "true");
          renderOptions();
          requestAnimationFrame(() => requestAnimationFrame(() => c.classList.add("in")));
        }
        renderOptions();
      });
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
      const meetings = meetOverride !== null ? meetOverride : leads * BOOK;
      const deals = meetings * close;
      const revenue = deals * ltv;
      const cost = Math.round(meetings) * PRICE_PER_MEETING;
      // roi.html only: a monthly tech fee (hidden "Tech fee per 1,000 emails" dropdown, scaled to volume) is on top of the cost per show.
      // Then: net profit = revenue - cost - fee, and ROI = net profit / total invested. On the homepage there is no fee, so ROI is unchanged.
      const feeOut = $("r-fee"), feeSel = $("fee");
      // volume discount on the tech fee: 100% of the base rate at 1,000/day, then 10% off per extra 1,000/day, never below 80% (2,000/day = $900 per 1,000; 3,000 and everything above = $800)
      // (the hidden "Tech fee per 1,000 emails" dropdown shows the rate in use; picking one by hand overrides the schedule until a volume slider moves)
      const feeRatePer1k = window.__feeOverride != null ? window.__feeOverride : Math.round(1000 * Math.max(0.8, 1 - 0.1 * (perDay / 1000 - 1)));
      const fee = feeOut && feeSel ? feeRatePer1k * perDay / 1000 : 0;
      if (feeOut && feeSel) feeSel.value = String(feeRatePer1k);
      const invested = cost + fee;
      const netProfit = revenue - invested;
      const roi = invested > 0 ? netProfit / invested * 100 : 0;

      $("r-replies").textContent = fmt(replies);
      $("r-leads").textContent = fmt(leads);
      if (!(meetEl && document.activeElement === meetEl && meetOverride !== null)) $("r-meet").textContent = fmt(meetings);
      $("r-deals").textContent = fmt(deals);
      // roi.html only (it has the tech fee line): show the sum as + revenue, - tech fee, - cost per show, = net profit
      const plus = feeOut ? "+ " : "", minus = feeOut ? "− " : "";
      $("r-rev").textContent = plus + "$" + fmt(revenue);
      $("r-cost").textContent = minus + "$" + fmt(cost) + "/mo";
      if ($("r-cost-label")) $("r-cost-label").textContent = "Erevoss Cost ($" + fmt(PRICE_PER_MEETING) + " per show)";   // follows the hidden cost-per-show dropdown
      if (feeOut) feeOut.textContent = minus + "$" + fmt(fee) + "/mo";
      if ($("r-net")) { $("r-net").textContent = (netProfit < 0 ? "-$" : "$") + fmt(Math.abs(netProfit)); $("r-net").classList.toggle("neg", netProfit < 0); }
      $("r-roi").textContent = fmt(roi) + "%";
      $("r-roi").classList.toggle("neg", roi < 0);
      curLtv = ltv; curClose = close;
      renderOptions();
    }

    calc();
  })();

  // Chat widget (GoHighLevel): keep it quiet. By default it pops up a "Hi there! Have a question?" message on its own.
  // This hides that popup, so only the small chat button shows and the chat opens only when someone clicks it.
  // (If the widget's own settings ever offer a "greeting / prompt message" switch, turning that off there does the same job.)
  (function () {
    var quiet = function () {
      var w = document.querySelector('chat-widget');
      if (!w || !w.shadowRoot) return false;
      if (!w.shadowRoot.getElementById('erevoss-chat-quiet')) {
        var s = document.createElement('style');
        s.id = 'erevoss-chat-quiet';
        s.textContent = '.lc_text-widget--prompt{display:none !important;}';
        w.shadowRoot.appendChild(s);
      }
      return true;
    };
    if (quiet()) return;
    // the widget loads a moment after the page: catch it as soon as it appears, and keep checking for a short while as a fallback
    if ('MutationObserver' in window) {
      var mo = new MutationObserver(function () { if (quiet()) mo.disconnect(); });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(function () { mo.disconnect(); }, 30000);
    }
    var tries = 0, t = setInterval(function () { if (quiet() || ++tries > 60) clearInterval(t); }, 500);
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
