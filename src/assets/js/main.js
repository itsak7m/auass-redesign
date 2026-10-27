// AUASS redesign concept: small progressive enhancements. Every page works without JS.
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var isAr = document.documentElement.lang === 'ar';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Mobile menu
  var btn = $('[data-menu-btn]'), nav = $('#site-nav');
  if (btn && nav) {
    var setMenu = function (open) {
      nav.classList.toggle('open', open);
      document.body.classList.toggle('menu-open', open);
      btn.setAttribute('aria-expanded', String(open));
    };
    btn.addEventListener('click', function () { setMenu(!nav.classList.contains('open')); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('open')) { setMenu(false); btn.focus(); } });
    window.matchMedia('(min-width: 1181px)').addEventListener('change', function (m) { if (m.matches) setMenu(false); });
  }

  // Reveal on scroll
  var reveals = $$('.reveal');
  if (reveals.length && 'IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  // Sky of the month: mark past events, highlight the next one, scroll it into view.
  var strip = $('[data-sky-strip]');
  if (strip) {
    var today = new Date();
    var key = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    var cards = $$('.sky-card', strip), next = null;
    cards.forEach(function (c) {
      if (c.dataset.end < key) c.classList.add('is-past');
      else if (!next) next = c;
    });
    var status = $('[data-sky-status]');
    if (next) {
      next.classList.add('is-next');
      if (next.dataset.date <= key) {
        var badge = $('[data-next-label]', next);
        if (badge) badge.textContent = isAr ? 'اليوم' : 'Today';
      }
      // Align the next event with the strip's starting edge (right in Arabic, left in English).
      var cr = next.getBoundingClientRect(), sr = strip.getBoundingClientRect();
      strip.scrollLeft += isAr ? cr.right - sr.right : cr.left - sr.left;
    } else if (status && cards.length) {
      status.hidden = false;
      status.textContent = isAr ? 'انتهت أحداث هذا الشهر، وينشر الاتحاد جدول الشهر القادم قريباً.' : 'This month’s events have passed; AUASS will publish next month’s guide soon.';
    }
    var step = function (dir) {
      var w = cards[0] ? cards[0].offsetWidth + 16 : 260;
      strip.scrollBy({ left: dir * w * (isAr ? -1 : 1), behavior: reduce ? 'auto' : 'smooth' });
    };
    var p = $('[data-sky-prev]'), n = $('[data-sky-next]');
    if (p) p.addEventListener('click', function () { step(-1); });
    if (n) n.addEventListener('click', function () { step(1); });
  }

  // Tonight's Moon (mean synodic month from a known new Moon; accurate to
  // within about a day) and the countdown to the 2 August 2027 eclipse.
  var tn = $('[data-tonight]');
  if (tn) {
    var ar = document.documentElement.lang === 'ar';
    var P = 29.530588853, ref = Date.UTC(2000, 0, 6, 18, 14);
    var age = ((Date.now() - ref) / 864e5 % P + P) % P, f = age / P;
    var k = Math.cos(2 * Math.PI * f), waxing = f < 0.5, rx = (45 * Math.abs(k)).toFixed(2);
    var inner = waxing ? (k > 0 ? 0 : 1) : (k > 0 ? 1 : 0);
    $('[data-moon-lit]', tn).setAttribute('d', 'M50 5A45 45 0 0 ' + (waxing ? 1 : 0) + ' 50 95A' + rx + ' 45 0 0 ' + inner + ' 50 5Z');
    var names = ar ? ['محاق', 'هلال متزايد', 'تربيع أول', 'أحدب متزايد', 'بدر', 'أحدب متناقص', 'تربيع أخير', 'هلال متناقص'] : ['New Moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full Moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
    var idx = Math.floor((f * 8) + 0.5) % 8;
    var lit = Math.round((1 - k) / 2 * 100), days = Math.floor(age);
    $('[data-moon-name]', tn).textContent = names[idx];
    $('[data-moon-info]', tn).textContent = ar ? ('الإضاءة نحو ' + lit + '٪ · عمر القمر ' + days + ' يوماً تقريباً') : ('About ' + lit + '% lit · ' + days + ' days since new Moon');
    var left = Math.ceil((Date.UTC(2027, 7, 2, 10, 7) - Date.now()) / 864e5);
    $('[data-eclipse-days]', tn).textContent = left > 0 ? (ar ? 'بعد ' + left + ' يوماً' : 'In ' + left + ' days') : (ar ? 'وقع في 2 آب 2027' : 'Took place on 2 August 2027');
    tn.hidden = false;
  }

  // Chip filters + optional search (events and news pages)
  var scope = $('[data-filter-scope]');
  if (scope) {
    var attr = scope.dataset.attr;
    var items = $$('[data-' + attr + ']', scope);
    var chipsEl = $('[data-chips]');
    var search = $('[data-search]');
    var empty = $('[data-empty]');
    var current = '';
    var apply = function () {
      var q = search ? search.value.trim().toLowerCase() : '';
      var shown = 0;
      items.forEach(function (it) {
        var ok = (!current || it.dataset[attr] === current) && (!q || (it.dataset.text || it.textContent.toLowerCase()).indexOf(q) !== -1);
        it.hidden = !ok;
        if (ok) shown++;
      });
      $$('[data-group]', scope).forEach(function (g) { g.hidden = !$$('[data-' + attr + ']', g).some(function (i) { return !i.hidden; }); });
      if (empty) empty.hidden = shown > 0;
    };
    if (chipsEl) chipsEl.addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      current = b.dataset.value;
      $$('.chip', chipsEl).forEach(function (c) { c.setAttribute('aria-pressed', String(c === b)); });
      apply();
    });
    if (search) search.addEventListener('input', apply);
  }

  // News: the first posts are in the page; search, type filter and "show more"
  // run over a JSON index of every post, fetched on first use.
  var newsEl = $('[data-news]');
  if (newsEl) {
    var nList = $('[data-news-list]', newsEl), nMore = $('[data-news-more]', newsEl), nStatus = $('[data-news-status]', newsEl);
    var nInput = $('[data-search]', newsEl), nChips = $('[data-chips]', newsEl), nEmpty = $('[data-empty]', newsEl);
    var isAr = document.documentElement.lang === 'ar';
    var nNorm = function (s) { return s.toLowerCase().replace(/[ً-ْ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه'); };
    var nEsc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    var MON = isAr ? ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'] : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var labels = {};
    $$('.chip', nChips).forEach(function (c) { if (c.dataset.value) labels[c.dataset.value] = c.textContent; });
    var data = null, nType = '', limit = Number(newsEl.dataset.first), PAGE = 24, loading = false;
    var fmt = function (d) { var p = d.split('-'); return Number(p[2]) + ' ' + MON[Number(p[1]) - 1] + ' ' + p[0]; };
    var card = function (it) {
      var tpl = $('template[data-fallback="' + it.y + '"]', newsEl);
      var media = it.i ? '<div class="frame"><img src="' + newsEl.dataset.site + it.i + '" alt="" loading="lazy" decoding="async"></div>' : (tpl ? tpl.innerHTML : '');
      return '<article class="news-card"><a class="card-link" href="' + newsEl.dataset.root + it.u + '">' + media +
        '<div class="nc-body"><p class="kicker">' + nEsc(labels[it.y] || '') + '</p><h2 class="nc-title">' + nEsc(it.t) + '</h2>' +
        '<p class="nc-date"><time datetime="' + it.d + '">' + fmt(it.d) + '</time></p></div></a></article>';
    };
    var render = function () {
      var q = nNorm(nInput.value.trim());
      var words = q.split(/\s+/).filter(Boolean);
      var hits = data.filter(function (it) {
        return (!nType || it.y === nType) && words.every(function (w) { return it.n.indexOf(w) !== -1; });
      });
      nList.innerHTML = hits.slice(0, limit).map(card).join('');
      nMore.hidden = hits.length <= limit;
      nEmpty.hidden = hits.length > 0;
      nStatus.textContent = (q || nType) ? (isAr ? hits.length + ' نتيجة' : hits.length + (hits.length === 1 ? ' result' : ' results')) : '';
    };
    var withData = function (fn) {
      if (data) return fn();
      if (loading) return;
      loading = true;
      nStatus.textContent = isAr ? 'جارٍ التحميل…' : 'Loading…';
      fetch(newsEl.dataset.index).then(function (r) { return r.json(); }).then(function (j) {
        data = j.map(function (it) { it.n = nNorm(it.t + ' ' + it.x); return it; });
        loading = false;
        fn();
      }).catch(function () { loading = false; nStatus.textContent = isAr ? 'تعذّر تحميل الأرشيف.' : 'Could not load the archive.'; });
    };
    var timer;
    nInput.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { limit = PAGE; withData(render); }, 180); });
    nChips.addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      nType = b.dataset.value;
      $$('.chip', nChips).forEach(function (c) { c.setAttribute('aria-pressed', String(c === b)); });
      limit = PAGE;
      withData(render);
    });
    nMore.addEventListener('click', function () { limit += PAGE; withData(render); });
  }

  // Video placeholders in archived posts: swap in the player on click.
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-yt]');
    if (!a || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    var f = document.createElement('iframe');
    f.src = 'https://www.youtube-nocookie.com/embed/' + a.dataset.yt + '?autoplay=1';
    f.title = 'YouTube';
    f.allow = 'autoplay; encrypted-media; picture-in-picture';
    f.allowFullscreen = true;
    a.parentNode.replaceChild(f, a);
  });

  // Library: collection cards + search across every item
  var lib = $('[data-library]');
  if (lib) {
    var input = $('[data-search]', lib);
    var cols = $$('.col-card', lib);
    var groups = $$('.lib-group', lib);
    var statusEl = $('[data-status]', lib);
    var emptyEl = $('[data-empty]', lib);
    var col = new URLSearchParams(location.search).get('c') || '';
    var norm = function (s) { return s.toLowerCase().replace(/[ً-ْ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه'); };
    var index = $$('.lib-item', lib).map(function (el) { return { el: el, text: norm(el.dataset.text) }; });
    // In the overview (no search, no collection) each group shows a preview
    // with a "show all" button, so long lists such as the 88 constellations
    // don't bury the rest of the library.
    var PREVIEW = 6, expanded = {};
    var run = function () {
      var q = norm(input.value.trim());
      var overview = !q && !col;
      var count = 0;
      groups.forEach(function (g) {
        var inCol = !col || g.dataset.group === col;
        var n = 0, matched = 0;
        $$('.lib-item', g).forEach(function (el) {
          var rec = index.find(function (x) { return x.el === el; });
          var ok = inCol && (!q || rec.text.indexOf(q) !== -1);
          if (ok) matched++;
          if (ok && overview && !expanded[g.dataset.group] && matched > PREVIEW) ok = false;
          el.hidden = !ok;
          if (ok) n++;
        });
        var more = $('[data-more]', g);
        if (more) more.hidden = !(overview && !expanded[g.dataset.group] && matched > PREVIEW);
        g.hidden = n === 0;
        count += matched;
      });
      cols.forEach(function (c) { c.setAttribute('aria-pressed', String(c.dataset.col === col)); });
      emptyEl.hidden = count > 0;
      statusEl.textContent = (q || col) ? (isAr ? 'عدد النتائج: ' + count : count + (count === 1 ? ' result' : ' results')) : '';
    };
    cols.forEach(function (c) {
      c.addEventListener('click', function () {
        col = col === c.dataset.col ? '' : c.dataset.col;
        var url = new URL(location.href);
        if (col) url.searchParams.set('c', col); else url.searchParams.delete('c');
        history.replaceState(null, '', url);
        run();
      });
    });
    groups.forEach(function (g) {
      var more = $('[data-more]', g);
      if (more) more.addEventListener('click', function () { expanded[g.dataset.group] = true; run(); });
    });
    input.addEventListener('input', run);
    run();
  }

  // Demo forms: validate, then explain that nothing is sent.
  $$('[data-demo-form]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = null;
      $$('[required]', form).forEach(function (f) {
        var ok = f.value.trim() !== '' && (f.type !== 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value));
        f.classList.toggle('invalid', !ok);
        f.setAttribute('aria-invalid', String(!ok));
        if (!ok && !bad) bad = f;
      });
      if (bad) { bad.focus(); return; }
      var msg = $('[data-demo-msg]', form);
      msg.hidden = false;
      msg.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    });
  });

  // Copy article link
  $$('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var done = function () { var c = $('[data-copied]'); if (c) { c.hidden = false; setTimeout(function () { c.hidden = true; }, 2500); } };
      if (navigator.clipboard) navigator.clipboard.writeText(b.dataset.copy).then(done, done); else done();
    });
  });
})();
