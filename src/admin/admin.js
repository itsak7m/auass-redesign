// AUASS content manager: edits the JSON files in content/ through the GitHub
// API. Every save is a commit on the main branch; the "Build site" workflow
// then rebuilds and publishes the site. No dependencies.
(function () {
  'use strict';
  var CFG = window.AUASS_ADMIN;
  var API = 'https://api.github.com';
  var app = document.getElementById('app');
  var token = null, user = null;

  // ---------- small helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'html') el.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === true) el.setAttribute(k, '');
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  var store = {
    get: function (k) { try { return sessionStorage.getItem(k) || localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v, remember) { try { (remember ? localStorage : sessionStorage).setItem(k, v); } catch (e) { /* private mode */ } },
    clear: function (k) { try { sessionStorage.removeItem(k); localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  var toastTimer;
  function toast(msg, kind) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast ' + (kind || ''); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, kind === 'err' ? 9000 : 5000);
  }
  var TYPES = { auass: 'أخبار الاتحاد', event: 'محاضرات وفعاليات', science: 'أخبار علمية', article: 'مقالات' };
  var EVENT_TYPES = { lecture: 'محاضرات وندوات', conference: 'مؤتمرات', workshop: 'ورش ودورات', observation: 'رصد وفعاليات عامة' };
  var MODES = { 'in-person': 'حضوري', online: 'عبر الإنترنت', hybrid: 'حضوري وعبر الإنترنت' };
  var VIS = { visible: 'مرئي من الأردن', limited: 'رصد محدود', none: 'غير مرئي من الأردن' };
  var GLYPHS = { 'moon-new': 'محاق', 'moon-first': 'تربيع أول', 'moon-full': 'بدر', 'moon-last': 'تربيع أخير', saturn: 'زحل', conj: 'اقتران', meteor: 'شهب', mercury: 'عطارد', venus: 'الزهرة', pleiades: 'الثريا', eclipse: 'كسوف' };
  var MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
  function fmtDate(d) { if (!d) return ''; var p = d.split('-'); return Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1] + ' ' + p[0]; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  // ---------- GitHub API ----------
  function api(path, opts) {
    opts = opts || {};
    var headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch(API + path, { method: opts.method || 'GET', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: 'no-store' })
      .then(function (r) {
        if (r.status === 204) return null;
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { var e = new Error(j.message || ('HTTP ' + r.status)); e.status = r.status; throw e; }
          return j;
        });
      });
  }
  var repoPath = function () { return '/repos/' + CFG.owner + '/' + CFG.repo; };
  function b64decode(s) { var bin = atob(s.replace(/\n/g, '')); var bytes = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new TextDecoder().decode(bytes); }
  function b64encodeBytes(bytes) { var s = ''; for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
  function getFile(path) {
    return api(repoPath() + '/contents/' + encodeURI(path) + '?ref=' + CFG.branch).then(function (f) { return { text: b64decode(f.content), sha: f.sha }; });
  }
  function getJSON(path) { return getFile(path).then(function (f) { return { data: JSON.parse(f.text), sha: f.sha }; }); }
  function putFile(path, base64, sha, message) {
    return api(repoPath() + '/contents/' + encodeURI(path), { method: 'PUT', body: { message: message, content: base64, sha: sha || undefined, branch: CFG.branch } });
  }
  function putJSON(path, data, sha, message, indent) {
    var text = JSON.stringify(data, null, indent == null ? 2 : indent) + '\n';
    return putFile(path, b64encodeBytes(new TextEncoder().encode(text)), sha, message);
  }
  function deleteFile(path, sha, message) {
    return api(repoPath() + '/contents/' + encodeURI(path), { method: 'DELETE', body: { message: message, sha: sha, branch: CFG.branch } });
  }
  // Read-modify-write on the latest version of a file, so two editors don't overwrite each other.
  function update(path, fn, message, indent) {
    return getJSON(path).then(function (f) { var next = fn(f.data); return putJSON(path, next, f.sha, message, indent); });
  }
  function listDir(path) { return api(repoPath() + '/contents/' + encodeURI(path) + '?ref=' + CFG.branch); }

  // Images are resized in the browser (max 1600px, WebP) before upload.
  function uploadImage(file, folder) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (blob) {
          if (!blob) return reject(new Error('تعذّر تجهيز الصورة'));
          blob.arrayBuffer().then(function (buf) {
            var name = today().replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 8) + '.webp';
            var path = 'docs/media/' + folder + '/' + name;
            putFile(path, b64encodeBytes(new Uint8Array(buf)), null, 'رفع صورة من لوحة التحكم')
              .then(function () { resolve({ value: 'media/' + folder + '/' + name, preview: c.toDataURL('image/webp', .7) }); }, reject);
          });
        }, 'image/webp', 0.82);
        URL.revokeObjectURL(img.src);
      };
      img.onerror = function () { reject(new Error('الملف ليس صورة صالحة')); };
      img.src = URL.createObjectURL(file);
    });
  }
  // Path of an image as the site stores it -> URL the panel can show.
  function imageURL(v) {
    if (!v) return '';
    if (/^(https?:|data:)/.test(v)) return v;
    if (/^(media|assets)\//.test(v)) return '../' + v;
    return '../assets/img/' + v;
  }

  // ---------- form fields ----------
  // Each field returns { el, read() }. read() gives the value to store.
  var F = {
    text: function (label, value, o) {
      o = o || {};
      var input = h('input', { type: o.type || 'text', value: value == null ? '' : value, dir: o.dir, required: o.required, placeholder: o.placeholder || '', pattern: o.pattern });
      return { el: field(label, input, o.hint), read: function () { return input.value.trim(); }, input: input };
    },
    area: function (label, value, o) {
      o = o || {};
      var ta = h('textarea', { rows: o.rows || 4, dir: o.dir, required: o.required, class: o.code ? 'code' : '' });
      ta.value = value == null ? '' : value;
      return { el: field(label, ta, o.hint), read: function () { return ta.value.trim(); }, input: ta };
    },
    date: function (label, value, o) { return F.text(label, value, Object.assign({ type: 'date' }, o)); },
    select: function (label, value, options, o) {
      var sel = h('select', {}, Object.keys(options).map(function (k) { return h('option', { value: k, selected: k === value }, [options[k]]); }));
      if (o && o.empty) sel.insertBefore(h('option', { value: '', selected: !value }, ['—']), sel.firstChild);
      return { el: field(label, sel), read: function () { return sel.value; } };
    },
    check: function (label, value) {
      var cb = h('input', { type: 'checkbox', checked: !!value });
      return { el: h('label', { class: 'check' }, [cb, h('span', {}, [label])]), read: function () { return cb.checked; } };
    },
    // Arabic + English pair.
    bi: function (label, value, o) {
      o = o || {}; value = value || {};
      var mk = o.area ? F.area : F.text;
      var ar = mk('بالعربية', value.ar, { dir: 'rtl', required: o.required, rows: o.rows });
      var en = mk('English', value.en, { dir: 'ltr', rows: o.rows });
      var box = h('fieldset', { class: 'bi' }, [h('legend', {}, [label]), ar.el, en.el]);
      return { el: box, read: function () { var v = { ar: ar.read() }; if (en.read()) v.en = en.read(); return v; } };
    },
    // Paragraph lists: one textarea per language, paragraphs separated by a blank line.
    paras: function (label, value) {
      value = value || {};
      var join = function (a) { return (a || []).join('\n\n'); };
      var split = function (s) { return s.split(/\n\s*\n/).map(function (x) { return x.trim(); }).filter(Boolean); };
      var ar = F.area('بالعربية', join(value.ar), { dir: 'rtl', rows: 10 });
      var en = F.area('English', join(value.en), { dir: 'ltr', rows: 10 });
      var box = h('fieldset', { class: 'bi' }, [h('legend', {}, [label]), h('p', { class: 'hint' }, ['اترك سطراً فارغاً بين كل فقرة والتي بعدها.']), ar.el, en.el]);
      return { el: box, read: function () { var v = { ar: split(ar.read()) }; var e = split(en.read()); if (e.length) v.en = e; return v; } };
    },
    lines: function (label, value, o) {
      var a = F.area(label, (value || []).join('\n'), Object.assign({ rows: 3, hint: 'سطر لكل عنصر.' }, o));
      return { el: a.el, read: function () { return a.read().split('\n').map(function (x) { return x.trim(); }).filter(Boolean); } };
    },
    image: function (label, value, folder) {
      var current = value || '';
      var img = h('img', { alt: '', src: imageURL(current), hidden: !current });
      var status = h('span', { class: 'hint' }, [current ? '' : 'لا توجد صورة']);
      var fileIn = h('input', { type: 'file', accept: 'image/*', class: 'sr' });
      var pick = h('button', { type: 'button', class: 'btn ghost', onclick: function () { fileIn.click(); } }, [current ? 'تغيير الصورة' : 'رفع صورة']);
      var remove = h('button', { type: 'button', class: 'btn link', hidden: !current, onclick: function () { current = ''; img.hidden = true; remove.hidden = true; status.textContent = 'ستُحذف الصورة عند الحفظ'; } }, ['إزالة']);
      fileIn.addEventListener('change', function () {
        var f = fileIn.files[0]; if (!f) return;
        status.textContent = 'جارٍ رفع الصورة…'; pick.disabled = true;
        uploadImage(f, folder || 'uploads').then(function (r) {
          current = r.value; img.src = r.preview; img.hidden = false; remove.hidden = false;
          status.textContent = 'تم رفع الصورة'; pick.disabled = false;
        }, function (e) { status.textContent = 'تعذّر الرفع: ' + e.message; pick.disabled = false; });
      });
      var box = h('div', { class: 'field image-field' }, [h('span', { class: 'lbl' }, [label]), h('div', { class: 'img-row' }, [img, h('div', {}, [pick, remove, fileIn, status])])]);
      return { el: box, read: function () { return current; } };
    }
  };
  function field(label, control, hint) {
    var id = 'f' + Math.random().toString(36).slice(2, 9);
    control.id = id;
    return h('div', { class: 'field' }, [h('label', { for: id, class: 'lbl' }, [label]), control, hint ? h('p', { class: 'hint' }, [hint]) : null]);
  }

  // ---------- layout ----------
  var NAV = [
    ['#/', 'الرئيسية', 'home'], ['#/news', 'الأخبار', 'news'], ['#/events', 'الفعاليات', 'calendar'], ['#/sky', 'سماء الشهر', 'moon'],
    ['#/council', 'المجلس الأعلى', 'people'], ['#/archive', 'الأرشيف', 'archive'], ['#/pages', 'الصفحات', 'page']
  ];
  var ICONS = {
    home: '<path d="M4 11l8-6.5 8 6.5M6.5 9.5V19.5h11V9.5"/>', news: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 12.5h8M8 16h5"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>', moon: '<path d="M15 4a8.5 8.5 0 1 0 5 12A7 7 0 0 1 15 4z"/>',
    people: '<circle cx="9" cy="9" r="3.2"/><circle cx="16.5" cy="10" r="2.5"/><path d="M3.5 19c.6-3.4 2.8-5.5 5.5-5.5s4.9 2.1 5.5 5.5M14.5 14.2c2.6-.3 4.5 1.4 5 4.3"/>',
    archive: '<rect x="3.5" y="4.5" width="17" height="4.5" rx="1"/><path d="M5 9v10.5h14V9M10 13h4"/>', page: '<path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14.5 3.5V8H19"/>',
    out: '<path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"/>', ext: '<path d="M14 4.5h5.5V10M19.5 4.5L11 13M17 14v5.5H4.5V7H10"/>', plus: '<path d="M12 5v14M5 12h14"/>'
  };
  var ico = function (n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[n] + '</svg>'; };

  function shell(active, title, body, actions) {
    app.innerHTML = '';
    var nav = h('nav', { class: 'side', 'aria-label': 'أقسام اللوحة' }, [
      h('a', { class: 'brand', href: '#/' }, [h('img', { src: '../assets/img/auass-seal.png', alt: '', width: 40, height: 44 }), h('span', {}, [h('b', {}, ['لوحة التحكم']), h('small', {}, ['الاتحاد العربي لعلوم الفضاء والفلك'])])]),
      h('ul', {}, NAV.map(function (n) { return h('li', {}, [h('a', { href: n[0], 'aria-current': n[0] === active ? 'page' : false, html: ico(n[2]) + '<span>' + n[1] + '</span>' })]); })),
      h('div', { class: 'side-foot' }, [
        h('a', { href: CFG.site, target: '_blank', rel: 'noopener', html: ico('ext') + '<span>عرض الموقع</span>' }),
        user ? h('div', { class: 'who' }, [h('img', { src: user.avatar_url, alt: '', width: 28, height: 28 }), h('span', {}, [user.login])]) : null,
        h('button', { type: 'button', class: 'btn link', onclick: signOut, html: ico('out') + '<span>خروج</span>' })
      ])
    ]);
    var head = h('header', { class: 'top' }, [h('h1', {}, [title]), h('div', { class: 'actions' }, actions || [])]);
    app.appendChild(h('div', { class: 'layout' }, [nav, h('main', { class: 'main' }, [head, body])]));
    var cur = nav.querySelector('[aria-current]');
    if (cur && window.matchMedia('(max-width: 860px)').matches) cur.scrollIntoView({ inline: 'center', block: 'nearest' });
    window.scrollTo(0, 0);
  }
  function loading(active, title) { shell(active, title, h('p', { class: 'muted' }, ['جارٍ التحميل…'])); }
  function fail(e) {
    if (e && e.status === 401) { signOut(); toast('انتهت صلاحية الدخول. سجّل الدخول من جديد.', 'err'); return; }
    toast('حدث خطأ: ' + (e && e.message ? e.message : e), 'err');
  }
  function saved(link) {
    toast('تم الحفظ. سيظهر التعديل على الموقع خلال دقيقتين تقريباً.', 'ok');
    if (link) setTimeout(function () { location.hash = link; }, 400);
  }
  function busy(btn, on) { btn.disabled = on; btn.classList.toggle('is-busy', on); }

  // ---------- sign in ----------
  function signInView(msg) {
    app.innerHTML = '';
    var tok = h('input', { type: 'password', id: 'tok', dir: 'ltr', autocomplete: 'off', placeholder: 'github_pat_…', required: true });
    var remember = h('input', { type: 'checkbox', id: 'rem' });
    var err = h('p', { class: 'err', hidden: !msg }, [msg || '']);
    var go = h('button', { type: 'submit', class: 'btn brass wide' }, ['دخول']);
    var form = h('form', { class: 'login-card', onsubmit: function (e) {
      e.preventDefault(); busy(go, true); err.hidden = true;
      tryToken(tok.value.trim(), remember.checked).catch(function (e2) { busy(go, false); err.textContent = e2.message; err.hidden = false; });
    } }, [
      h('img', { src: '../assets/img/auass-seal.png', alt: 'شعار الاتحاد', width: 72, height: 80 }),
      h('h1', {}, ['لوحة تحكم الموقع']),
      h('p', { class: 'muted' }, ['الاتحاد العربي لعلوم الفضاء والفلك']),
      CFG.oauthUrl ? h('button', { type: 'button', class: 'btn navy wide', onclick: oauthSignIn }, ['الدخول بحساب GitHub']) : null,
      CFG.oauthUrl ? h('p', { class: 'or' }, ['أو']) : null,
      h('label', { for: 'tok', class: 'lbl' }, ['رمز الدخول (GitHub token)']), tok,
      h('label', { class: 'check' }, [remember, h('span', {}, ['تذكّرني على هذا الجهاز'])]),
      err, go,
      h('details', { class: 'help' }, [h('summary', {}, ['كيف أحصل على رمز الدخول؟']), h('ol', { html:
        '<li>افتح <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">صفحة إنشاء الرموز في GitHub</a>.</li>' +
        '<li>في Repository access اختر Only select repositories ثم <span dir="ltr">' + esc(CFG.owner + '/' + CFG.repo) + '</span>.</li>' +
        '<li>في Repository permissions اجعل Contents على Read and write.</li>' +
        '<li>اكبس Generate token وانسخ الرمز والصقه هنا. لا تشاركه مع أحد.</li>' })])
    ]);
    app.appendChild(h('div', { class: 'login' }, [form]));
    tok.focus();
  }
  function tryToken(t, remember) {
    if (!t) return Promise.reject(new Error('الصق رمز الدخول أولاً.'));
    token = t;
    return api(repoPath()).then(function (repo) {
      if (!repo.permissions || !repo.permissions.push) throw new Error('هذا الرمز لا يملك صلاحية الكتابة على الموقع.');
      store.set('auass-token', t, remember);
      return api('/user').then(function (u) { user = u; }, function () { user = null; });
    }).then(route, function (e) {
      token = null;
      throw new Error(e.status === 401 ? 'الرمز غير صحيح أو منتهي الصلاحية.' : e.status === 404 ? 'الرمز لا يصل إلى مستودع الموقع. تأكد من اختيار المستودع عند إنشائه.' : e.message);
    });
  }
  function oauthSignIn() {
    var w = window.open(CFG.oauthUrl.replace(/\/$/, '') + '/auth', 'auass-oauth', 'width=600,height=720');
    var origin = new URL(CFG.oauthUrl).origin;
    window.addEventListener('message', function onMsg(e) {
      if (e.origin !== origin || !e.data || e.data.type !== 'auass-oauth') return;
      window.removeEventListener('message', onMsg);
      if (w) w.close();
      if (e.data.token) tryToken(e.data.token, true).catch(function (err) { signInView(err.message); });
      else signInView('لم يكتمل الدخول عبر GitHub.');
    });
  }
  function signOut() { token = null; user = null; store.clear('auass-token'); location.hash = '#/'; signInView(); }

  // ---------- dashboard ----------
  function dashboard() {
    loading('#/', 'أهلاً بك');
    Promise.all([getJSON('content/news.json'), getJSON('content/events.json'), getJSON('content/sky.json'), api(repoPath() + '/commits?per_page=8&sha=' + CFG.branch), fetch('../news/index.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return []; })])
      .then(function (r) {
        var news = r[0].data.posts, evs = r[1].data.items, sky = r[2].data, commits = r[3], idx = r[4];
        var latestNews = news.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0];
        var latestEv = evs.slice().sort(function (a, b) { return a.start < b.start ? 1 : -1; })[0];
        var skyEnd = sky.events.map(function (e) { return e.end || e.date; }).sort().pop();
        var skyOld = skyEnd && skyEnd < today();
        var cards = h('div', { class: 'cards' }, [
          card('#/news/new', 'plus', 'خبر جديد', 'أضف خبراً بالعربية والإنجليزية مع صورة.', 'brass'),
          card('#/events/new', 'plus', 'فعالية جديدة', 'محاضرة أو ورشة أو مؤتمر أو أمسية رصد.', 'brass'),
          card('#/news', 'news', news.length + ' خبراً محرراً', latestNews ? 'آخرها: ' + latestNews.title.ar : ''),
          card('#/events', 'calendar', evs.length + ' فعالية', latestEv ? 'آخرها: ' + latestEv.title.ar + ' (' + fmtDate(latestEv.start) + ')' : ''),
          card('#/sky', 'moon', 'سماء الشهر: ' + sky.month.ar, skyOld ? 'انتهت أحداث هذا الشهر. حدّثها بجدول الشهر الجديد.' : sky.events.length + ' حدثاً فلكياً', skyOld ? 'warn' : ''),
          card('#/archive', 'archive', idx.length + ' منشوراً في الأرشيف', 'ابحث في الأرشيف وعدّل أي منشور.')
        ]);
        var log = h('ol', { class: 'log' }, commits.map(function (c) {
          var d = new Date(c.commit.author.date);
          return h('li', {}, [h('span', { class: 'log-msg' }, [c.commit.message.split('\n')[0]]), h('span', { class: 'muted' }, [h('bdi', {}, [c.author ? c.author.login : c.commit.author.name]), ' · ' + d.toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' })])]);
        }));
        var body = h('div', {}, [cards, h('section', { class: 'panel' }, [h('h2', {}, ['آخر التعديلات على الموقع']), log])]);
        shell('#/', user ? 'أهلاً ' + (user.name || user.login) : 'أهلاً بك', body, [h('a', { class: 'btn ghost', href: CFG.site, target: '_blank', rel: 'noopener' }, ['عرض الموقع'])]);
      }).catch(fail);
  }
  function card(href, icon, title, text, kind) {
    return h('a', { class: 'card ' + (kind || ''), href: href }, [h('span', { class: 'card-ico', html: ico(icon) }), h('b', {}, [title]), h('span', { class: 'muted' }, [text || ''])]);
  }

  // ---------- generic list + editor for arrays inside one JSON file ----------
  function listView(o) {
    loading(o.route, o.title);
    getJSON(o.path).then(function (f) {
      var items = o.items(f.data);
      var q = h('input', { type: 'search', placeholder: 'ابحث…', class: 'search' });
      var ul = h('ul', { class: 'rows' });
      var draw = function () {
        var s = q.value.trim().toLowerCase();
        ul.innerHTML = '';
        o.sort(items.slice()).forEach(function (it, i) {
          var t = o.rowTitle(it);
          if (s && (t + ' ' + o.rowMeta(it)).toLowerCase().indexOf(s) === -1) return;
          ul.appendChild(h('li', {}, [h('a', { href: o.route + '/' + encodeURIComponent(o.key(it, items.indexOf(it))) }, [
            o.thumb && o.thumb(it) ? h('img', { src: imageURL(o.thumb(it)), alt: '', loading: 'lazy' }) : h('span', { class: 'row-ico', html: ico(o.icon) }),
            h('span', { class: 'row-main' }, [h('b', {}, [t]), h('span', { class: 'muted' }, [o.rowMeta(it)])])
          ])]));
        });
        if (!ul.children.length) ul.appendChild(h('li', { class: 'muted pad' }, ['لا توجد نتائج.']));
      };
      q.addEventListener('input', draw); draw();
      shell(o.route, o.title, h('div', {}, [o.intro ? h('p', { class: 'muted intro' }, [o.intro]) : null, q, ul]),
        o.canAdd === false ? [] : [h('a', { class: 'btn brass', href: o.route + '/new', html: ico('plus') + '<span>' + o.addLabel + '</span>' })]);
    }).catch(fail);
  }
  function editView(o, keyParam) {
    var isNew = keyParam === 'new';
    loading(o.route, isNew ? o.addLabel : 'تعديل');
    getJSON(o.path).then(function (f) {
      var items = o.items(f.data);
      var idx = isNew ? -1 : items.findIndex(function (it, i) { return String(o.key(it, i)) === decodeURIComponent(keyParam); });
      if (!isNew && idx < 0) { toast('العنصر غير موجود.', 'err'); location.hash = o.route; return; }
      var original = isNew ? o.blank() : items[idx];
      var form = o.form(original, isNew);
      var save = h('button', { type: 'submit', class: 'btn brass' }, ['حفظ ونشر']);
      var del = isNew ? null : h('button', { type: 'button', class: 'btn danger', onclick: function () {
        if (!confirm('حذف «' + o.rowTitle(original) + '» نهائياً من الموقع؟')) return;
        busy(del, true);
        update(o.path, function (data) {
          var arr = o.items(data); var i = arr.findIndex(function (it, j) { return String(o.key(it, j)) === String(o.key(original, idx)); });
          if (i >= 0) arr.splice(i, 1); return data;
        }, 'حذف: ' + o.rowTitle(original) + ' (من لوحة التحكم)', o.indent).then(function () { saved(o.route); }, function (e) { busy(del, false); fail(e); });
      } }, ['حذف']);
      var el = h('form', { class: 'editor', onsubmit: function (e) {
        e.preventDefault();
        var value = Object.assign({}, original, form.read());
        var problem = o.validate && o.validate(value, items, isNew ? -1 : idx);
        if (problem) { toast(problem, 'err'); return; }
        busy(save, true);
        update(o.path, function (data) {
          var arr = o.items(data);
          if (isNew) arr.push(value);
          else { var i = arr.findIndex(function (it, j) { return String(o.key(it, j)) === String(o.key(original, idx)); }); if (i < 0) arr.push(value); else arr[i] = value; }
          return data;
        }, (isNew ? 'إضافة: ' : 'تعديل: ') + o.rowTitle(value) + ' (من لوحة التحكم)', o.indent).then(function () { saved(o.route); }, function (e2) { busy(save, false); fail(e2); });
      } }, [form.el, h('div', { class: 'form-actions' }, [save, h('a', { class: 'btn ghost', href: o.route }, ['إلغاء']), del])]);
      shell(o.route, isNew ? o.addLabel : o.rowTitle(original), el, o.viewLink && !isNew ? [h('a', { class: 'btn ghost', href: CFG.site + o.viewLink(original), target: '_blank', rel: 'noopener', html: ico('ext') + '<span>عرض على الموقع</span>' })] : []);
    }).catch(fail);
  }
  function group(title, fields) {
    return { el: h('section', { class: 'panel' }, [h('h2', {}, [title])].concat(fields.map(function (f) { return f.el; }))), fields: fields };
  }
  function makeForm(groups, assemble) {
    return { el: h('div', {}, groups.map(function (g) { return g.el; })), read: assemble };
  }

  // ---------- collections ----------
  var NEWS = {
    route: '#/news', title: 'الأخبار المحررة', addLabel: 'خبر جديد', icon: 'news', path: 'content/news.json',
    intro: 'الأخبار التي تظهر أولاً على الموقع بالعربية والإنجليزية. منشورات الموقع القديم في قسم الأرشيف.',
    items: function (d) { return d.posts; }, key: function (it) { return it.slug; },
    sort: function (a) { return a.sort(function (x, y) { return x.date < y.date ? 1 : -1; }); },
    rowTitle: function (it) { return (it.title && it.title.ar) || it.slug; },
    rowMeta: function (it) { return fmtDate(it.date) + ' · ' + (TYPES[it.type] || ''); },
    thumb: function (it) { return it.image; },
    viewLink: function (it) { return 'news/' + it.slug + '/'; },
    blank: function () { return { slug: '', date: today(), type: 'auass', title: { ar: '' }, excerpt: { ar: '' }, body: { ar: [] } }; },
    validate: function (v, items, idx) {
      if (!/^[a-z0-9-]+$/.test(v.slug)) return 'رابط الخبر يجب أن يكون بحروف إنجليزية صغيرة وأرقام وشرطات فقط.';
      if (items.some(function (it, i) { return i !== idx && it.slug === v.slug; })) return 'يوجد خبر آخر بنفس الرابط.';
      if (!v.title.ar) return 'أدخل عنوان الخبر بالعربية.';
      if (!v.body.ar.length) return 'أدخل نص الخبر بالعربية.';
    },
    form: function (p, isNew) {
      var title = F.bi('العنوان', p.title, { required: true });
      var slug = F.text('رابط الخبر (بالإنجليزية)', p.slug, { dir: 'ltr', required: true, pattern: '[a-z0-9\\-]+', hint: 'مثل: moon-observation-night. يظهر في عنوان الصفحة ولا يُفضّل تغييره بعد النشر.' });
      var date = F.date('التاريخ', p.date, { required: true });
      var type = F.select('النوع', p.type, TYPES);
      var featured = F.check('خبر مميز', p.featured);
      var image = F.image('الصورة', p.image, 'uploads');
      var excerpt = F.bi('الملخص', p.excerpt, { area: true, rows: 3 });
      var body = F.paras('النص', p.body);
      if (isNew) title.el.querySelector('input').addEventListener('change', function () {
        var en = title.el.querySelectorAll('input')[1].value;
        if (!slug.input.value && en) slug.input.value = en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
      });
      return makeForm([group('العنوان والتصنيف', [title, slug, date, type, featured]), group('الصورة', [image]), group('المحتوى', [excerpt, body])], function () {
        var v = { slug: slug.read(), date: date.read(), type: type.read(), title: title.read(), excerpt: excerpt.read(), body: body.read() };
        if (featured.read()) v.featured = true; else v.featured = undefined;
        v.image = image.read() || undefined;
        return v;
      });
    }
  };
  var EVENTS = {
    route: '#/events', title: 'الفعاليات', addLabel: 'فعالية جديدة', icon: 'calendar', path: 'content/events.json',
    items: function (d) { return d.items; }, key: function (it) { return it.id; },
    sort: function (a) { return a.sort(function (x, y) { return x.start < y.start ? 1 : -1; }); },
    rowTitle: function (it) { return (it.title && it.title.ar) || it.id; },
    rowMeta: function (it) { return fmtDate(it.start) + ' · ' + (EVENT_TYPES[it.type] || '') + ' · ' + ((it.place && it.place.ar) || ''); },
    viewLink: function () { return 'events/'; },
    blank: function () { return { id: '', type: 'lecture', start: today(), title: { ar: '' }, place: { ar: '' }, mode: 'in-person', summary: { ar: '' } }; },
    validate: function (v, items, idx) {
      if (!v.title.ar) return 'أدخل عنوان الفعالية بالعربية.';
      if (!v.start) return 'أدخل تاريخ الفعالية.';
      if (v.end && v.end < v.start) return 'تاريخ الانتهاء قبل تاريخ البدء.';
      if (items.some(function (it, i) { return i !== idx && it.id === v.id; })) return 'يوجد فعالية أخرى بنفس المعرّف.';
    },
    form: function (e, isNew) {
      var title = F.bi('العنوان', e.title, { required: true });
      var type = F.select('النوع', e.type, EVENT_TYPES);
      var start = F.date('تاريخ البدء', e.start, { required: true });
      var end = F.date('تاريخ الانتهاء (اختياري)', e.end);
      var mode = F.select('طريقة الحضور', e.mode, MODES);
      var place = F.bi('المكان', e.place);
      var summary = F.bi('الوصف', e.summary, { area: true, rows: 3 });
      var news = F.text('رابط الخبر المرتبط (اختياري)', e.news, { dir: 'ltr', hint: 'رابط خبر من قسم الأخبار، مثل arab-space-innovation-hackathon.' });
      return makeForm([group('الفعالية', [title, type, start, end]), group('المكان والتفاصيل', [mode, place, summary, news])], function () {
        var v = { type: type.read(), start: start.read(), title: title.read(), place: place.read(), mode: mode.read(), summary: summary.read() };
        v.id = isNew ? (v.start + '-' + Math.random().toString(36).slice(2, 6)) : e.id;
        v.end = end.read() || undefined; v.news = news.read() || undefined;
        return v;
      });
    }
  };
  var COUNCIL = {
    route: '#/council', title: 'المجلس الأعلى', addLabel: 'عضو جديد', icon: 'people', path: 'content/council.json', indent: 1,
    items: function (d) { return d.members; }, key: function (it, i) { return i; },
    sort: function (a) { return a; },
    rowTitle: function (it) { return it.name.ar; },
    rowMeta: function (it) { return [it.country && it.country.ar, (it.roles && it.roles.ar || [])[0]].filter(Boolean).join(' · '); },
    thumb: function (it) { return it.photo; },
    viewLink: function () { return 'about/council/'; },
    blank: function () { return { name: { ar: '' }, country: { ar: '' }, roles: { ar: [], en: [] }, photo: '' }; },
    validate: function (v) { if (!v.name.ar) return 'أدخل اسم العضو بالعربية.'; },
    form: function (m) {
      var name = F.bi('الاسم', m.name, { required: true });
      var country = F.bi('الدولة', m.country);
      var rolesAr = F.lines('المناصب بالعربية', m.roles && m.roles.ar, { dir: 'rtl' });
      var rolesEn = F.lines('Roles in English', m.roles && m.roles.en, { dir: 'ltr' });
      var photo = F.image('الصورة', m.photo, 'uploads');
      return makeForm([group('العضو', [name, country, photo]), group('المناصب', [rolesAr, rolesEn])], function () {
        return { name: name.read(), country: country.read(), roles: { ar: rolesAr.read(), en: rolesEn.read() }, photo: photo.read() };
      });
    }
  };

  // Sky of the month: one form for the whole file.
  function skyView() {
    loading('#/sky', 'سماء الشهر');
    getJSON('content/sky.json').then(function (f) {
      var s = f.data;
      var month = F.bi('الشهر', s.month, { required: true });
      var credit = F.bi('المصدر', s.credit);
      var source = F.text('خبر المصدر (رابط من قسم الأخبار)', s.source, { dir: 'ltr' });
      var evWrap = h('div', { class: 'repeat' }), phWrap = h('div', { class: 'repeat' });
      var evRows = [], phRows = [];
      function addEvent(e) {
        e = e || { date: today(), glyph: 'moon-full', vis: 'visible', title: { ar: '' }, note: { ar: '' } };
        var r = { date: F.date('التاريخ', e.date, { required: true }), end: F.date('حتى (اختياري)', e.end), time: F.text('الوقت (مثل 16:25)', e.time, { dir: 'ltr', pattern: '[0-2][0-9]:[0-5][0-9]' }),
          glyph: F.select('الرمز', e.glyph, GLYPHS), vis: F.select('الرؤية', e.vis, VIS), title: F.bi('العنوان', e.title, { required: true }), note: F.bi('ملاحظة', e.note, { area: true, rows: 2 }), orig: e };
        var box = h('div', { class: 'repeat-item' }, [h('div', { class: 'grid3' }, [r.date.el, r.end.el, r.time.el, r.glyph.el, r.vis.el]), r.title.el, r.note.el,
          h('button', { type: 'button', class: 'btn link danger-text', onclick: function () { box.remove(); evRows.splice(evRows.indexOf(r), 1); } }, ['حذف هذا الحدث'])]);
        evRows.push(r); evWrap.appendChild(box);
      }
      function addPhase(p) {
        p = p || { date: today(), glyph: 'moon-full', label: { ar: 'البدر', en: 'Full Moon' } };
        var r = { date: F.date('التاريخ', p.date, { required: true }), glyph: F.select('الطور', p.glyph, { 'moon-new': 'محاق', 'moon-first': 'تربيع أول', 'moon-full': 'بدر', 'moon-last': 'تربيع أخير' }), label: F.bi('التسمية', p.label) };
        var box = h('div', { class: 'repeat-item' }, [h('div', { class: 'grid3' }, [r.date.el, r.glyph.el]), r.label.el,
          h('button', { type: 'button', class: 'btn link danger-text', onclick: function () { box.remove(); phRows.splice(phRows.indexOf(r), 1); } }, ['حذف'])]);
        phRows.push(r); phWrap.appendChild(box);
      }
      s.events.forEach(addEvent); s.phases.forEach(addPhase);
      var save = h('button', { type: 'submit', class: 'btn brass' }, ['حفظ ونشر']);
      var form = h('form', { class: 'editor', onsubmit: function (e) {
        e.preventDefault(); busy(save, true);
        var events = evRows.map(function (r) {
          var v = Object.assign({}, r.orig, { date: r.date.read(), glyph: r.glyph.read(), vis: r.vis.read(), title: r.title.read(), note: r.note.read() });
          v.end = r.end.read() || undefined; v.time = r.time.read() || undefined;
          return v;
        }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
        var phases = phRows.map(function (r) { return { date: r.date.read(), glyph: r.glyph.read(), label: r.label.read() }; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
        update('content/sky.json', function (d) {
          d.month = month.read(); d.credit = credit.read(); d.source = source.read(); d.events = events; d.phases = phases; return d;
        }, 'تحديث سماء الشهر: ' + month.read().ar + ' (من لوحة التحكم)').then(function () { busy(save, false); saved(); }, function (e2) { busy(save, false); fail(e2); });
      } }, [
        group('الشهر', [month, credit, source]).el,
        h('section', { class: 'panel' }, [h('h2', {}, ['الأحداث الفلكية']), h('p', { class: 'hint' }, ['الموقع يميّز الحدث القادم تلقائياً حسب تاريخ اليوم.']), evWrap, h('button', { type: 'button', class: 'btn ghost', onclick: function () { addEvent(); }, html: ico('plus') + '<span>إضافة حدث</span>' })]),
        h('section', { class: 'panel' }, [h('h2', {}, ['أطوار القمر']), phWrap, h('button', { type: 'button', class: 'btn ghost', onclick: function () { addPhase(); }, html: ico('plus') + '<span>إضافة طور</span>' })]),
        h('div', { class: 'form-actions' }, [save])
      ]);
      shell('#/sky', 'سماء الشهر', form, [h('a', { class: 'btn ghost', href: CFG.site + '#sky', target: '_blank', rel: 'noopener', html: ico('ext') + '<span>عرض على الموقع</span>' })]);
    }).catch(fail);
  }

  // ---------- archive (one JSON file per post) ----------
  var archiveIndex = null;
  function archiveView() {
    loading('#/archive', 'أرشيف المنشورات');
    var load = archiveIndex ? Promise.resolve(archiveIndex) : Promise.all(['../news/index.json', '../en/news/index.json'].map(function (u, i) {
      return fetch(u, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (a) { return a.filter(function (x) { return /^news\/\d+\/$/.test(x.u); }).map(function (x) { x.lang = i ? 'en' : 'ar'; x.id = x.u.replace(/\D/g, ''); return x; }); });
    })).then(function (r) { archiveIndex = r[0].concat(r[1]).sort(function (a, b) { return a.d < b.d ? 1 : -1; }); return archiveIndex; });
    load.then(function (all) {
      var norm = function (s) { return s.toLowerCase().replace(/[ً-ْ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه'); };
      var q = h('input', { type: 'search', placeholder: 'ابحث بالعنوان أو رقم المنشور…', class: 'search' });
      var type = h('select', {}, [h('option', { value: '' }, ['كل الأنواع'])].concat(Object.keys(TYPES).map(function (k) { return h('option', { value: k }, [TYPES[k]]); })));
      var ul = h('ul', { class: 'rows' }), more = h('button', { type: 'button', class: 'btn ghost' }, ['عرض المزيد']), count = h('p', { class: 'muted' });
      var limit = 40;
      var draw = function () {
        var s = norm(q.value.trim()), ty = type.value;
        var hits = all.filter(function (x) { return (!ty || x.y === ty) && (!s || x.id === s || norm(x.t + ' ' + x.x).indexOf(s) !== -1); });
        count.textContent = hits.length + ' منشوراً';
        ul.innerHTML = '';
        hits.slice(0, limit).forEach(function (x) {
          ul.appendChild(h('li', {}, [h('a', { href: '#/archive/' + x.id }, [
            x.i ? h('img', { src: '../' + x.i, alt: '', loading: 'lazy' }) : h('span', { class: 'row-ico', html: ico('archive') }),
            h('span', { class: 'row-main' }, [h('b', { dir: 'auto' }, [x.t]), h('span', { class: 'muted' }, [fmtDate(x.d) + ' · ' + (TYPES[x.y] || '') + ' · رقم ' + x.id + (x.lang === 'en' ? ' · English' : '')])])
          ])]));
        });
        more.hidden = hits.length <= limit;
      };
      q.addEventListener('input', function () { limit = 40; draw(); }); type.addEventListener('change', function () { limit = 40; draw(); });
      more.addEventListener('click', function () { limit += 40; draw(); });
      draw();
      shell('#/archive', 'أرشيف المنشورات', h('div', {}, [h('p', { class: 'muted intro' }, ['منشورات موقع الاتحاد القديم بعد نقلها. القائمة من النسخة المنشورة، فالمنشورات المعدّلة للتو قد تظهر بعناوينها القديمة لدقيقتين.']), h('div', { class: 'filters' }, [q, type]), count, ul, more]));
    }).catch(fail);
  }
  function archiveEdit(id) {
    var path = 'content/posts/' + id + '.json';
    loading('#/archive', 'منشور ' + id);
    getJSON(path).then(function (f) {
      var p = f.data;
      var dir = p.lang === 'ar' ? 'rtl' : 'ltr';
      var title = F.text('العنوان', p.title, { dir: dir, required: true });
      var date = F.date('التاريخ', p.date);
      var type = F.select('النوع', p.type, TYPES);
      var excerpt = F.area('الملخص', p.excerpt, { dir: dir, rows: 3 });
      var body = F.area('النص (HTML)', p.body, { dir: dir, rows: 18, code: true, hint: 'الوسوم المسموحة: p وh2 وh3 وul وli وstrong وa وimg. الصور تبدأ بـ @media/.' });
      var trT = F.text('Title in English', p.en && p.en.title, { dir: 'ltr' });
      var trX = F.area('Summary in English', p.en && p.en.excerpt, { dir: 'ltr', rows: 3 });
      var trB = F.area('Text in English (HTML, optional)', p.en && p.en.body, { dir: 'ltr', rows: 10, code: true });
      var preview = h('div', { class: 'preview prose', dir: dir });
      var showPrev = function () { preview.innerHTML = body.read().replace(/@media\//g, '../media/').replace(/<script[\s\S]*?<\/script>/gi, ''); };
      body.input.addEventListener('input', showPrev); showPrev();
      var save = h('button', { type: 'submit', class: 'btn brass' }, ['حفظ ونشر']);
      var groups = [group('المنشور', [title, date, type, excerpt]), group('النص', [body]), { el: h('section', { class: 'panel' }, [h('h2', {}, ['معاينة']), preview]) }];
      if (p.lang === 'ar') groups.push(group('الترجمة الإنجليزية', [trT, trX, trB]));
      var form = h('form', { class: 'editor', onsubmit: function (e) {
        e.preventDefault(); busy(save, true);
        getJSON(path).then(function (latest) {
          var v = latest.data;
          v.title = title.read(); v.date = date.read(); v.type = type.read(); v.excerpt = excerpt.read(); v.body = body.read();
          if (p.lang === 'ar') {
            var en = { title: trT.read(), excerpt: trX.read(), body: trB.read() };
            Object.keys(en).forEach(function (k) { if (!en[k]) delete en[k]; });
            if (Object.keys(en).length) v.en = Object.assign({}, v.en, en); else delete v.en;
          }
          return putJSON(path, v, latest.sha, 'تعديل منشور من الأرشيف: ' + v.title + ' (من لوحة التحكم)', 1);
        }).then(function () { busy(save, false); archiveIndex = null; saved(); }, function (e2) { busy(save, false); fail(e2); });
      } }, groups.map(function (g) { return g.el; }).concat([h('div', { class: 'form-actions' }, [save, h('a', { class: 'btn ghost', href: '#/archive' }, ['رجوع'])])]));
      shell('#/archive', p.title, form, [h('a', { class: 'btn ghost', href: CFG.site + (p.lang === 'en' ? 'en/' : '') + 'news/' + id + '/', target: '_blank', rel: 'noopener', html: ico('ext') + '<span>عرض على الموقع</span>' })]);
    }).catch(fail);
  }

  // ---------- migrated pages ----------
  var SECTIONS = { events: 'المؤتمرات', about: 'عن الاتحاد', library: 'المكتبة' };
  function pagesView() {
    loading('#/pages', 'الصفحات');
    listDir('content/pages').then(function (files) {
      return Promise.all(files.filter(function (x) { return /\.json$/.test(x.name); }).map(function (x) { return getJSON(x.path).then(function (r) { return r.data; }); }));
    }).then(function (pages) {
      var body = h('div', {}, Object.keys(SECTIONS).map(function (sec) {
        return h('section', { class: 'panel' }, [h('h2', {}, [SECTIONS[sec]]), h('ul', { class: 'rows' }, pages.filter(function (p) { return p.section === sec; }).sort(function (a, b) { return a.order - b.order; }).map(function (p) {
          return h('li', {}, [h('a', { href: '#/pages/' + p.slug }, [h('span', { class: 'row-ico', html: ico('page') }), h('span', { class: 'row-main' }, [h('b', {}, [p.title.ar || p.title.en]), h('span', { class: 'muted' }, [p.body.en ? 'بالعربية والإنجليزية' : p.body.ar ? 'بالعربية' : 'بالإنجليزية'])])])]);
        }))]);
      }));
      shell('#/pages', 'الصفحات', body);
    }).catch(fail);
  }
  function pageEdit(slug) {
    var path = 'content/pages/' + slug + '.json';
    loading('#/pages', 'صفحة');
    getJSON(path).then(function (f) {
      var p = f.data;
      var title = F.bi('العنوان', p.title);
      var ar = F.area('النص بالعربية (HTML)', p.body.ar, { dir: 'rtl', rows: 16, code: true });
      var en = F.area('English text (HTML)', p.body.en, { dir: 'ltr', rows: 16, code: true });
      var save = h('button', { type: 'submit', class: 'btn brass' }, ['حفظ ونشر']);
      var form = h('form', { class: 'editor', onsubmit: function (e) {
        e.preventDefault(); busy(save, true);
        getJSON(path).then(function (latest) {
          var v = latest.data; v.title = title.read();
          v.body = {}; if (ar.read()) v.body.ar = ar.read(); if (en.read()) v.body.en = en.read();
          return putJSON(path, v, latest.sha, 'تعديل صفحة: ' + (v.title.ar || v.title.en) + ' (من لوحة التحكم)', 1);
        }).then(function () { busy(save, false); saved(); }, function (e2) { busy(save, false); fail(e2); });
      } }, [group('العنوان', [title]).el, group('المحتوى', [ar, en]).el, h('div', { class: 'form-actions' }, [save, h('a', { class: 'btn ghost', href: '#/pages' }, ['رجوع'])])]);
      shell('#/pages', p.title.ar || p.title.en, form, [h('a', { class: 'btn ghost', href: CFG.site + p.section + '/' + p.slug + '/', target: '_blank', rel: 'noopener', html: ico('ext') + '<span>عرض على الموقع</span>' })]);
    }).catch(fail);
  }

  // ---------- router ----------
  function route() {
    if (!token) return signInView();
    var parts = location.hash.replace(/^#\/?/, '').split('/');
    var sec = parts[0], key = parts[1];
    if (sec === 'news') return key ? editView(NEWS, key) : listView(NEWS);
    if (sec === 'events') return key ? editView(EVENTS, key) : listView(EVENTS);
    if (sec === 'council') return key ? editView(COUNCIL, key) : listView(COUNCIL);
    if (sec === 'sky') return skyView();
    if (sec === 'archive') return key ? archiveEdit(key) : archiveView();
    if (sec === 'pages') return key ? pageEdit(key) : pagesView();
    return dashboard();
  }
  window.addEventListener('hashchange', route);
  var saved0 = store.get('auass-token');
  if (saved0) tryToken(saved0, !!(function () { try { return localStorage.getItem('auass-token'); } catch (e) { return null; } })()).catch(function (e) { store.clear('auass-token'); signInView(e.message); });
  else signInView();
})();
