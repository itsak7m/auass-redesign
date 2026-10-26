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
