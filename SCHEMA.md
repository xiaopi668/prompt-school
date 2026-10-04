# 提示词学校 · 课程数据契约（必须严格遵守）

课程内容以**数据文件**形式存在，由 `assets/js/app.js` 统一渲染。你只负责写数据文件，不要写 HTML 页面、不要写 CSS、不要改 app.js。

## 文件形态
普通浏览器脚本（**不是** ES module，禁止 import / export / require）：

~~~js
window.PS = window.PS || {};
window.PS.lessons = window.PS.lessons || [];
window.PS.lessons.push(
  { /* 课程对象 1 */ },
  { /* 课程对象 2 */ }
);
~~~

- 长文本用模板字符串（反引号）书写；**禁止**出现美元符号加花括号的插值写法。
- 文件末尾留一个换行；`node --check 文件路径` 必须通过。

## 课程对象字段

| 字段 | 类型 | 要求 |
| --- | --- | --- |
| id | string | 全局唯一，小写英文加连字符，由任务指定 |
| order | number | 全局学习顺序，由任务指定 |
| module | string | 只能是：入门 / 基础技巧 / 进阶技巧 / 实战 |
| title | string | 不超过 14 个汉字 |
| subtitle | string | 不超过 32 个汉字，一句话点题 |
| minutes | number | 建议学习分钟数，6 到 15 |
| goal | string[] | 2 到 4 条学习目标，每条不超过 24 字，不要句号结尾 |
| sections | Section[] | 6 到 10 个，见下 |
| exercise | object | 见下 |
| quiz | Quiz[] | 2 到 3 题 |

## Section 类型（只能用这 7 种）

1. `{ type: 'text', title?: string, html: string }` 正文段落
2. `{ type: 'tip', title: string, html: string }` 浅绿色小提示卡
3. `{ type: 'warn', title: string, html: string }` 浅红色避坑卡
4. `{ type: 'compare', title?: string, bad: { label: string, text: string }, good: { label: string, text: string }, note?: string }` 差提示词 / 好提示词左右对比
5. `{ type: 'steps', title?: string, items: { title: string, html: string }[] }` 编号步骤，2 到 5 步
6. `{ type: 'table', title?: string, head: string[], rows: string[][] }` 表格，rows 每行长度等于 head 长度
7. `{ type: 'code', title?: string, text: string, note?: string }` 可一键复制的提示词/对话块，text 里用换行组织

html / text 字段内**允许**的标签仅有：
`<p>` `<strong>` `<em>` `<code>` `<span class="hl">` `<ul><li>` `<br>`
不允许写 class 以外的属性，不允许脚本、样式、图片、链接以外的标签。

## exercise 字段

~~~js
exercise: {
  title: '动手练一练',                 // 固定用这个更友好，也可自定义
  brief: '把下面这件事写成一条提示词…',  // 40 到 90 字，明确交代要做什么
  placeholder: '在这里写下你的提示词…',  // 可选，输入框占位文字
  checks: [                            // 3 到 5 条自动检查项
    { label: '写出了明确的角色或身份', keywords: ['你是', '作为', '扮演'], hint: '开头加上"你是一位…"' }
  ]
}
~~~

checks 的 keywords 是**子串匹配**（命中任意一个即算通过），每条 2 到 5 个关键词，全部小写无关（中文直接写）。

## quiz 字段

~~~js
quiz: [{ q: '题干', options: ['A', 'B', 'C', 'D'], answer: 1, explain: '为什么选它，40 到 80 字' }]
~~~

- options 固定 4 个；answer 是正确项下标（0 开始）。
- 干扰项要像真的、有迷惑性，不要明显凑数。

## 完整示例（**只是格式示例，不要写进你的文件**）

~~~js
{
  id: 'sample',
  order: 0,
  module: '入门',
  title: '示例课程',
  subtitle: '用来展示数据形状的一句话',
  minutes: 8,
  goal: ['知道数据结构长什么样', '能照抄这个形状'],
  sections: [
    { type: 'text', html: '<p>这里是一段讲解。<strong>重点</strong>会被加粗。</p>' },
    { type: 'compare', bad: { label: '差', text: '帮我写点东西' }, good: { label: '好', text: '帮我写一封…' }, note: '差别在于具体。' },
    { type: 'code', title: '可复制的模板', text: '你是一位…\n请帮我…' }
  ],
  exercise: {
    title: '动手练一练',
    brief: '把"帮我写个东西"改写成一条具体提示词的练习。',
    placeholder: '写下你的提示词…',
    checks: [{ label: '写明了角色', keywords: ['你是', '作为'], hint: '加上"你是一位…"' }]
  },
  quiz: [{ q: '下面哪种写法更好？', options: ['越短越好', '越具体越好', '看心情', '都差不多'], answer: 1, explain: '具体的信息能显著减少模型猜测的空间。' }]
}
~~~

## 写作风格

- 简体中文，第二人称"你"，口语化但专业，像一位耐心的老师。
- 禁止营销腔（"震撼""极致""颠覆"），禁止空话，每条技巧都要落到可复制的句式。
- 专有名词第一次出现时用中文加英文，例如 少样本提示（few-shot）。
- 举例要具体、生活化、可验证：写周报、做课程表、算预算、写社团招新文案、分析错题等。
- 不使用 emoji。
