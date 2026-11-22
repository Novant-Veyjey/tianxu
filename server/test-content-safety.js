/**
 * 内容安全模块自测：纯 Node 运行，不依赖任何第三方库，也不连数据库。
 * 用法：node 后台/server/test-content-safety.js
 * 全部用例通过退出码 0，有失败退出码 1（可直接接入 CI）。
 */
'use strict';

const {
  checkText,
  checkProduct,
  checkDemand,
  checkRate,
  RULES_SUMMARY,
  RATE_LIMIT
} = require('./content-safety');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? `：${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? `：${detail}` : ''}`);
  }
}

/** 生成长度恰好为 n 的文本：循环拼接短语，保证不会出现 6 连重复字符，专门用来测长度边界 */
function fill(n) {
  const pool = '好货鲜香菇产地直供冷链';
  let result = '';
  while (result.length < n) result += pool;
  return result.slice(0, n);
}

/** 取 issues 中某个字段的错误码，便于断言「是哪条规则拦下的」 */
function codeOf(result, field) {
  const hit = (result.issues || []).find((item) => item.field === field);
  return hit ? hit.code : '';
}

// 1. 正常商品通过
console.log('1. 正常商品应通过');
const goodProduct = {
  name: '鲜香菇',
  description: '今早采摘，冷链发货，欢迎批发。',
  quantity: 200,
  price: 12.5,
  unit: 'kg'
};
const good = checkProduct(goodProduct);
check('正常商品 checkProduct 通过', good.ok === true, JSON.stringify(good.issues));
check('正常商品 issues 为空数组', Array.isArray(good.issues) && good.issues.length === 0);

// 2. 含网址拒绝
console.log('2. 含网址 / 站外导流应拒绝');
const urlCases = [
  ['http:// 网址', { ...goodProduct, description: '详情见 http://shop.example.com' }],
  ['https:// 网址', { ...goodProduct, name: '香菇 https://x.cn' }],
  ['www. 网址', { ...goodProduct, description: '去 www.gushi.com 看货' }],
  ['加微信', { ...goodProduct, description: '有意向加微信详聊' }],
  ['加V（全角归一化）', { ...goodProduct, description: '加Ｖ看货' }],
  ['私聊', { ...goodProduct, description: '价格私聊' }],
  ['扫码', { ...goodProduct, description: '扫码下单更便宜' }],
  ['微信号串', { ...goodProduct, description: '微信 abc12345 联系我' }],
  ['QQ 号串', { ...goodProduct, description: 'qq:123456789' }]
];
for (const [label, payload] of urlCases) {
  const result = checkProduct(payload);
  check(`${label} 被拒绝`, result.ok === false && codeOf(result, 'description') === 'link' || (result.ok === false && codeOf(result, 'name') === 'link'), JSON.stringify(result.issues));
}

// 3. 含敏感词拒绝
console.log('3. 含低俗 / 违法违规词应拒绝');
const sensitive = checkProduct({ ...goodProduct, description: '低价出售，可代开发票' });
check('敏感词被拒绝', sensitive.ok === false);
check('敏感词错误码为 sensitive', codeOf(sensitive, 'description') === 'sensitive', JSON.stringify(sensitive.issues));
check('敏感词提示为中文可展示文案', /低俗|违法/.test((sensitive.issues[0] || {}).message || ''));

const sensitiveDemand = checkDemand({
  buyer_name: '某某合作社',
  product_name: '干香菇',
  quantity: 10,
  requirements: '有货的联系，支持套现'
});
check('采购需求敏感词被拒绝', sensitiveDemand.ok === false && codeOf(sensitiveDemand, 'requirements') === 'sensitive');

// 4. 超长拒绝 + 过短拒绝
console.log('4. 超长 / 过短应拒绝');
const longText = checkProduct({ ...goodProduct, description: fill(301) });
check('描述超过 300 字被拒绝', longText.ok === false && codeOf(longText, 'description') === 'too_long');
check('刚好 300 字可以通过', checkProduct({ ...goodProduct, description: fill(300) }).ok === true);
check('商品名 1 个字被拒绝', checkProduct({ ...goodProduct, name: '菇' }).ok === false);
check('商品名 41 个字被拒绝', checkProduct({ ...goodProduct, name: '菇'.repeat(41) }).ok === false);
check('商品名缺失被拒绝', checkProduct({ ...goodProduct, name: '' }).ok === false);
check('采购方名称超长被拒绝', checkDemand({ buyer_name: '采'.repeat(31), product_name: '鲜香菇', quantity: 5 }).ok === false);
check('采购方名称 1 个字被拒绝', checkDemand({ buyer_name: '采', product_name: '鲜香菇', quantity: 5 }).ok === false);
check('采购说明超长被拒绝', checkDemand({ buyer_name: '采购商', product_name: '鲜香菇', quantity: 5, requirements: '要'.repeat(301) }).ok === false);

// 5. 连续重复字符 / 纯符号 / 连续感叹号
console.log('5. 刷屏诱导应拒绝');
const repeatCase = checkProduct({ ...goodProduct, description: '好货' + '好'.repeat(6) + '便宜卖' });
check('同一字符连续重复 6 次被拒绝', repeatCase.ok === false && codeOf(repeatCase, 'description') === 'spam');
check('刚好重复 5 次可以通过', checkProduct({ ...goodProduct, description: '好货好货好货好货好货' }).ok === true);
const symbolCase = checkProduct({ ...goodProduct, description: '★★★★★★' });
check('纯符号被拒绝', symbolCase.ok === false && codeOf(symbolCase, 'description') === 'spam');
const bangCase = checkProduct({ ...goodProduct, description: '特价甩卖！！！' });
check('全角感叹号 3 连被拒绝', bangCase.ok === false && codeOf(bangCase, 'description') === 'spam');
check('单个感叹号可以通过', checkProduct({ ...goodProduct, description: '特价甩卖！' }).ok === true);

// 6. 数值越界
console.log('6. 价格 / 数量越界应拒绝');
check('价格为 -1 被拒绝', checkProduct({ ...goodProduct, price: -1 }).ok === false && codeOf(checkProduct({ ...goodProduct, price: -1 }), 'price') === 'range');
check('价格为 100001 被拒绝', codeOf(checkProduct({ ...goodProduct, price: 100001 }), 'price') === 'range');
check('价格为 0 可以通过', checkProduct({ ...goodProduct, price: 0 }).ok === true);
check('价格为 100000 可以通过', checkProduct({ ...goodProduct, price: 100000 }).ok === true);
check('数量为 0 被拒绝', codeOf(checkProduct({ ...goodProduct, quantity: 0 }), 'quantity') === 'range');
check('数量为 1000001 被拒绝', codeOf(checkProduct({ ...goodProduct, quantity: 1000001 }), 'quantity') === 'range');
check('数量为 1000000 可以通过', checkProduct({ ...goodProduct, quantity: 1000000 }).ok === true);
check('数量非数字被拒绝', codeOf(checkProduct({ ...goodProduct, quantity: '很多' }), 'quantity') === 'number');
check('采购意向价格为 -5 被拒绝', codeOf(checkDemand({ buyer_name: '采购商', product_name: '鲜香菇', quantity: 5, price: -5 }), 'price') === 'range');

// 7. 修改场景（partial）：只改一个字段不应被判成缺少必填
console.log('7. 修改场景只校验提交的字段');
const partialIcon = checkProduct({ icon: '🍄' }, { partial: true });
check('只改图标可以通过（partial）', partialIcon.ok === true, JSON.stringify(partialIcon.issues));
check('只改图标用全量校验会被拒（说明 partial 必要）', checkProduct({ icon: '🍄' }).ok === false);
check('partial 下改非法名称仍被拒绝', checkProduct({ name: 'http://x.cn' }, { partial: true }).ok === false);
check('partial 下改非法价格仍被拒绝', checkProduct({ price: 200000 }, { partial: true }).ok === false);

// 8. 联系方式只查导流，不误杀正常手机号
console.log('8. 联系方式放行正常号码、拦住导流');
check('正常手机号可以通过', checkDemand({ buyer_name: '采购商', product_name: '鲜香菇', quantity: 5, contact: '13800138000' }).ok === true);
check('联系方式含微信被拒绝', codeOf(checkDemand({ buyer_name: '采购商', product_name: '鲜香菇', quantity: 5, contact: '微信 abc12345' }), 'contact') === 'link');

// 9. checkText 单字段接口
console.log('9. checkText 单字段接口');
check('checkText 正常文本返回 ok', checkText('name', '鲜香菇').ok === true);
check('checkText 空值不算错', checkText('name', '   ').ok === true);
const badText = checkText('description', '看 www.test.com');
check('checkText 命中导流返回 code', badText.ok === false && badText.code === 'link');
check('checkText 带中文 message', typeof badText.message === 'string' && badText.message.length > 0);

// 10. 频控：同一账号第 21 条被拒
console.log('10. 发布频控');
const rateUser = `rate_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
let ratePassed = 0;
for (let i = 0; i < RATE_LIMIT; i += 1) {
  if (checkRate(rateUser).ok) ratePassed += 1;
}
check(`前 ${RATE_LIMIT} 条都放行`, ratePassed === RATE_LIMIT, `实际放行 ${ratePassed} 条`);
const blocked = checkRate(rateUser);
check('第 21 条被拒绝', blocked.ok === false);
check('频控提示为中文可展示文案', typeof blocked.message === 'string' && /频繁|最多/.test(blocked.message));
check('其它账号不受影响', checkRate(`${rateUser}_other`).ok === true);

// 11. 规则摘要
console.log('11. 规则摘要给前端展示');
check('RULES_SUMMARY 是数组', Array.isArray(RULES_SUMMARY));
check('RULES_SUMMARY 有 4~5 条', RULES_SUMMARY.length >= 4 && RULES_SUMMARY.length <= 5, `实际 ${RULES_SUMMARY.length} 条`);
check('RULES_SUMMARY 每一条都是非空字符串', RULES_SUMMARY.every((item) => typeof item === 'string' && item.trim().length > 0));

console.log('');
console.log(`通过 ${passed} 项，失败 ${failed} 项`);
if (failed) {
  console.log('失败用例：');
  for (const item of failures) console.log(`  - ${item}`);
  process.exit(1);
}
console.log('内容安全规则全部通过');
