#!/usr/bin/env node
/* 提示词学校 · 端到端自检：用本机 headless Chrome 打开页面，跑一遍真实交互。
   用法：node tools/verify.mjs [--shots]
   会在 9222 端口新建一个标签页，跑完自动关闭，不影响已有标签页。 */

import { writeFileSync, mkdirSync } from 'node:fs';

const CDP_BASE = 'http://127.0.0.1:9222';
const PAGE_URL = 'file://' + process.cwd() + '/index.html';
const WANT_SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.cwd() + '/screenshots';

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? '  -> ' + detail : ''));
}

async function newTarget() {
  const res = await fetch(CDP_BASE + '/json/new?about:blank', { method: 'PUT' });
  if (!res.ok) throw new Error('无法新建标签页: ' + res.status);
  return await res.json();
}
async function closeTarget(id) {
  try { await fetch(CDP_BASE + '/json/close/' + id); } catch (e) {}
}
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', () => reject(new Error('WebSocket 连接失败')));
  });
}
function makeClient(ws) {
  let id = 0;
  const pending = new Map();
  const events = [];
  const listeners = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.method + ': ' + JSON.stringify(msg.error)));
      else p.resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
      listeners.forEach((fn) => fn(msg));
    }
  });
  return {
    events,
    send(method, params) {
      return new Promise((resolve, reject) => {
        const mid = ++id;
        pending.set(mid, { resolve, reject });
        ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
      });
    },
    on(fn) { listeners.push(fn); },
    waitEvent(method, timeout) {
      return new Promise((resolve) => {
        const hit = events.find((e) => e.method === method);
        if (hit) return resolve(hit);
        const t = setTimeout(() => resolve(null), timeout || 8000);
        listeners.push((m) => { if (m.method === method) { clearTimeout(t); resolve(m); } });
      });
    }
  };
}
async function evaluate(client, expr) {
  const r = await client.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('页面脚本报错: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
  return r.result.value;
}
async function goto(client, hash) {
  await client.send('Page.navigate', { url: PAGE_URL + hash });
  await client.waitEvent('Page.loadEventFired', 8000);
  await new Promise((r) => setTimeout(r, 350));
}
async function shot(client, name, full) {
  const params = { format: 'png' };
  if (full !== false) params.captureBeyondViewport = true;
  const r = await client.send('Page.captureScreenshot', params);
  writeFileSync(SHOT_DIR + '/' + name + '.png', Buffer.from(r.data, 'base64'));
}

const target = await newTarget();
const ws = await connect(target.webSocketDebuggerUrl);
const client = makeClient(ws);
const consoleErrors = [];
client.on((m) => {
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    consoleErrors.push((d.exception && d.exception.description) || d.text);
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrors.push(m.params.args.map((a) => a.value || a.description || '').join(' '));
  }
});
await client.send('Page.enable');
await client.send('Runtime.enable');
await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

console.log('\n== 1. 首页与数据 ==');
await goto(client, '#/');
const data = await evaluate(client, 'JSON.stringify((function(){var PS=window.PS;return {lessons:PS.lessons.length,templates:PS.templates.length,sheet:PS.cheatsheet.length,gloss:PS.glossary.length,ids:PS.lessons.map(function(l){return l.id}).join(",")};})())');
const d = JSON.parse(data);
console.log('  课程: ' + d.lessons + ' | 模板: ' + d.templates + ' | 速查分组: ' + d.sheet + ' | 术语: ' + d.gloss);
check('课程数不少于 10 节', d.lessons >= 10, d.lessons + ' 节');
check('模板不少于 12 个', d.templates >= 12, d.templates + ' 个');
check('速查表不少于 8 组', d.sheet >= 8, d.sheet + ' 组');
check('术语不少于 12 条', d.gloss >= 12, d.gloss + ' 条');
check('存在第 6 课 ask-first', d.ids.split(',').indexOf('ask-first') >= 0);

const schema = await evaluate(client, 'JSON.stringify((function(){var P=window.PS;var bad=[];P.lessons.forEach(function(l,i){if(!l.id||!l.title)bad.push(l.id+":缺字段");if(!(l.sections&&l.sections.length>=6&&l.sections.length<=10))bad.push(l.id+":sections="+(l.sections||[]).length);var types=(l.sections||[]).map(function(s){return s.type});["compare","code","tip"].forEach(function(t){if(types.indexOf(t)<0)bad.push(l.id+":缺"+t)});(l.sections||[]).forEach(function(s){if(["text","tip","warn","compare","steps","table","code"].indexOf(s.type)<0)bad.push(l.id+":未知type "+s.type);if(s.type==="table"){(s.rows||[]).forEach(function(r){if(r.length!==s.head.length)bad.push(l.id+":表格列数不符")})}});if(!l.exercise||!(l.exercise.checks&&l.exercise.checks.length>=3))bad.push(l.id+":checks不足");if(!(l.quiz&&l.quiz.length>=2))bad.push(l.id+":quiz不足");(l.quiz||[]).forEach(function(q){if(q.options.length!==4)bad.push(l.id+":选项不是4个");if(!(q.answer>=0&&q.answer<=3))bad.push(l.id+":answer越界")})});return {bad:bad.slice(0,10),n:bad.length};})())');
const sc = JSON.parse(schema);
check('全部课程符合数据契约', sc.n === 0, sc.n ? sc.bad.join('; ') : '0 处问题');

const home = await evaluate(client, 'JSON.stringify((function(){var h=document.querySelector(".hero h1");return {h1:h?h.textContent.trim().length:0,modules:document.querySelectorAll(".module-card").length,rows:document.querySelectorAll(".lesson-row").length,spot:!!document.querySelector(".spotlight .mini-code"),nav:document.querySelectorAll(".nav-item").length};})())');
const hm = JSON.parse(home);
check('首页渲染出标题与学习路径', hm.h1 > 6 && hm.modules >= 3 && hm.rows >= 10, '模块 ' + hm.modules + ' 个 / 课程行 ' + hm.rows + ' 条');
check('侧边栏课程目录完整', hm.nav === d.lessons, hm.nav + ' 项');
check('首页重点卡片有可复制示例', hm.spot);

console.log('\n== 2. 逐课渲染 ==');
const ids = d.ids.split(',');
let badLessons = [];
for (const lid of ids) {
  await goto(client, '#/lesson/' + lid);
  const info = await evaluate(client, 'JSON.stringify((function(){var l=window.PS.lessons.filter(function(x){return x.id==="' + lid + '"})[0];return {h1:(document.querySelector(".lesson-head h1")||{}).textContent||"",secs:document.querySelectorAll(".sec,.tip-card,.warn-card,.compare").length,opts:document.querySelectorAll(".opt").length,ta:!!document.querySelector(".exercise textarea"),code:document.querySelectorAll(".code-block").length,quiz:(l.quiz||[]).length,expected:l.title};})())');
  const i = JSON.parse(info);
  if (i.h1.trim() !== i.expected) badLessons.push(lid + ':标题不符');
  if (i.secs < 6) badLessons.push(lid + ':内容块不足 ' + i.secs);
  if (i.opts !== i.quiz * 4) badLessons.push(lid + ':选项数不符');
  if (!i.ta) badLessons.push(lid + ':缺练习区');
  if (i.code < 1) badLessons.push(lid + ':缺可复制代码块');
}
check('每一课都完整渲染（标题/内容/练习/测验/代码块）', badLessons.length === 0, badLessons.join('; ') || '全部通过');

console.log('\n== 3. 测验与进度 ==');
await goto(client, '#/lesson/' + ids[0]);
const quizClick = await evaluate(client, 'JSON.stringify((function(){var l=window.PS.lessons[0];var n=0;(l.quiz||[]).forEach(function(q,i){var b=document.querySelectorAll("[data-qbox]")[i].querySelectorAll(".opt")[q.answer];if(b){b.click();n++}});return {clicked:n,correct:document.querySelectorAll(".opt.correct").length,wrong:document.querySelectorAll(".opt.wrong").length,explain:document.querySelectorAll(".explain").length,done:document.querySelectorAll(".nav-item.done").length,bar:(document.querySelector(".done-bar .txt")||{}).textContent||""};})())');
const qc = JSON.parse(quizClick);
check('测验选项可点击并给出解析', qc.correct === qc.clicked && qc.explain === qc.clicked, '正确高亮 ' + qc.correct + ' / 解析 ' + qc.explain);
check('全部答对后自动标记完成', qc.done >= 1 && qc.bar.indexOf('打上勾') >= 0, qc.bar.trim());

const ex = await evaluate(client, 'JSON.stringify((function(){var ta=document.querySelector(".js-ex-input");ta.value="你是一位有十年经验的数学老师，请帮我设计一节 40 分钟的复习课。背景：班上 40 人，基础参差不齐，用于期末前的最后一节课。输出格式：用 Markdown 表格，分环节、时间、活动、要点四列。约束：不超过 3 个环节，不要布置课后作业。";ta.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("[data-ex-check]").click();return {pass:document.querySelectorAll(".checks li.pass").length,fail:document.querySelectorAll(".checks li.fail").length,txt:(document.querySelector(".ex-score")||{}).textContent||""};})())');
const exr = JSON.parse(ex);
check('练习区关键词检查可用', exr.pass >= 3 && exr.txt.length > 0, exr.txt.trim() + ' | 通过 ' + exr.pass + ' 项');

const doc2 = await evaluate(client, 'JSON.stringify((function(){document.querySelector("[data-ex-doctor]").click();var box=document.querySelector("[data-ex-doctor-box]");return {shown:!box.hidden,dims:box.querySelectorAll(".dim-list li").length,score:(box.querySelector(".score-ring b")||{}).textContent||""};})())');
const dd = JSON.parse(doc2);
check('练习区可展开体检报告', dd.shown && dd.dims === 8, dd.dims + ' 个维度，评分 ' + dd.score.trim());

const cp = await evaluate(client, 'JSON.stringify((function(){var b=document.querySelector(".copy-btn[data-copy-id]");b.click();return {done:b.classList.contains("done"),txt:b.textContent.trim()};})())');
const cpr = JSON.parse(cp);
check('复制按钮有反馈', cpr.done && cpr.txt.indexOf("已复制") >= 0, cpr.txt);

console.log('\n== 4. 工作台 ==');
await goto(client, '#/playground');
const pg = await evaluate(client, 'JSON.stringify((function(){var set=function(id,v){var e=document.getElementById(id);e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}))};set("pg-task","帮我排一份期末复习计划表");set("pg-bg","我是高三学生，距考试还有 4 周，薄弱科目是数学和英语");set("pg-format","用 Markdown 表格，列为时间段、科目、任务、完成标准");document.getElementById("pgBuild").click();var ta=document.getElementById("pgText");var dims=document.querySelectorAll("#pgDoctor .dim-list li").length;var yes=document.querySelectorAll("#pgDoctor .dim-list li.yes").length;return {len:ta.value.length,ask:ta.value.indexOf("先向我提出")>=0,plan:ta.value.indexOf("2 到 3 个")>=0,dims:dims,yes:yes,score:(document.querySelector("#pgDoctor .score-ring b")||{}).textContent||""};})())');
const p = JSON.parse(pg);
check('工作台能拼出提示词', p.len > 120 && p.ask && p.plan, '长度 ' + p.len + ' 字');
check('体检器给出 8 个维度与评分', p.dims === 8 && p.score.length > 0, '达标 ' + p.yes + '/8，评分 ' + p.score.trim());

const preset = await evaluate(client, 'JSON.stringify((function(){document.querySelectorAll("[data-pg-preset]")[4].click();var ta=document.getElementById("pgText");return {len:ta.value.length,code:ta.value.indexOf("前端工程师")>=0};})())');
const pr = JSON.parse(preset);
check('场景速填可用', pr.len > 100 && pr.code, '长度 ' + pr.len);

console.log('\n== 5. 模板库 / 速查表 / 术语 ==');
await goto(client, '#/templates');
const tpl = await evaluate(client, 'JSON.stringify((function(){var all=document.querySelectorAll("#tplGrid .tpl-card").length;var tabs=document.querySelectorAll("[data-tpl-tag]");var tag=tabs[1]?tabs[1].getAttribute("data-tpl-tag"):"";if(tabs[1])tabs[1].click();var vis=0;document.querySelectorAll("#tplGrid .tpl-card").forEach(function(c){if(c.style.display!=="none")vis++});return {all:all,vis:vis,tag:tag,copy:document.querySelectorAll(".tpl-card .copy-btn").length,askFirst:document.body.innerHTML.indexOf("先向我提出 3 到 5 个最关键的问题")>=0};})())');
const tp = JSON.parse(tpl);
check('模板库渲染且可复制', tp.all >= 12 && tp.copy === tp.all, tp.all + ' 个模板');
check('筛选标签可用', tp.vis > 0 && tp.vis < tp.all, '标签「' + tp.tag + '」下 ' + tp.vis + ' 个');
check('反问先行模板在列', tp.askFirst);

await goto(client, '#/cheatsheet');
const sheet = await evaluate(client, 'JSON.stringify({groups:document.querySelectorAll(".sheet-group").length,items:document.querySelectorAll(".sheet-item").length,ask:document.body.innerHTML.indexOf("先问再做")>=0})');
const sh = JSON.parse(sheet);
check('速查表渲染完整', sh.groups >= 8 && sh.items >= 20, sh.groups + ' 组 / ' + sh.items + ' 张卡');
check('速查表包含「让 AI 先问你」', sh.ask);

await goto(client, '#/glossary');
const gl = await evaluate(client, 'document.querySelectorAll(".gloss-item").length');
check('术语表渲染', gl >= 12, gl + ' 条');

console.log('\n== 6. 搜索 / 主题 / 错误 ==');
await goto(client, '#/');
const search = await evaluate(client, 'JSON.stringify((function(){var s=document.getElementById("lessonSearch");s.value="反问";s.dispatchEvent(new Event("input",{bubbles:true}));var n=document.querySelectorAll(".nav-item").length;s.value="";s.dispatchEvent(new Event("input",{bubbles:true}));return {filtered:n,all:document.querySelectorAll(".nav-item").length};})())');
const sr = JSON.parse(search);
check('侧边栏搜索可过滤', sr.filtered >= 1 && sr.filtered < sr.all, '命中 ' + sr.filtered + ' / ' + sr.all);
const theme = await evaluate(client, 'JSON.stringify((function(){var before=document.documentElement.getAttribute("data-theme");document.getElementById("themeBtn").click();var after=document.documentElement.getAttribute("data-theme");document.getElementById("themeBtn").click();return {before:before,after:after};})())');
const th = JSON.parse(theme);
check('深色模式可切换', th.before !== th.after, th.before + ' -> ' + th.after);
check('运行期无 JS 报错', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ') || '0 个错误');

if (WANT_SHOTS) {
  mkdirSync(SHOT_DIR, { recursive: true });
  await new Promise((r) => setTimeout(r, 2300));
  await evaluate(client, 'localStorage.setItem("prompt-school-theme","light")');
  const shots = [['#/', '01-home-light'], ['#/lesson/ask-first', '02-lesson-ask-first'], ['#/lesson/what-is-prompt', '03-lesson-1'], ['#/playground', '04-playground'], ['#/templates', '05-templates'], ['#/cheatsheet', '06-cheatsheet']];
  for (const [hash, name] of shots) {
    await goto(client, hash);
    await evaluate(client, 'document.documentElement.setAttribute("data-theme","light")');
    await shot(client, name);
  }
  await evaluate(client, 'document.documentElement.setAttribute("data-theme","dark")');
  await shot(client, '07-home-dark');
  await goto(client, '#/lesson/ask-first');
  await client.send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: true });
  await new Promise((r) => setTimeout(r, 300));
  await evaluate(client, 'document.documentElement.setAttribute("data-theme","light")');
  await shot(client, '08-mobile-lesson', false);
  console.log('\n截图已写入 ' + SHOT_DIR);
}

const failed = results.filter((r) => !r.ok);
console.log('\n===== 结果：' + (results.length - failed.length) + '/' + results.length + ' 项通过 =====');
if (failed.length) { failed.forEach((f) => console.log('  未通过：' + f.name + ' -> ' + f.detail)); }
ws.close();
await closeTarget(target.id);
process.exit(failed.length ? 1 : 0);
