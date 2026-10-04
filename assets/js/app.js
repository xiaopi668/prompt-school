/* 提示词学校 · 应用逻辑（无依赖，可直接双击 index.html 打开） */
var SPOTLIGHT_PROMPT = '在开始之前，请先向我提出 3 到 5 个最关键的问题。\n每个问题给出 2 到 3 个候选答案让我选，\n优先问：目标、受众、场景、限制、交付形式、成功标准。\n信息不足时先提问，不要编造。\n我回答后，先复述一遍你的理解并列出计划，\n我说「开始」，你再动手。';

(function () {
  'use strict';

  var PS = (window.PS = window.PS || {});
  PS.lessons = PS.lessons || [];
  PS.templates = PS.templates || [];
  PS.cheatsheet = PS.cheatsheet || [];
  PS.glossary = PS.glossary || [];

  var MODULES = ['入门', '基础技巧', '进阶技巧', '实战'];
  var MODULE_DESC = {
    '入门': '先弄明白 AI 到底在做什么，以及一条完整提示词由哪些零件组成。',
    '基础技巧': '把任务说清楚、给例子、定格式：让输出第一次就能用。',
    '进阶技巧': '让 AI 先问你问题、先出方案、换视角，再被你一步步改到位。',
    '实战': '完整案例复盘：从一句话需求到可用的成品。'
  };
  var MODULE_ICON = { '入门': '1', '基础技巧': '2', '进阶技巧': '3', '实战': '4' };
  var LS_KEY = 'prompt-school-v1';

  /* ---------------- 状态 ---------------- */
  var state = { done: {}, quiz: {}, drafts: {} };
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (raw) {
      var saved = JSON.parse(raw);
      state.done = saved.done || {};
      state.quiz = saved.quiz || {};
      state.drafts = saved.drafts || {};
    }
  } catch (e) { /* 隐私模式或 file:// 限制，忽略即可 */ }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }

  var lessons = PS.lessons.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  var lessonIndex = {};
  lessons.forEach(function (l, i) { lessonIndex[l.id] = i; });
  function lessonAt(i) { return lessons[i] || null; }
  function hrefOf(id) { return lessonIndex[id] != null ? '#/lesson/' + id : '#/'; }

  /* ---------------- 小工具 ---------------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('show'); }, 2000);
  }
  var copySeq = 0, copyMap = {};
  function copyBtn(text, label) {
    copySeq += 1;
    var id = 'cp' + copySeq;
    copyMap[id] = text;
    return '<button class="copy-btn" type="button" data-copy-id="' + id + '">' + (label || '复制') + '</button>';
  }
  function doCopy(text) {
    if (!text) { toast('还没有内容可复制'); return; }
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        toast(ok ? '已复制，去 AI 对话框里粘贴试试' : '复制失败，请手动选中复制');
      } catch (err) { toast('复制失败，请手动选中复制'); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('已复制，去 AI 对话框里粘贴试试'); }, fallback);
    } else { fallback(); }
  }
  function codeBlock(opts) {
    var out = ['<div class="code-block">'];
    out.push('<div class="code-head"><span class="dots"><i></i><i></i><i></i></span>');
    out.push('<span class="t">' + esc(opts.title || '提示词') + '</span>');
    out.push(copyBtn(opts.text, '复制这段'));
    out.push('</div>');
    out.push('<pre class="code-body">' + esc(opts.text) + '</pre>');
    if (opts.note) out.push('<p class="code-note">' + opts.note + '</p>');
    out.push('</div>');
    return out.join('');
  }
  function feature(href, ico, title, desc) {
    return '<a class="feature" href="' + href + '"><span class="f-ico">' + ico + '</span><h3>' + esc(title) + '</h3><p>' + esc(desc) + '</p></a>';
  }

  /* ---------------- 学习进度 ---------------- */
  function doneCount() { return lessons.filter(function (l) { return state.done[l.id]; }).length; }
  function pct() { return lessons.length ? Math.round((doneCount() / lessons.length) * 100) : 0; }
  function paintProgress() {
    var p = pct();
    var ring = document.getElementById('progressRing');
    var lab = document.getElementById('progressPct');
    var bar = document.getElementById('progressBarMobile');
    if (ring) ring.style.setProperty('--p', String(p));
    if (lab) lab.textContent = p + '%';
    if (bar) bar.style.width = p + '%';
    var pill = document.getElementById('progressPill');
    if (pill) pill.title = '已完成 ' + doneCount() + ' / ' + lessons.length + ' 课';
  }
  function markDone(id, on) {
    if (on) state.done[id] = true; else delete state.done[id];
    save(); paintProgress(); paintSidebar();
  }

  /* ---------------- 侧边栏 ---------------- */
  var searchTerm = '';
  function currentLessonId() { var r = currentRoute(); return r.name === 'lesson' ? r.id : ''; }
  function paintSidebar() {
    var nav = document.getElementById('lessonNav');
    if (!nav) return;
    var term = searchTerm.trim().toLowerCase();
    var current = currentLessonId();
    var html = [];
    MODULES.forEach(function (mod) {
      var list = lessons.filter(function (l) {
        if (l.module !== mod) return false;
        if (!term) return true;
        var hay = (l.title + ' ' + (l.subtitle || '') + ' ' + (l.goal || []).join(' ')).toLowerCase();
        return hay.indexOf(term) >= 0;
      });
      if (!list.length) return;
      html.push('<div class="nav-module"><h4>' + esc(mod) + '</h4>');
      list.forEach(function (l) {
        var cls = 'nav-item' + (state.done[l.id] ? ' done' : '') + (l.id === current ? ' active' : '');
        html.push('<a class="' + cls + '" href="#/lesson/' + l.id + '" title="' + esc(l.subtitle || l.title) + '">');
        html.push('<span class="num"><span>' + (l.order || '') + '</span></span>');
        html.push('<span class="tx">' + esc(l.title) + '</span>');
        html.push('</a>');
      });
      html.push('</div>');
    });
    if (!html.length) html.push('<p class="note" style="padding:8px 10px">没有匹配的课程。</p>');
    nav.innerHTML = html.join('');
  }

  /* ---------------- 路由 ---------------- */
  function parseHash() {
    var h = (location.hash || '').replace(/^#/, '');
    return h.split('/').filter(function (s) { return s.length; });
  }
  function currentRoute() {
    var p = parseHash();
    if (!p.length) return { name: 'home' };
    if (p[0] === 'lesson') return { name: 'lesson', id: p[1] || '' };
    if (['templates', 'cheatsheet', 'playground', 'glossary'].indexOf(p[0]) >= 0) return { name: p[0] };
    return { name: 'home' };
  }
  function paintTopNav(r) {
    var map = { home: '/', templates: '/templates', cheatsheet: '/cheatsheet', playground: '/playground' };
    qa('.topnav a').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-nav') === (map[r.name] || ''));
    });
  }
  function render(keepScroll) {
    var r = currentRoute();
    copySeq = 0; copyMap = {};
    var main = document.getElementById('main');
    var html = '';
    if (r.name === 'home') { html = viewHome(); document.title = '提示词学校 · 一步一步学会和 AI 说话'; }
    else if (r.name === 'lesson') {
      var l = lessonIndex[r.id] != null ? lessons[lessonIndex[r.id]] : null;
      if (l) { html = viewLesson(l); document.title = l.title + ' · 提示词学校'; }
      else { html = viewNotFound(); document.title = '没有找到这一课 · 提示词学校'; }
    }
    else if (r.name === 'templates') { html = viewTemplates(); document.title = '提示词模板库 · 提示词学校'; }
    else if (r.name === 'cheatsheet') { html = viewCheatsheet(); document.title = '技巧速查表 · 提示词学校'; }
    else if (r.name === 'playground') { html = viewPlayground(); document.title = '提示词工作台 · 提示词学校'; }
    else if (r.name === 'glossary') { html = viewGlossary(); document.title = '术语表 · 提示词学校'; }
    else { html = viewNotFound(); }
    main.innerHTML = html;
    paintSidebar();
    paintProgress();
    paintTopNav(r);
    if (r.name === 'playground') syncBuilder(true);
    if (!keepScroll) window.scrollTo(0, 0);
  }

  /* ---------------- 首页 ---------------- */
  function viewHome() {
    var p = pct();
    var nextLesson = lessons.filter(function (l) { return !state.done[l.id]; })[0] || lessons[0];
    var out = ['<div class="wrap-wide">'];
    out.push('<section class="hero">');
    out.push('<h1>学会和 AI 说话，<br>比会用 AI 更重要</h1>');
    out.push('<p class="lead">提示词学校把「写提示词」拆成 ' + lessons.length + ' 节小课，每节 8 到 15 分钟：先把需求说清楚，再让 AI 反过来问你问题、先出方案，最后一步步把它改到位。</p>');
    out.push('<div class="hero-cta">');
    if (nextLesson) {
      if (p > 0) out.push('<a class="btn btn-primary" href="' + hrefOf(nextLesson.id) + '">继续学习：' + esc(nextLesson.title) + '</a>');
      else out.push('<a class="btn btn-primary" href="' + hrefOf(nextLesson.id) + '">从第 1 课开始</a>');
    }
    out.push('<a class="btn btn-ghost" href="#/playground">打开提示词工作台</a>');
    out.push('<a class="btn btn-ghost" href="#/templates">直接抄模板</a>');
    out.push('</div>');
    out.push('<div class="hero-stats">');
    out.push('<div><b>' + lessons.length + '</b><span>节循序渐进的课</span></div>');
    out.push('<div><b>' + (PS.templates.length || 0) + '</b><span>个可复制模板</span></div>');
    out.push('<div><b>8</b><span>项提示词自检维度</span></div>');
    out.push('<div><b>' + p + '%</b><span>你的当前进度</span></div>');
    out.push('</div>');
    out.push('</section>');
    out.push('<div class="section-head"><h2>先认识最重要的一件事</h2><p>也是最多人漏掉的那一步</p></div>');
    out.push('<section class="spotlight">');
    out.push('<div>');
    out.push('<span class="chip brand">进阶技巧 · 第 6 课</span>');
    out.push('<h3 style="margin-top:10px">让 AI 在做项目前，先来问你问题</h3>');
    out.push('<p>你脑子里关于这件事的全部信息，真正写进提示词的往往不到两成。剩下的部分 AI 只能自己编，编错了你就得推翻重做。只要在开头加一句「先问我问题」，返工率会立刻下降。</p>');
    out.push('<ul>');
    out.push('<li>花 2 分钟回答 3 到 5 个问题，可能省下 2 小时返工</li>');
    out.push('<li>让它一次只问最关键的问题，并且给出候选答案让你选</li>');
    out.push('<li>它复述一遍你的需求、给出计划，你说「开始」它才动手</li>');
    out.push('</ul>');
    out.push('<a class="btn btn-primary" href="' + hrefOf('ask-first') + '">学这一课</a>');
    out.push('<a class="btn btn-ghost" href="#/templates" style="margin-left:8px">拿现成模板</a>');
    out.push('</div>');
    out.push('<pre class="mini-code">' + esc(SPOTLIGHT_PROMPT) + '</pre>');
    out.push('</section>');
    out.push('<div class="section-head"><h2>学习路径</h2><p>按顺序走，每课一个技能点</p></div>');
    out.push('<div class="path-grid">');
    MODULES.forEach(function (mod) {
      var list = lessons.filter(function (l) { return l.module === mod; });
      if (!list.length) return;
      var doneN = list.filter(function (l) { return state.done[l.id]; }).length;
      out.push('<article class="module-card">');
      out.push('<header><h3>' + MODULE_ICON[mod] + '. ' + esc(mod) + '</h3><span class="chip ' + (doneN === list.length ? 'ok' : '') + '">' + doneN + '/' + list.length + '</span></header>');
      out.push('<p class="m-desc">' + esc(MODULE_DESC[mod] || '') + '</p>');
      list.forEach(function (l) {
        out.push('<a class="lesson-row' + (state.done[l.id] ? ' done' : '') + '" href="#/lesson/' + l.id + '">');
        out.push('<span class="dot"></span><span>' + esc(l.title) + '</span>');
        out.push('<span class="mins">' + (l.minutes || 8) + ' 分钟</span>');
        out.push('</a>');
      });
      out.push('</article>');
    });
    out.push('</div>');
    out.push('<div class="section-head"><h2>四件顺手工具</h2><p>边学边用，效果最好</p></div>');
    out.push('<div class="feature-grid">');
    out.push(feature('#/playground', '台', '提示词工作台', '填空式拼出一条完整提示词，再用体检器看看缺什么零件，缺哪补哪。'));
    out.push(feature('#/templates', '库', '提示词模板库', '反问先行、方案对比、代码任务、长文总结……常用场景都写好了，复制就能用。'));
    out.push(feature('#/cheatsheet', '卡', '技巧速查表', '全部技巧压缩成一页：什么时候用、句式怎么写、坑在哪里。'));
    out.push(feature('#/glossary', '词', '术语表', '提示词、少样本、思维链、上下文窗口……用大白话讲清楚。'));
    out.push('</div>');
    out.push('<div class="section-head"><h2>怎么用这个网站</h2></div>');
    out.push('<div class="card"><ol style="margin:0">');
    out.push('<li>按顺序学。每课读完做一次「动手练一练」，点检查，看看自己缺了哪个零件。</li>');
    out.push('<li>每课最后有小测验，全部答对会自动打勾，进度存在你自己的浏览器里。</li>');
    out.push('<li>学完立刻去做真事：打开工作台拼一条提示词，粘到你常用的 AI 里跑一遍。</li>');
    out.push('<li>不确定怎么写时回速查表套句式，比从头想快得多。</li>');
    out.push('</ol></div>');
    out.push('</div>');
    return out.join('');
  }

  /* ---------------- 课程页 ---------------- */
  function viewLesson(l) {
    var i = lessonIndex[l.id];
    var prev = lessonAt(i - 1), next = lessonAt(i + 1);
    var out = ['<div class="wrap">'];
    out.push('<p class="crumb"><a href="#/">首页</a> / ' + esc(l.module) + ' / ' + esc(l.title) + '</p>');
    out.push('<header class="lesson-head">');
    out.push('<div class="meta">');
    out.push('<span class="chip brand">第 ' + (l.order || i + 1) + ' 课</span>');
    out.push('<span class="chip">' + esc(l.module) + '</span>');
    out.push('<span class="chip">约 ' + (l.minutes || 8) + ' 分钟</span>');
    if (state.done[l.id]) out.push('<span class="chip ok">已完成</span>');
    out.push('</div>');
    out.push('<h1>' + esc(l.title) + '</h1>');
    if (l.subtitle) out.push('<p class="sub">' + esc(l.subtitle) + '</p>');
    out.push('</header>');
    if (l.goal && l.goal.length) {
      out.push('<div class="goal-box"><h4>学完这一课，你会</h4><ul>');
      l.goal.forEach(function (g) { out.push('<li>' + esc(g) + '</li>'); });
      out.push('</ul></div>');
    }
    (l.sections || []).forEach(function (s) { out.push(renderSection(s)); });
    if (l.exercise) out.push(renderExercise(l));
    if (l.quiz && l.quiz.length) out.push(renderQuiz(l));
    out.push('<div class="done-bar"><span class="txt">' + (state.done[l.id] ? '这一课已经打上勾了，继续下一课吧。' : '学完了？打个勾，进度会存在你的浏览器里。') + '</span>');
    out.push('<button class="btn ' + (state.done[l.id] ? '' : 'btn-primary') + '" type="button" data-mark-done="' + l.id + '">' + (state.done[l.id] ? '取消完成标记' : '标记为已完成') + '</button></div>');
    out.push('<nav class="pager">');
    if (prev) out.push('<a class="btn" href="#/lesson/' + prev.id + '"><span class="arrow">←</span><span><span class="p-dir">上一课</span><span class="p-title">' + esc(prev.title) + '</span></span></a>');
    if (next) out.push('<a class="btn next" href="#/lesson/' + next.id + '"><span><span class="p-dir">下一课</span><span class="p-title">' + esc(next.title) + '</span></span><span class="arrow">→</span></a>');
    else out.push('<a class="btn next" href="#/cheatsheet"><span><span class="p-dir">全部学完</span><span class="p-title">去技巧速查表复习</span></span><span class="arrow">→</span></a>');
    out.push('</nav>');
    out.push('</div>');
    return out.join('');
  }

  function renderSection(s) {
    if (!s || !s.type) return '';
    if (s.type === 'text') {
      if (s.title) return '<section class="sec"><h2>' + esc(s.title) + '</h2><div class="sec-body">' + s.html + '</div></section>';
      return '<section class="sec"><div class="sec-body">' + s.html + '</div></section>';
    }
    if (s.type === 'tip') return '<div class="tip-card"><h4>' + esc(s.title || '小提示') + '</h4>' + s.html + '</div>';
    if (s.type === 'warn') return '<div class="warn-card"><h4>' + esc(s.title || '容易踩的坑') + '</h4>' + s.html + '</div>';
    if (s.type === 'compare') {
      var c = ['<section class="compare">'];
      if (s.title) c.push('<h2 class="sec-title">' + esc(s.title) + '</h2>');
      c.push('<div class="compare-grid">');
      c.push('<div class="compare-col bad"><div class="col-label">' + esc((s.bad && s.bad.label) || '差一点的写法') + '</div><div class="col-body">' + esc((s.bad && s.bad.text) || '') + '</div></div>');
      c.push('<div class="compare-col good"><div class="col-label">' + esc((s.good && s.good.label) || '更好的写法') + '</div><div class="col-body">' + esc((s.good && s.good.text) || '') + '</div></div>');
      c.push('</div>');
      if (s.note) c.push('<p class="compare-note">' + s.note + '</p>');
      c.push('</section>');
      return c.join('');
    }
    if (s.type === 'steps') {
      var st = ['<section class="sec">'];
      if (s.title) st.push('<h2>' + esc(s.title) + '</h2>');
      st.push('<ol class="steps">');
      (s.items || []).forEach(function (it) {
        st.push('<li><h4>' + esc(it.title || '') + '</h4><div>' + (it.html || '') + '</div></li>');
      });
      st.push('</ol></section>');
      return st.join('');
    }
    if (s.type === 'table') {
      var tb = ['<section class="sec">'];
      if (s.title) tb.push('<h2>' + esc(s.title) + '</h2>');
      tb.push('<div class="tbl-wrap"><table><thead><tr>');
      (s.head || []).forEach(function (h) { tb.push('<th>' + esc(h) + '</th>'); });
      tb.push('</tr></thead><tbody>');
      (s.rows || []).forEach(function (row) {
        tb.push('<tr>');
        (row || []).forEach(function (cell) { tb.push('<td>' + esc(cell) + '</td>'); });
        tb.push('</tr>');
      });
      tb.push('</tbody></table></div></section>');
      return tb.join('');
    }
    if (s.type === 'code') {
      var cb = ['<section class="sec">'];
      if (s.title) cb.push('<h2>' + esc(s.title) + '</h2>');
      cb.push(codeBlock({ title: s.title || '可复制的提示词', text: s.text || '', note: s.note }));
      cb.push('</section>');
      return cb.join('');
    }
    return '';
  }

  function renderExercise(l) {
    var ex = l.exercise;
    var draft = state.drafts[l.id] || '';
    var out = ['<section class="exercise" data-ex="' + l.id + '">'];
    out.push('<h3>✎ ' + esc(ex.title || '动手练一练') + '</h3>');
    out.push('<p class="ex-brief">' + esc(ex.brief || '') + '</p>');
    out.push('<textarea class="js-ex-input" rows="5" placeholder="' + esc(ex.placeholder || '在这里写下你的提示词……') + '">' + esc(draft) + '</textarea>');
    out.push('<div class="ex-actions">');
    out.push('<button class="btn btn-primary btn-sm" type="button" data-ex-check="' + l.id + '">检查我的提示词</button>');
    out.push('<button class="btn btn-sm" type="button" data-ex-doctor="' + l.id + '">看体检报告</button>');
    out.push('<span class="ex-hint">草稿自动保存在本机，刷新不丢</span>');
    out.push('</div>');
    out.push('<ul class="checks" data-ex-result hidden></ul>');
    out.push('<div data-ex-doctor-box hidden></div>');
    out.push('</section>');
    return out.join('');
  }
  function runExerciseCheck(id) {
    var box = document.querySelector('[data-ex="' + id + '"]');
    if (!box) return;
    var l = lessons[lessonIndex[id]];
    var ta = q('.js-ex-input', box);
    var text = (ta && ta.value) || '';
    var res = q('[data-ex-result]', box);
    if (!res) return;
    var checks = (l && l.exercise && l.exercise.checks) || [];
    var lower = text.toLowerCase();
    if (!text.trim()) {
      res.hidden = false;
      res.innerHTML = '<li class="fail"><span class="mark">!</span><span>还没有写内容。哪怕先写一句「帮我写……」也可以，然后再看缺什么。</span></li>';
      return;
    }
    var passed = 0, rows = [];
    checks.forEach(function (c) {
      var hit = (c.keywords || []).some(function (k) { return lower.indexOf(String(k).toLowerCase()) >= 0; });
      if (hit) passed += 1;
      rows.push('<li class="' + (hit ? 'pass' : 'fail') + '"><span class="mark">' + (hit ? '✓' : '○') + '</span><span>' + esc(c.label) + (hit ? '' : '<span class="hint">' + esc(c.hint || '') + '</span>') + '</span></li>');
    });
    var total = checks.length || 1;
    var ratio = Math.round((passed / total) * 100);
    var verdict = ratio === 100 ? '很完整，可以直接拿去用了。' : (ratio >= 60 ? '基本成型，把没亮的几项补上会更好。' : '信息还偏少，照着没亮的提示补一补。');
    res.hidden = false;
    res.innerHTML = rows.join('') + '<li class="pass" style="background:var(--brand-soft);border-color:transparent"><span class="mark">∑</span><span class="ex-score">得分 ' + ratio + ' 分（' + passed + '/' + total + ' 项）</span><span class="hint">' + verdict + '　当前 ' + text.trim().length + ' 字</span></li>';
    toast(ratio === 100 ? '全部达标！' : '检查完成：' + passed + '/' + total + ' 项达标');
  }
  function renderQuiz(l) {
    var out = ['<section class="quiz"><h3>小测验：确认你真的懂了</h3>'];
    (l.quiz || []).forEach(function (item, qi) {
      out.push('<div class="q" data-qbox="' + l.id + '|' + qi + '">');
      out.push('<p class="q-text">' + (qi + 1) + '. ' + esc(item.q) + '</p>');
      out.push('<div class="opts">');
      (item.options || []).forEach(function (op, oi) {
        out.push('<button class="opt" type="button" data-quiz="' + l.id + '|' + qi + '|' + oi + '">');
        out.push('<span class="key">' + 'ABCD'.charAt(oi) + '</span><span>' + esc(op) + '</span></button>');
      });
      out.push('</div><div data-explain hidden></div></div>');
    });
    out.push('</section>');
    return out.join('');
  }
  function answerQuiz(lid, qi, oi) {
    var l = lessons[lessonIndex[lid]];
    if (!l) return;
    var item = (l.quiz || [])[qi];
    if (!item) return;
    var box = document.querySelector('[data-qbox="' + lid + '|' + qi + '"]');
    if (!box || box.getAttribute('data-answered') === '1') return;
    box.setAttribute('data-answered', '1');
    var correct = (oi === item.answer);
    qa('.opt', box).forEach(function (b, k) {
      b.disabled = true;
      if (k === item.answer) b.classList.add('correct');
      else if (k === oi) b.classList.add('wrong');
    });
    var ex = q('[data-explain]', box);
    if (ex) {
      ex.hidden = false;
      ex.className = 'explain';
      ex.innerHTML = '<strong>' + (correct ? '答对了。' : '再想想。正确答案是 ' + 'ABCD'.charAt(item.answer) + '。') + '</strong> ' + esc(item.explain || '');
    }
    if (!state.quiz[lid]) state.quiz[lid] = [];
    state.quiz[lid][qi] = oi;
    if (correct) {
      var allOk = (l.quiz || []).every(function (it, k) { return state.quiz[lid][k] === it.answer; });
      if (allOk && !state.done[lid]) {
        markDone(lid, true);
        toast('全部答对，这一课自动标记为完成');
        var bar = q('.done-bar .txt');
        if (bar) bar.textContent = '这一课已经打上勾了，继续下一课吧。';
      }
    }
    save();
  }

  /* ---------------- 提示词体检报告 ---------------- */
  function doctorHTML(text) {
    var r = PS.checkPrompt(text || '');
    var color = r.score >= 80 ? 'var(--ok)' : (r.score >= 50 ? 'var(--accent)' : 'var(--bad)');
    var out = ['<div class="doctor"><div class="doctor-grid"><div><ul class="dim-list">'];
    r.dims.forEach(function (d) {
      out.push('<li class="' + (d.ok ? 'yes' : 'no') + '"><span class="mark">' + (d.ok ? '✓' : '○') + '</span><span><b>' + esc(d.label) + '</b>' + (d.ok ? '　已经有了' : '　还没有<em>' + esc(d.hint) + '</em>') + '</span></li>');
    });
    out.push('</ul>');
    if (r.missing.length) {
      out.push('<div class="patches"><h4>缺哪补哪：把下面这几句加进去就行</h4>');
      r.missing.slice(0, 4).forEach(function (d) {
        out.push('<div class="patch"><span>＋</span><span>' + esc(d.patch) + '</span></div>');
      });
      out.push('</div>');
    } else {
      out.push('<div class="patches"><h4>八个零件都齐了</h4><p class="note" style="margin:0">接下来只剩一件事：发出去跑一遍，再看输出怎么改。</p></div>');
    }
    out.push('</div><div class="score-wrap">');
    out.push('<div class="score-ring" style="--p:' + r.score + ';--ring-color:' + color + '"><b>' + r.score + '<span>分</span></b></div>');
    out.push('<p class="score-note">' + esc(r.verdict) + '</p>');
    out.push('<p class="note" style="margin-top:8px">共 ' + r.chars + ' 字</p>');
    out.push('</div></div></div>');
    return out.join('');
  }

  /* ---------------- 工作台 ---------------- */
  function viewPlayground() {
    var out = ['<div class="wrap-wide">'];
    out.push('<h1 class="page-title">提示词工作台</h1>');
    out.push('<p class="note page-sub">左边填空，右边实时生成一条完整提示词；下面的体检报告会告诉你还缺哪个零件。全部内容只在本机处理，不会上传。</p>');
    out.push('<div class="pg-grid">');
    out.push('<section class="card"><h3 class="card-h">1. 填空：五个零件</h3><div class="form-grid">');
    out.push(field('pg-role', '角色', '你希望 AI 扮演谁', '例如：你是一位有十年经验的小学数学老师'));
    out.push(field('pg-task', '任务', '要它做什么，动词越具体越好', '例如：帮我设计一节 40 分钟的复习课'));
    out.push(field('pg-bg', '背景', '给谁用、解决什么问题、现状如何', '例如：班上 40 人，基础参差不齐', true));
    out.push(field('pg-format', '格式', '输出长什么样', '例如：Markdown 表格，分环节、时间、活动、要点四列'));
    out.push(field('pg-limit', '约束', '不要什么、必须满足什么', '例如：不超过 3 个环节，每个环节给出具体话术', true));
    out.push(field('pg-demo', '示例（可选）', '给一个你满意的样例', '例如：环节一｜5 分钟｜口算热身｜……', true));
    out.push('</div>');
    out.push('<h3 class="card-h" style="margin-top:18px">2. 勾选高阶指令</h3>');
    out.push('<div class="toggles">');
    out.push(toggle('pg-ask', '让 AI 先问我问题', '动手前先提 3 到 5 个关键问题，我回答后再开始', true));
    out.push(toggle('pg-plan', '先出方案再执行', '先给 2 到 3 个思路和取舍，我选定后再写完整版', true));
    out.push(toggle('pg-think', '分步思考', '先给步骤清单，再一步步执行', false));
    out.push('</div>');
    out.push('<div class="ex-actions" style="margin-top:16px">');
    out.push('<button class="btn btn-primary btn-sm" type="button" id="pgBuild">生成到编辑区</button>');
    out.push('<button class="btn btn-sm" type="button" id="pgSample">来一个示例</button>');
    out.push('<button class="btn btn-sm btn-ghost" type="button" id="pgClear">清空</button>');
    out.push('</div></section>');
    out.push('<section class="card"><h3 class="card-h">3. 编辑区：这里的内容才会被发出去</h3>');
    out.push('<textarea id="pgText" rows="9" placeholder="左边填完点「生成到编辑区」；也可以直接在这里手写……"></textarea>');
    out.push('<div class="ex-actions">');
    out.push('<button class="copy-btn" type="button" id="pgCopy">复制提示词</button>');
    out.push('<span class="ex-hint" id="pgSync">表单改动会自动同步到这里；你一旦手动打字，就不再覆盖。</span>');
    out.push('</div>');
    out.push('<div id="pgDoctor"></div>');
    out.push('</section>');
    out.push('</div>');
    out.push('<div class="section-head"><h2>常见场景速填</h2><p>点一下，把整组信息套进去</p></div>');
    out.push('<div class="tabs">');
    ['写周报', '做复习计划', '写文案', '分析数据', '写代码', '做策划'].forEach(function (t, i) {
      out.push('<button class="tab" type="button" data-pg-preset="' + i + '">' + t + '</button>');
    });
    out.push('</div>');
    out.push('<div class="card"><h3 class="card-h">工作台怎么用</h3><ol style="margin:0">');
    out.push('<li>先把「任务」写清楚：动词 + 对象 + 成功标准。</li>');
    out.push('<li>点「生成到编辑区」，并保持「让 AI 先问我问题」勾选——这一步能省掉最多返工。</li>');
    out.push('<li>复制，粘到你的 AI 里。它开始反问你时认真回答，别催它直接写。</li>');
    out.push('<li>拿到第一版后，回速查表用「迭代三句式」继续改。</li>');
    out.push('</ol></div>');
    out.push('</div>');
    return out.join('');
  }
  function field(id, label, hint, ph, isArea) {
    var h = '<div class="field' + (isArea ? ' span2' : '') + '"><label for="' + id + '">' + esc(label) + '<span class="f-hint">' + esc(hint) + '</span></label>';
    if (isArea) h += '<textarea id="' + id + '" rows="2" placeholder="' + esc(ph) + '" data-pg-field="' + id + '"></textarea>';
    else h += '<input type="text" id="' + id + '" placeholder="' + esc(ph) + '" data-pg-field="' + id + '">';
    return h + '</div>';
  }
  function toggle(id, title, desc, checked) {
    return '<label class="pg-toggle" for="' + id + '"><input type="checkbox" id="' + id + '" data-pg-flag="' + id + '"' + (checked ? ' checked' : '') + '><span><b>' + esc(title) + '</b><em>' + esc(desc) + '</em></span></label>';
  }
  var PG_PRESET = [
    { role: '你是一位善于总结、说话简洁的职场老手', task: '帮我写一份本周工作周报', bg: '我是产品助理，本周做了三件事：整理用户反馈、跟进一次改版上线、写了一份竞品分析。读者是部门主管。', format: '用 Markdown 分三块：本周完成、遇到的问题、下周计划；每块不超过 4 条，每条一句话，尽量带数据。', limit: '不要写空话套话，全文不超过 300 字，问题部分说清楚卡在哪一步。' },
    { role: '你是一位带过多年毕业班的班主任', task: '帮我排一份期末复习计划表', bg: '我是高三学生，距考试还有 4 周，薄弱科目是数学和英语，每天可支配 3 小时。', format: '输出一张 Markdown 表格，列为时间段、科目、任务、完成标准；表后补 3 条执行建议。', limit: '每天任务不超过 3 项，要留休息时间，不要安排需要额外买资料的任务。' },
    { role: '你是一位擅长写短文案的校园自媒体编辑', task: '帮我写一条社团招新的朋友圈文案', bg: '我们是摄影社，招新对象是大一新生，希望突出「零基础也能学」和「每周一次外拍」。', format: '给 3 个版本，每个 100 字以内，各带 3 个话题标签，语气轻松。', limit: '不要堆感叹号，不要写「最」这类绝对化承诺。' },
    { role: '你是一位严谨的数据分析顾问', task: '帮我分析这份问卷结果并给出结论', bg: '我收集了 120 份问卷，题目是使用频率、最不满意的地方、是否愿意推荐，原始数据我随后贴给你。', format: '先用表格给出每题的分布，再给 3 条结论，每条后面标注依据来自第几题。', limit: '不要编造没有的数据；样本量小的地方要明确提醒我不确定。' },
    { role: '你是一位注重可维护性的前端工程师', task: '帮我写一个能记录并保存每日开销的小网页', bg: '我只会基础 HTML，希望是单文件、双击就能打开，数据存在浏览器本地。', format: '先给整体思路和文件结构，再给完整代码，关键行写中文注释。', limit: '不要引入需要联网的框架和构建工具；改动前先告诉我改哪一段。' },
    { role: '你是一位组织过很多校园活动的策划人', task: '帮我策划一次班级读书分享会', bg: '班级 40 人，场地是教室，时长 90 分钟，希望人人参与而不是只有几个人发言。', format: '给出流程表（时间、环节、负责人、所需物料），再给一段主持词开头。', limit: '预算 100 元以内，不要安排需要投影以外设备的环节。' }
  ];
  function pgVal(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; }
  function pgChk(id) { var e = document.getElementById(id); return !!(e && e.checked); }
  function buildPrompt() {
    var lines = [];
    if (pgChk('pg-ask')) {
      lines.push('在开始之前，请先向我提出 3 到 5 个最关键的问题，把需求问清楚再动手。');
      lines.push('每个问题请给出 2 到 3 个候选答案让我选，优先问：目标、受众、场景、限制条件、交付形式、成功标准。');
      lines.push('信息不足时先提问，不要自己编造设定；我回答后，请先用一段话复述你的理解并列出计划，我说「开始」你再动手。');
      lines.push('');
    }
    var map = [['pg-role', '角色：'], ['pg-task', '任务：'], ['pg-bg', '背景：'], ['pg-format', '输出格式：'], ['pg-limit', '约束条件：'], ['pg-demo', '参考示例：']];
    map.forEach(function (m) { var v = pgVal(m[0]); if (v) lines.push(m[1] + v); });
    if (pgChk('pg-plan')) { lines.push(''); lines.push('先给我 2 到 3 个可行思路，说明各自的取舍和适合的场景，我选定之后你再写完整版本。'); }
    if (pgChk('pg-think')) { lines.push(''); lines.push('请一步一步来：先列出步骤清单，我确认后再逐步执行。'); }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function syncBuilder(force) {
    var ta = document.getElementById('pgText');
    if (!ta) return;
    if (ta.getAttribute('data-manual') === '1' && !force) return;
    var text = buildPrompt();
    if (!text) return;
    ta.value = text;
    runDoctor(text);
  }
  function runDoctor(text) {
    var box = document.getElementById('pgDoctor');
    if (!box) return;
    box.innerHTML = doctorHTML(text);
  }

  /* ---------------- 模板库 / 速查表 / 术语表 ---------------- */
  function viewTemplates() {
    var out = ['<div class="wrap-wide">'];
    out.push('<h1 class="page-title">提示词模板库</h1>');
    out.push('<p class="note page-sub">每个模板都能直接复制。方括号里的内容换成你自己的信息即可。</p>');
    out.push('<p class="note" style="margin-bottom:18px">最值得先抄的是「反问先行」那一张：让 AI 在做项目之前先来问你问题，详见 <a href="' + hrefOf('ask-first') + '">第 6 课</a>。</p>');
    out.push('<div class="tabs">');
    out.push('<button class="tab active" type="button" data-tpl-tag="全部">全部</button>');
    var tags = [];
    PS.templates.forEach(function (t) { if (tags.indexOf(t.tag) < 0) tags.push(t.tag); });
    tags.forEach(function (t) { out.push('<button class="tab" type="button" data-tpl-tag="' + esc(t) + '">' + esc(t) + '</button>'); });
    out.push('</div>');
    if (!PS.templates.length) out.push('<p class="empty">模板还在路上。</p>');
    out.push('<div class="tpl-grid" id="tplGrid">');
    PS.templates.forEach(function (t) { out.push(tplCard(t)); });
    out.push('</div>');
    out.push('</div>');
    return out.join('');
  }
  function tplCard(t) {
    var out = ['<article class="tpl-card" data-tpl-tag="' + esc(t.tag) + '">'];
    out.push('<h3>' + esc(t.title) + '<span class="chip">' + esc(t.tag) + '</span></h3>');
    out.push('<p class="t-desc">' + esc(t.desc) + '</p>');
    out.push('<pre class="t-body">' + esc(t.text) + '</pre>');
    if (t.tips) out.push('<p class="t-tips">用法：' + esc(t.tips) + '</p>');
    out.push('<div class="t-foot">' + copyBtn(t.text, '复制模板') + '</div>');
    out.push('</article>');
    return out.join('');
  }
  function viewCheatsheet() {
    var out = ['<div class="wrap-wide">'];
    out.push('<h1 class="page-title">技巧速查表</h1>');
    out.push('<p class="note page-sub">写提示词卡壳时翻这一页：找到你现在的处境，套用对应句式。建议收藏。</p>');
    PS.cheatsheet.forEach(function (g) {
      out.push('<section class="sheet-group">');
      out.push('<h3>' + esc(g.title) + (g.tag ? ' <span class="chip brand">' + esc(g.tag) + '</span>' : '') + '</h3>');
      out.push('<div class="sheet-list">');
      (g.items || []).forEach(function (it) {
        out.push('<div class="sheet-item"><h4>' + esc(it.title) + '</h4>');
        if (it.points && it.points.length) {
          out.push('<ul>');
          it.points.forEach(function (p) { out.push('<li>' + esc(p) + '</li>'); });
          out.push('</ul>');
        }
        if (it.example) out.push('<div class="ex">' + esc(it.example) + '</div>');
        out.push('</div>');
      });
      out.push('</div></section>');
    });
    if (!PS.cheatsheet.length) out.push('<p class="empty">内容还在路上。</p>');
    out.push('</div>');
    return out.join('');
  }
  function viewGlossary() {
    var out = ['<div class="wrap-wide">'];
    out.push('<h1 class="page-title">术语表</h1>');
    out.push('<p class="note page-sub">看到不懂的词就回这里查，用大白话解释，不堆定义。</p>');
    if (!PS.glossary.length) out.push('<p class="empty">内容还在路上。</p>');
    out.push('<div class="gloss-list">');
    PS.glossary.forEach(function (g) {
      out.push('<div class="gloss-item"><b>' + esc(g.term) + '<em>' + esc(g.en || '') + '</em></b><p>' + esc(g.desc) + '</p></div>');
    });
    out.push('</div></div>');
    return out.join('');
  }
  function viewNotFound() {
    return '<div class="wrap"><div class="card"><h1 style="font-size:22px">这里没有内容</h1><p class="note">链接可能写错了，或者这一课还没写出来。</p><p style="margin-bottom:0"><a class="btn btn-primary" href="#/">回到首页</a></p></div></div>';
  }

  /* ---------------- 事件绑定（全部走事件委托） ---------------- */
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-copy-id],[data-quiz],[data-mark-done],[data-ex-check],[data-ex-doctor],[data-tpl-tag]') : null;
    if (!el) return;
    if (el.hasAttribute('data-copy-id')) {
      doCopy(copyMap[el.getAttribute('data-copy-id')] || '');
      var old = el.textContent;
      el.classList.add('done');
      el.textContent = '已复制 ✓';
      setTimeout(function () { el.textContent = old; el.classList.remove('done'); }, 1600);
      return;
    }
    if (el.hasAttribute('data-quiz')) {
      var p = el.getAttribute('data-quiz').split('|');
      answerQuiz(p[0], parseInt(p[1], 10), parseInt(p[2], 10));
      return;
    }
    if (el.hasAttribute('data-mark-done')) {
      var id = el.getAttribute('data-mark-done');
      markDone(id, !state.done[id]);
      render(true);
      toast(state.done[id] ? '已标记完成' : '已取消完成标记');
      return;
    }
    if (el.hasAttribute('data-ex-check')) { runExerciseCheck(el.getAttribute('data-ex-check')); return; }
    if (el.hasAttribute('data-ex-doctor')) {
      var lid = el.getAttribute('data-ex-doctor');
      var box = document.querySelector('[data-ex="' + lid + '"]');
      if (!box) return;
      var ta = q('.js-ex-input', box);
      var target = q('[data-ex-doctor-box]', box);
      target.hidden = false;
      target.innerHTML = doctorHTML(ta ? ta.value : '');
      return;
    }
    if (el.hasAttribute('data-tpl-tag')) {
      var tag = el.getAttribute('data-tpl-tag');
      qa('[data-tpl-tag]').forEach(function (b) { if (b.classList.contains('tab')) b.classList.toggle('active', b === el); });
      qa('#tplGrid .tpl-card').forEach(function (c) {
        c.style.display = (tag === '全部' || c.getAttribute('data-tpl-tag') === tag) ? '' : 'none';
      });
    }
  });
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.id) return;
    if (t.id === 'pgBuild') {
      var ta = document.getElementById('pgText');
      if (ta) ta.removeAttribute('data-manual');
      syncBuilder(true); toast('已按表单生成提示词');
    } else if (t.id === 'pgSample') {
      var idx = Math.floor(Math.random() * PG_PRESET.length);
      var tab = document.querySelector('[data-pg-preset="' + idx + '"]');
      if (tab) tab.click();
    } else if (t.id === 'pgClear') {
      ['pg-role', 'pg-task', 'pg-bg', 'pg-format', 'pg-limit', 'pg-demo'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
      var ta3 = document.getElementById('pgText');
      if (ta3) { ta3.value = ''; ta3.removeAttribute('data-manual'); }
      runDoctor(''); toast('已清空');
    } else if (t.id === 'pgCopy') {
      var ta4 = document.getElementById('pgText');
      doCopy(ta4 ? ta4.value : '');
    } else if (t.id === 'themeBtn') {
      toggleTheme();
    } else if (t.id === 'menuBtn') {
      var open = document.body.classList.toggle('nav-open');
      t.setAttribute('aria-expanded', open ? 'true' : 'false');
    } else if (t.id === 'scrim') {
      document.body.classList.remove('nav-open');
    } else if (t.id === 'resetProgress') {
      if (window.confirm('清空所有学习进度和练习草稿？')) {
        state.done = {}; state.quiz = {}; state.drafts = {}; save(); render(); toast('进度已清空');
      }
    }
  });
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t) return;
    if (t.hasAttribute && t.hasAttribute('data-pg-preset')) {
      var p = PG_PRESET[parseInt(t.getAttribute('data-pg-preset'), 10)];
      if (!p) return;
      ['pg-role', 'pg-task', 'pg-bg', 'pg-format', 'pg-limit', 'pg-demo'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
      var setp = function (id, v) { var el = document.getElementById(id); if (el) el.value = v; };
      setp('pg-role', p.role); setp('pg-task', p.task); setp('pg-bg', p.bg);
      setp('pg-format', p.format); setp('pg-limit', p.limit);
      var ta = document.getElementById('pgText');
      if (ta) ta.removeAttribute('data-manual');
      syncBuilder(true);
      toast('已填入示例，可以直接改');
      return;
    }
    if (t.closest && t.closest('.sidebar a')) document.body.classList.remove('nav-open');
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    if (t.id === 'lessonSearch') { searchTerm = t.value; paintSidebar(); return; }
    if (t.classList && t.classList.contains('js-ex-input')) {
      var box = t.closest('[data-ex]');
      if (box) { state.drafts[box.getAttribute('data-ex')] = t.value; save(); }
      return;
    }
    if (t.id === 'pgText') {
      t.setAttribute('data-manual', '1');
      var note = document.getElementById('pgSync');
      if (note) note.textContent = '已切换为手写模式：改表单不再覆盖这里，点「生成到编辑区」可重新同步。';
      if (t._dt) clearTimeout(t._dt);
      t._dt = setTimeout(function () { runDoctor(t.value); }, 220);
      return;
    }
    if (t.hasAttribute('data-pg-field')) syncBuilder();
  });
  document.addEventListener('change', function (e) {
    if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-pg-flag')) syncBuilder();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') document.body.classList.remove('nav-open');
    if (e.key === '/' && document.activeElement && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      var s = document.getElementById('lessonSearch');
      if (s) { e.preventDefault(); s.focus(); }
    }
  });

  function toggleTheme() {
    var cur = document.documentElement.getAttribute('data-theme');
    var next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('prompt-school-theme', next); } catch (e) {}
  }
  (function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem('prompt-school-theme'); } catch (e) {}
    if (!saved) saved = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', saved);
  })();

  window.addEventListener('hashchange', function () { render(); });
  render();
})();
