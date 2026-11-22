/**
 * 市场发布内容安全治理
 * ------------------------------------------------------------------
 * 供应信息（products）与采购需求（demands）是所有账号互通可见的公开内容，
 * 一旦出现站外导流、违法违规或刷屏文案，影响的是整个平台的口碑与合规性。
 * 这里把判定规则收敛到一处，路由层只负责把 issues 原样返回给前端。
 *
 * 只做纯函数判定，不依赖数据库、不发起网络请求，便于单测与复用。
 */
'use strict';

/** 字段的中文名与长度限制：message 直接展示给用户，所以每个字段都要有中文名 */
const FIELD_POLICY = {
  name: { label: '商品名称', min: 2, max: 40 },
  description: { label: '商品描述', max: 300 },
  buyer_name: { label: '采购方名称', min: 2, max: 30 },
  product_name: { label: '采购产品名称', min: 2, max: 40 },
  requirements: { label: '采购说明', max: 300 },
  // 联系方式允许填手机号 / 座机：只查站外导流，不做敏感词与长度限制，避免把正常号码误判成违规
  contact: { label: '联系方式', linkOnly: true }
};

/**
 * 低俗辱骂与违法违规词表：命中任意一条即驳回。
 * 只收录明显违规、不会出现在正常食用菌交易文案里的词，避免误伤「消毒」「菌种」这类生产用语。
 */
const SENSITIVE_WORDS = [
  '赌博', '博彩', '六合彩', '私彩', '洗钱', '传销', '诈骗', '刷单', '套现', '代开发票',
  '办证', '假证', '高仿', '走私', '毒品', '冰毒', '大麻', '枪支', '弹药', '迷药',
  '春药', '招嫖', '卖淫', '裸聊', '色情', '黄色网站', '约炮', '一夜情', '邪教', '黑客',
  '木马', '外挂', '傻逼', '煞笔', '脑残', '智障', '白痴', '蠢货', '去死', '滚蛋',
  '贱人', '狗杂种', '他妈的', '操你妈', '草泥马', 'nmsl', 'fuck', 'bitch', 'asshole'
];

/** 站外导流的固定关键词：全角会被归一化，因此这里只写半角与中文 */
const CONTACT_KEYWORDS = ['加微信', '加v', '加微', '私聊', '扫码', '扫一扫'];

/** 微信 / QQ 等账号：关键词后面紧跟一串账号字符，视为导流 */
const CONTACT_ACCOUNT_PATTERN = /(?:微信|weixin|vx|wx|qq|v信)\s*[:：]?\s*[a-z0-9_-]{5,}/;

/** 网址特征：http(s):// 与 www. 都会被拦下 */
const URL_PATTERN = /https?:\/\/|www\./;

/** 刷屏判定：同一字符连续出现 6 次及以上；三个及以上连续感叹号（全角已归一化成半角） */
const REPEAT_PATTERN = /(.)\1{5,}/u;
const BANG_PATTERN = /!{3,}/;

/** 发布频控：同一账号 1 小时内供应 + 采购合计上限 */
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000;

/** 进程内频控表：userId -> 发布时间戳数组。单机演示够用，多实例部署需换成 Redis 等外部存储 */
const rateStore = new Map();

/**
 * 文本归一化：先 trim，再把全角字符（！～ 与全角空格）折成半角。
 * 不做归一化的话，用「ＷＷＷ．ｘｘ．ｃｏｍ」「加ｖ」就能绕过词表。
 */
function normalize(value) {
  if (value === undefined || value === null) return '';
  let result = String(value).trim();
  // 全角 ASCII（U+FF01 - U+FF5E）逐个映射回半角
  result = result.replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  // 全角空格
  result = result.replace(/\u3000/g, ' ');
  return result.trim();
}

function issue(field, code, message) {
  return { field, code, message };
}

/**
 * 单字段文本校验：
 * - 空值不算错，必填由 checkProduct / checkDemand 统一判定，避免同一处空值报两条错
 * - 命中站外导流 > 敏感词 > 刷屏 > 长度，返回第一条问题
 */
function checkText(field, value) {
  const policy = FIELD_POLICY[field] || { label: field };
  const label = policy.label || field;
  const normalized = normalize(value);
  if (!normalized) return { ok: true };
  const lower = normalized.toLowerCase();

  // 1. 站外导流：任何字段都不允许（联系方式字段也只查这一项）
  if (URL_PATTERN.test(lower) || CONTACT_KEYWORDS.some((word) => lower.includes(word)) || CONTACT_ACCOUNT_PATTERN.test(lower)) {
    return {
      ok: false,
      code: 'link',
      message: `${label}不能填写网址、微信号、QQ 号，也不要出现「加微信」「加V」「私聊」「扫码」等站外联系方式`
    };
  }

  if (policy.linkOnly) return { ok: true };

  // 2. 低俗辱骂 / 违法违规
  const hit = SENSITIVE_WORDS.find((word) => lower.includes(word));
  if (hit) {
    return { ok: false, code: 'sensitive', message: `${label}包含低俗或违法违规用语，请修改后再发布` };
  }

  // 3. 刷屏诱导：连续重复字符、纯符号、连续感叹号
  const compact = normalized.replace(/\s+/g, '');
  const spam = REPEAT_PATTERN.test(normalized) || BANG_PATTERN.test(normalized) || (compact && !/[\p{L}\p{N}]/u.test(compact));
  if (spam) {
    return {
      ok: false,
      code: 'spam',
      message: `${label}疑似刷屏（字符连续重复、纯符号或连续感叹号），请用正常的文字描述`
    };
  }

  // 4. 长度
  const length = Array.from(normalized).length;
  if (policy.min && length < policy.min) {
    return { ok: false, code: 'too_short', message: `${label}至少 ${policy.min} 个字` };
  }
  if (policy.max && length > policy.max) {
    return { ok: false, code: 'too_long', message: `${label}不能超过 ${policy.max} 个字` };
  }
  return { ok: true };
}

/**
 * 数值区间校验：范围写死在这里，和前端表单的提示保持一致。
 * 返回 null 表示通过，否则返回 { code, message }。
 */
function checkNumber(rule, value) {
  const label = rule.label;
  if (value === undefined || value === null || String(value).trim() === '') {
    return rule.required ? { code: 'required', message: `请填写${label}` } : null;
  }
  if (!Number.isFinite(Number(value))) {
    return { code: 'number', message: `${label}必须是数字` };
  }
  const amount = Number(value);
  const minOk = rule.exclusiveMin ? amount > rule.min : amount >= rule.min;
  const unit = rule.unit || '';
  if (!minOk || amount > rule.max) {
    const range = rule.exclusiveMin
      ? `需大于 ${rule.min} 且不超过 ${rule.max}${unit}`
      : `需在 ${rule.min}~${rule.max}${unit}之间`;
    return { code: 'range', message: `${label}${range}` };
  }
  return null;
}

/** 供应信息 / 采购需求的字段规格：文本字段走 checkText，数值字段走 checkNumber */
const SCHEMAS = {
  product: {
    texts: [
      { field: 'name', label: '商品名称', required: true },
      { field: 'description', label: '商品描述' }
    ],
    numbers: [
      { field: 'quantity', label: '供应数量', min: 0, exclusiveMin: true, max: 1000000, required: true },
      { field: 'price', label: '参考价格', min: 0, max: 100000, unit: ' 元' }
    ]
  },
  demand: {
    texts: [
      { field: 'buyer_name', label: '采购方名称', required: true },
      { field: 'product_name', label: '采购产品名称', required: true },
      { field: 'requirements', label: '采购说明' },
      { field: 'contact', label: '联系方式' }
    ],
    numbers: [
      { field: 'quantity', label: '采购数量', min: 0, exclusiveMin: true, max: 1000000, required: true },
      { field: 'price', label: '意向价格', min: 0, max: 100000, unit: ' 元' }
    ]
  }
};

/**
 * 按规格逐字段校验。
 * partial=true 用于「修改」场景：只校验请求体里实际出现的字段，
 * 否则前端只改一个图标（PUT /api/products/:id 只带 icon）也会被判成「缺少名称」。
 */
function runCheck(schema, payload, options = {}) {
  const partial = Boolean(options.partial);
  const body = payload || {};
  const issues = [];

  for (const rule of schema.texts) {
    const raw = body[rule.field];
    const empty = raw === undefined || raw === null || String(raw).trim() === '';
    if (empty) {
      if (rule.required && !partial) issues.push(issue(rule.field, 'required', `请填写${rule.label}`));
      continue;
    }
    const result = checkText(rule.field, raw);
    if (!result.ok) issues.push(issue(rule.field, result.code, result.message));
  }

  for (const rule of schema.numbers) {
    const raw = body[rule.field];
    const empty = raw === undefined || raw === null || String(raw).trim() === '';
    if (empty && partial) continue;
    const result = checkNumber(rule, raw);
    if (result) issues.push(issue(rule.field, result.code, result.message));
  }

  return { ok: issues.length === 0, issues };
}

/** 供应信息（market/products）发布 / 修改校验 */
function checkProduct(payload, options = {}) {
  return runCheck(SCHEMAS.product, payload, options);
}

/** 采购需求（market/demands）发布 / 修改校验 */
function checkDemand(payload, options = {}) {
  return runCheck(SCHEMAS.demand, payload, options);
}

/**
 * 发布频率限制：同一账号 products + demands 合计 1 小时（滚动窗口）最多 20 条。
 * 命中上限时不记录本次时间戳，避免用户被「越试越久」地锁死。
 */
function checkRate(userId) {
  const key = String(userId === undefined || userId === null ? '' : userId);
  if (!key) return { ok: true };
  const now = Date.now();
  const hits = (rateStore.get(key) || []).filter((stamp) => now - stamp < RATE_WINDOW_MS);
  if (hits.length >= RATE_LIMIT) {
    rateStore.set(key, hits);
    return { ok: false, message: `发布太频繁了：1 小时内最多发布 ${RATE_LIMIT} 条供应或采购信息，请稍后再试` };
  }
  hits.push(now);
  rateStore.set(key, hits);
  // 顺手清理长期不活跃的账号，防止 Map 无限膨胀（演示环境一个进程长期运行也不会堆积）
  if (rateStore.size > 500) {
    for (const [id, stamps] of rateStore) {
      const alive = stamps.filter((stamp) => now - stamp < RATE_WINDOW_MS);
      if (alive.length) rateStore.set(id, alive);
      else rateStore.delete(id);
    }
  }
  return { ok: true, remaining: RATE_LIMIT - hits.length };
}

/** 给前端直接展示的规则条目：市场发布页在表单上方列出，让用户先知道边界 */
const RULES_SUMMARY = [
  '商品名称 2~40 字，商品描述与采购说明不超过 300 字，采购方名称 2~30 字，采购产品名称 2~40 字。',
  '禁止站外导流：不要填网址、微信号、QQ 号，也不要出现「加微信」「加V」「私聊」「扫码」等字样。',
  '禁止低俗辱骂与违法违规内容（如赌博、代开发票、假证、传销等），命中即驳回。',
  '禁止刷屏诱导：同一字符不要连续重复 6 次以上，不要用纯符号或连续感叹号凑字数。',
  '价格填写 0~100000 元，数量需大于 0 且不超过 1000000；每个账号 1 小时内最多发布 20 条供应或采购信息。'
];

module.exports = { checkText, checkProduct, checkDemand, checkRate, RULES_SUMMARY, RATE_LIMIT };
