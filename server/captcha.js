const crypto = require('crypto');

/**
 * 图形验证码：内存态、一次性、带有效期。
 *
 * 为什么自己画 SVG 而不装 canvas / sharp：
 * 这个项目只依赖 better-sqlite3 + express + mqtt + qrcode-generator，
 * 为了四个字符再引一个需要本地编译的原生图形库，部署到 Qoder Sites 时反而更容易失败。
 * SVG 由字符串拼出来，服务端不需要任何图形依赖，前端 <img> 直接就能显示。
 *
 * 安全边界（要说清楚，不夸大）：
 * - 验证码本身挡的是「脚本批量猜账号密码」，代码是一次性的，5 分钟过期；
 * - 真正兜底的是 auth.js 里的登录失败锁定（同一账号连续 5 次错误锁定 5 分钟）；
 * - 小程序端图形验证码的兼容性没把握，所以后端只在请求确实带了验证码字段时校验，
 *   网页端（H5 / 管理台）由前端强制带上，缺字段本地就拦住了。
 */

/** 有效期：5 分钟 */
const TTL_MS = 5 * 60 * 1000;
/** 同时最多保留的验证码数量，防止被刷内存 */
const MAX_ENTRIES = 2000;
/** 去掉 0/O、1/I/L 等肉眼容易看错的字符 */
const CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const LENGTH = 4;

/** id -> { code, expires } */
const store = new Map();

function prune(now = Date.now()) {
  for (const [id, item] of store) {
    if (item.expires <= now) store.delete(id);
  }
  // 仍然超量时按插入顺序丢掉最早的（Map 保持插入顺序）
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
}

function randomCode() {
  let code = '';
  for (let i = 0; i < LENGTH; i += 1) {
    code += CHARSET[crypto.randomInt(CHARSET.length)];
  }
  return code;
}

/** 生成干扰线：两端在画布边缘附近，中间用二次曲线拱起 */
function noisePaths(width, height) {
  return Array.from({ length: 3 }, () => {
    const y1 = crypto.randomInt(6, height - 6);
    const y2 = crypto.randomInt(6, height - 6);
    const cx = crypto.randomInt(width / 3, (width * 2) / 3);
    const cy = crypto.randomInt(4, height - 4);
    return `<path d="M2 ${y1} Q${cx} ${cy} ${width - 2} ${y2}" stroke="#b9cdc1" stroke-width="1.4" fill="none" opacity="0.75"/>`;
  }).join('');
}

/** 每个字符独立给一点旋转与上下浮动，让图像不能被模板直接切分 */
function glyphs(code, width, height) {
  const step = (width - 16) / code.length;
  return code
    .split('')
    .map((char, index) => {
      const x = 10 + step * index + step / 2;
      const y = height / 2 + crypto.randomInt(-3, 4);
      const rotate = crypto.randomInt(-16, 17);
      const size = crypto.randomInt(22, 26);
      return `<text x="${x}" y="${y}" fill="#1f6a4a" font-family="Georgia, 'Times New Roman', serif" font-size="${size}" font-weight="700" text-anchor="middle" dominant-baseline="middle" transform="rotate(${rotate} ${x} ${y})">${char}</text>`;
    })
    .join('');
}

function renderSvg(code) {
  const width = 120;
  const height = 44;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="图形验证码">`,
    `<rect width="${width}" height="${height}" rx="8" fill="#f3f7f4"/>`,
    noisePaths(width, height),
    glyphs(code, width, height),
    '</svg>'
  ].join('');
}

/** 生成一枚验证码：返回 id + 可直接当 src 用的 SVG 文本 */
function create() {
  prune();
  const code = randomCode();
  const id = crypto.randomBytes(12).toString('hex');
  store.set(id, { code, expires: Date.now() + TTL_MS });
  return { id, svg: renderSvg(code), expiresIn: Math.round(TTL_MS / 1000) };
}

/** 校验并作废：无论成败，同一 id 只能用一次（失败也要删，避免被逐个字母试） */
function verify(id, input) {
  const key = String(id || '');
  const value = store.get(key);
  if (!value) return false;
  store.delete(key);
  if (value.expires <= Date.now()) return false;
  return String(input || '').trim().toUpperCase() === value.code;
}

module.exports = { create, verify, TTL_MS };
