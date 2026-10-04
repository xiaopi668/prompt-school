/* 提示词体检器：8 个维度的启发式检查（本地规则，不联网） */
(function () {
  'use strict';
  var PS = (window.PS = window.PS || {});

  var DIMS = [
    {
      key: 'task', label: '明确的任务',
      hint: '说清楚要 AI 做什么，用具体动词：写、列出、分析、设计、对比、改写',
      patch: '任务：请帮我（写 / 列出 / 分析 / 设计 / 对比）……',
      kw: ['写', '列出', '列出', '分析', '总结', '设计', '生成', '翻译', '改写', '对比', '比较', '整理', '检查', '解释', '规划', '制定', '帮我', '输出', '评审', '优化', '拆分', '做一个', '做一个']
    },
    {
      key: 'context', label: '背景信息',
      hint: '交代给谁用、解决什么问题、现在是什么情况；AI 不知道你的处境',
      patch: '背景：这件事的使用场景是……，对象是……，目前的情况是……',
      kw: ['背景', '我的', '我们', '我是', '目前', '现在', '面向', '读者', '受众', '目标', '目的', '需求', '场景', '用于', '对象', '因为', '情况']
    },
    {
      key: 'format', label: '输出格式',
      hint: '指定输出的形状：表格、分点、JSON、字数、字段名',
      patch: '输出格式：用 Markdown 表格，列为……；全文控制在 300 字以内。',
      kw: ['格式', '表格', '列表', '分点', '条', 'json', 'markdown', '字数', '字以内', '标题', '结构', '字段', '序号', '段落', '步骤', '列', '星级']
    },
    {
      key: 'limit', label: '约束条件',
      hint: '写清楚不要什么、必须满足什么，例如篇幅、语气、预算、禁区',
      patch: '约束条件：不要……；必须……；语气要……；不超过……',
      kw: ['不要', '避免', '必须', '只能', '至少', '不超过', '限制', '语气', '风格', '禁止', '保留', '严格', '优先', '要求', '预算', '以内']
    },
    {
      key: 'role', label: '角色设定',
      hint: '让 AI 用某个身份说话，输出的词汇和深度会完全不同',
      patch: '角色：你是一位……（领域 + 经验 + 立场）',
      kw: ['你是', '作为一名', '作为一位', '作为一位', '扮演', '身份', '你现在是', '一位', '专家', '老师', '工程师', '顾问', '编辑', '教练']
    },
    {
      key: 'example', label: '参考示例',
      hint: '给一个"输入 + 期望输出"的样例，这比任何形容词都管用',
      patch: '参考示例：像这样——（贴一个你满意的样例）',
      kw: ['例如', '示例', '举例', '参考', '比如', '像这样', '模板', '样例', '参照', '风格类似']
    },
    {
      key: 'askfirst', label: '先问再做（反问先行）',
      hint: '让 AI 在动手前先向你提问，把需求问清楚再开工——最能省返工的一步',
      patch: '在开始之前，请先向我提出 3 到 5 个最关键的问题，每个问题给出 2 到 3 个候选答案；我回答后，先复述你的理解并列出计划，我说「开始」你再动手。',
      kw: ['先问', '提问', '问我', '确认', '澄清', '信息不足', '不要急着', '不要直接', '先了解', '反问我', '询问我', '回答我', '不清楚', '需求确认', '问清']
    },
    {
      key: 'thinkstep', label: '分步 / 先出方案',
      hint: '复杂任务先要思路和方案，你确认后再让它执行',
      patch: '先给我 2 到 3 个方案，说明各自取舍，我选定之后你再写完整版本。',
      kw: ['一步一步', '分步', '先给', '先列', '思路', '计划', '步骤', '分阶段', '先出', '方案', '再执行', '确认后']
    }
  ];

  function analyze(text) {
    var t = String(text || '');
    var low = t.toLowerCase();
    var dims = DIMS.map(function (d) {
      var ok = d.kw.some(function (k) { return low.indexOf(String(k).toLowerCase()) >= 0; });
      return { key: d.key, label: d.label, hint: d.hint, patch: d.patch, ok: ok };
    });
    var hit = dims.filter(function (d) { return d.ok; }).length;
    var chars = t.replace(/\s/g, '').length;
    var score = Math.round((hit / dims.length) * 100);
    if (chars > 0 && chars < 15) score = Math.min(score, 25);
    var verdict;
    if (!chars) verdict = '还没有内容。先把你想让 AI 做的事写下来，哪怕只有一句话。';
    else if (score <= 25) verdict = '这条提示词还太单薄，AI 只能靠猜。先把「任务」和「背景」补上。';
    else if (score <= 49) verdict = '方向有了，但缺的零件不少。照下面的建议补齐，输出会明显变好。';
    else if (score <= 74) verdict = '已经能用了。把剩下几项补上，结果会稳定很多。';
    else if (score < 100) verdict = '相当完整，剩下的差距主要在细节颗粒度上。';
    else verdict = '八个零件齐全，接下来靠一轮轮迭代打磨。';
    if (chars >= 900) verdict += ' 另外，这条提示词偏长，试着分点、加小标题，别让重点被埋住。';
    return {
      score: score, chars: chars, verdict: verdict, dims: dims,
      missing: dims.filter(function (d) { return !d.ok; })
    };
  }

  PS.checkPrompt = analyze;
  PS.dims = DIMS;
})();
