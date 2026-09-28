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

  // Click-to-unmute overlay. Ships hidden and is only revealed once JS runs,
  // so it can never sit there as a dead control. Clears on click, and also
  // if the viewer unmutes through the player's own control.
  var video = document.getElementById('vsl-video');
  var overlay = document.getElementById('vsl-unmute');
  if (video && overlay) {
    var send = function (func) {
      video.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: func, args: [] }), '*'
      );
    };
    var dismiss = function () {
      if (overlay.classList.contains('is-off')) return;
      overlay.classList.add('is-off');
      setTimeout(function () { overlay.hidden = true; }, 300);
    };
    var listen = function () {
      video.contentWindow.postMessage(
        JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*'
      );
    };

    overlay.hidden = false;
    overlay.addEventListener('click', function () {
      send('unMute');
      send('playVideo');
      dismiss();
    });
    video.addEventListener('load', listen);
    listen();

    window.addEventListener('message', function (e) {
      if (e.source !== video.contentWindow) return;
      var data;
      try { data = JSON.parse(e.data); } catch (err) { return; }
      if (data && data.info && data.info.muted === false) dismiss();
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

  // Missing photos: remove the <img> so the placeholder / initials underneath show
  document.querySelectorAll('img[data-fallback]').forEach(function (img) {
    var drop = function () { img.remove(); };
    if (img.complete && img.naturalWidth === 0) drop();
    else img.addEventListener('error', drop);
  });

  // Scroll reveals
  var els = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el) { io.observe(el); });
  } else { els.forEach(function (el) { el.classList.add('in'); }); }
})();
