const crypto = require('crypto');
const { db } = require('./db');
const { hashPassword } = require('./auth');

/**
 * 大赛演示数据：赣北三个基地、五个批次、七天环境曲线、完整溯源链与交易订单。
 * 全部绑定在 demo 账号下，重复执行只补齐缺失记录，不会影响其他账号。
 * 演示账号：demo / demo123456（平台管理员）
 * 采购商：demo_buyer / demo123456
 */
const DEMO = { username: 'demo', password: 'demo123456', displayName: '林青', role: 'admin' };
const BUYER = { username: 'demo_buyer', password: 'demo123456', displayName: '演示采购商', role: 'buyer' };

function ensureUser({ username, password, displayName, role }) {
  let user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    const { hash, salt } = hashPassword(password);
    const info = db
      .prepare('INSERT INTO users (username, display_name, role, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)')
      .run(username, displayName, role, hash, salt);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  }
  if (user.role !== role || user.display_name !== displayName) {
    db.prepare('UPDATE users SET role = ?, display_name = ?, updated_at = ? WHERE id = ?').run(role, displayName, new Date().toISOString(), user.id);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  }
  return user;
}

function dayText(offset) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function isoAt(daysAgo, hour) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

const demo = ensureUser(DEMO);
const buyer = ensureUser(BUYER);
const uid = demo.id;

function removePlaceholder() {
  // 旧版 seed-demo 的「演示基地（可删除）」占位数据，避免出现在大赛截图里
  db.prepare(
    "DELETE FROM alerts WHERE user_id = ? AND (message LIKE '演示预警%' OR reading_id IN (SELECT id FROM readings WHERE user_id = ? AND notes = '演示数据'))"
  ).run(uid, uid);
  db.prepare("DELETE FROM readings WHERE user_id = ? AND notes = '演示数据'").run(uid);
  db.prepare("DELETE FROM trace_events WHERE user_id = ? AND description LIKE '演示%'").run(uid);
  db.prepare("DELETE FROM expert_questions WHERE user_id = ? AND title LIKE '演示问题%'").run(uid);
  db.prepare("DELETE FROM products WHERE user_id = ? AND name LIKE '演示%'").run(uid);
  db.prepare("DELETE FROM demands WHERE user_id = ? AND buyer_name LIKE '演示%'").run(uid);
  db.prepare("DELETE FROM tasks WHERE user_id = ? AND title LIKE '演示任务%'").run(uid);
  db.prepare("DELETE FROM batches WHERE user_id = ? AND code = 'DEMO-20260901-01'").run(uid);
  db.prepare("DELETE FROM bases WHERE user_id = ? AND name = '演示基地（可删除）'").run(uid);
}

removePlaceholder();

function ensureBase(name, row) {
  const found = db.prepare('SELECT * FROM bases WHERE user_id = ? AND name = ?').get(uid, name);
  if (found) return found;
  const info = db
    .prepare(
      `INSERT INTO bases (name, township, address, contact_name, contact_phone, area_mu, status, notes, user_id)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`
    )
    .run(name, row.township, row.address, row.contact, row.phone, row.area, row.notes, uid);
  return db.prepare('SELECT * FROM bases WHERE id = ?').get(info.lastInsertRowid);
}

function ensureBatch(code, row) {
  const found = db.prepare('SELECT * FROM batches WHERE code = ?').get(code);
  if (found) return found;
  const info = db
    .prepare(
      `INSERT INTO batches (code, base_id, mushroom_type, variety, quantity, stage, start_date, expected_harvest_date, status, notes, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
    )
    .run(code, row.baseId, row.mushroomType, row.variety, row.quantity, row.stage, row.startDate, row.harvestDate, row.notes, uid);
  return db.prepare('SELECT * FROM batches WHERE id = ?').get(info.lastInsertRowid);
}

function ensureDevice(code, row) {
  const found = db.prepare('SELECT * FROM devices WHERE code = ?').get(code);
  if (found) {
    db.prepare('UPDATE devices SET base_id = ?, name = ?, updated_at = ? WHERE id = ?').run(row.baseId, row.name, new Date().toISOString(), found.id);
    return db.prepare('SELECT * FROM devices WHERE id = ?').get(found.id);
  }
  const info = db
    .prepare(
      `INSERT INTO devices (user_id, base_id, name, code, secret, model, status, temp_max, humidity_min, co2_max, notes)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`
    )
    .run(uid, row.baseId, row.name, code, crypto.randomBytes(16).toString('hex'), row.model, row.tempMax, row.humidityMin, row.co2Max, row.notes);
  return db.prepare('SELECT * FROM devices WHERE id = ?').get(info.lastInsertRowid);
}

const base1 = ensureBase('德安县聂桥镇食用菌产业园', {
  township: '聂桥镇',
  address: '德安县聂桥镇宝山村',
  contact: '王建国',
  phone: '0792-4660188',
  area: 120,
  notes: '演示数据 · 标准化菌棒车间 12 座，周年化出菇棚 36 栋，带动周边 68 户菇农'
});
const base2 = ensureBase('永修县柘林湖菌菇合作社', {
  township: '柘林镇',
  address: '永修县柘林镇易家河村',
  contact: '李红梅',
  phone: '0792-3061260',
  area: 80,
  notes: '演示数据 · 合作社统一制棒、分户出菇，覆盖 46 户社员'
});
const base3 = ensureBase('武宁县罗坪镇长水林下菌场', {
  township: '罗坪镇',
  address: '武宁县罗坪镇长水村',
  contact: '陈志强',
  phone: '0792-2896116',
  area: 60,
  notes: '演示数据 · 林下仿野生栽培，羊肚菌与灵芝轮作'
});

const batch1 = ensureBatch('GSH-20260820-01', {
  baseId: base1.id,
  mushroomType: '香菇',
  variety: '808',
  quantity: 12000,
  stage: '采收期',
  startDate: dayText(-88),
  harvestDate: dayText(-32),
  notes: '秋栽香菇，已完成三潮菇采收，平均单棒产量 0.62kg'
});
const batch2 = ensureBatch('GSH-20260915-02', {
  baseId: base1.id,
  mushroomType: '香菇',
  variety: '215',
  quantity: 15000,
  stage: '成熟期',
  startDate: dayText(-62),
  harvestDate: dayText(4),
  notes: '第二潮菇，棚温控制在 18–22℃，目标一级菇率 75%'
});
const batch3 = ensureBatch('GSH-20261002-03', {
  baseId: base2.id,
  mushroomType: '平菇',
  variety: '黑平王',
  quantity: 9000,
  stage: '成熟期',
  startDate: dayText(-45),
  harvestDate: dayText(2),
  notes: '合作社统一种植，本周进入催蕾阶段'
});
const batch4 = ensureBatch('GSH-20261020-04', {
  baseId: base2.id,
  mushroomType: '香菇',
  variety: '808',
  quantity: 11000,
  stage: '生长期',
  startDate: dayText(-27),
  harvestDate: dayText(24),
  notes: '发菌棚恒温 23℃，避光培养，预计 12 月上旬转色'
});
const batch5 = ensureBatch('GSH-20261105-05', {
  baseId: base3.id,
  mushroomType: '羊肚菌',
  variety: '六妹',
  quantity: 5000,
  stage: '育苗期',
  startDate: dayText(-11),
  harvestDate: dayText(86),
  notes: '林下棚营养袋已摆放完毕，重点监测低温和湿度'
});

const device1 = ensureDevice('GSH-DEV-001', {
  baseId: base1.id,
  name: '1号棚环境网关',
  model: 'RS-ENV-4G',
  tempMax: 26,
  humidityMin: 85,
  co2Max: 800,
  notes: '采集温度、湿度、CO₂ 与光照，每 10 分钟上报一次'
});
const device2 = ensureDevice('GSH-DEV-002', {
  baseId: base2.id,
  name: '2号棚环境网关',
  model: 'RS-ENV-4G',
  tempMax: 26,
  humidityMin: 85,
  co2Max: 800,
  notes: '合作社统一加装的第二台网关'
});

const readingStmt = db.prepare(
  `INSERT INTO readings (base_id, device_id, device_name, temperature, humidity, co2, light, recorded_at, notes, source, user_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, '演示数据', 'device', ?)`
);
const latest = {};
const todayHour = new Date().getHours();
let readingCount = 0;

function addReading(baseId, deviceId, deviceName, key, daysAgo, hour, values) {
  const info = readingStmt.run(baseId, deviceId, deviceName, values.t, values.h, values.c, values.l, isoAt(daysAgo, hour), uid);
  latest[key] = { id: info.lastInsertRowid, at: isoAt(daysAgo, hour), values };
  readingCount += 1;
}

const mix = (seed) => Math.sin(seed * 12.9898) * 0.5;

for (let d = 6; d >= 0; d -= 1) {
  for (const hour of [8, 14, 20]) {
    if (d === 0 && hour > todayHour) continue;
    const phase = Math.sin(((hour - 9) / 24) * Math.PI * 2);
    const drift = (6 - d) * 0.04;

    const t1 = 20.6 + 1.4 * phase + drift + mix(d * 3 + hour);
    const h1 = 90.4 - 2.6 * phase + mix(d * 5 + hour) * 2;
    let c1 = 640 + 150 * ((hour - 8) / 12) + mix(d * 7 + hour) * 60;
    let l1 = hour === 14 ? 420 : hour === 8 ? 210 : 60;
    // 两天前的晚间通风不足，制造一条真实的 CO₂ 预警
    if (d === 2 && hour === 20) c1 = 1150;
    addReading(base1.id, device1.id, device1.name, 'b1', d, hour, {
      t: Math.round(t1 * 10) / 10,
      h: Math.round(h1 * 10) / 10,
      c: Math.round(c1),
      l: l1
    });

    const t2 = 21.3 + 1.7 * phase + drift + mix(d * 11 + hour);
    let h2 = 87.6 - 2.8 * phase + mix(d * 13 + hour) * 2;
    const c2 = 560 + 130 * ((hour - 8) / 12) + mix(d * 17 + hour) * 50;
    const l2 = hour === 14 ? 360 : hour === 8 ? 180 : 50;
    // 昨天中午加湿器故障，湿度跌破 85% 下限
    if (d === 1 && hour === 14) h2 = 82;
    addReading(base2.id, device2.id, device2.name, 'b2', d, hour, {
      t: Math.round(t2 * 10) / 10,
      h: Math.round(h2 * 10) / 10,
      c: Math.round(c2),
      l: l2
    });
  }
}

for (let d = 2; d >= 0; d -= 1) {
  for (const hour of [9, 18]) {
    if (d === 0 && hour > todayHour) continue;
    const phase = Math.sin(((hour - 9) / 24) * Math.PI * 2);
    addReading(base3.id, null, '林下棚环境网关', 'b3', d, hour, {
      t: Math.round((14.2 + 1.1 * phase) * 10) / 10,
      h: Math.round((91 - 1.6 * phase) * 10) / 10,
      c: Math.round(500 + mix(d * 19 + hour) * 40),
      l: 90
    });
  }
}

function touchDevice(device, reading) {
  if (!reading) return;
  db.prepare('UPDATE devices SET last_seen_at = ?, last_values = ?, updated_at = ? WHERE id = ?').run(
    reading.at,
    JSON.stringify({
      temperature: reading.values.t,
      humidity: reading.values.h,
      co2: reading.values.c,
      light: reading.values.l,
      recorded_at: reading.at
    }),
    new Date().toISOString(),
    device.id
  );
}
touchDevice(device1, latest.b1);
touchDevice(device2, latest.b2);

const alertStmt = db.prepare(
  `INSERT INTO alerts (base_id, reading_id, alert_type, level, message, status, user_id, created_at)
   VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`
);
if (latest.b1 && !db.prepare("SELECT 1 FROM alerts WHERE reading_id = ?").get(latest.b1.id)) {
  alertStmt.run(base1.id, latest.b1.id, 'CO₂ 偏高', 'high', '1号棚 CO₂ 浓度 1150ppm，超过 800ppm 阈值，建议立即通风 30 分钟', uid, latest.b1.at);
}
if (latest.b2 && !db.prepare("SELECT 1 FROM alerts WHERE reading_id = ?").get(latest.b2.id)) {
  alertStmt.run(base2.id, latest.b2.id, '湿度偏低', 'medium', '2号棚湿度 82%，低于 85% 下限，建议检查加湿器并喷雾补水', uid, latest.b2.at);
}

const eventStmt = db.prepare(
  `INSERT INTO trace_events (batch_id, event_type, title, description, event_date, operator, user_id)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
function seedTrace(batch, events) {
  if (db.prepare('SELECT 1 FROM trace_events WHERE batch_id = ? LIMIT 1').get(batch.id)) return;
  for (const item of events) {
    eventStmt.run(batch.id, item.type, item.title, item.description, dayText(item.day), item.operator, uid);
  }
}

seedTrace(batch1, [
  { day: -88, type: '拌料装袋', title: '拌料与装袋', description: '木屑 78%、麦麸 20%、石膏 2%，含水量 58%，装袋 12000 棒', operator: '王建国' },
  { day: -87, type: '常压灭菌', title: '常压灭菌', description: '料袋 100℃ 保持 12 小时，冷却至 28℃ 以下转入接种室', operator: '王建国' },
  { day: -86, type: '无菌接种', title: '无菌接种', description: '接种室洁净度万级，接种香菇 808 菌种 12000 棒', operator: '技术员 周敏' },
  { day: -85, type: '菌棒养菌', title: '菌棒养菌', description: '发菌棚 22–25℃ 避光培养 35 天，翻堆 3 次，污染率 1.2%', operator: '技术员 周敏' },
  { day: -49, type: '转色催蕾', title: '转色与催蕾', description: '温差刺激 8–10℃，湿度提升至 90%，散射光 200lux', operator: '王建国' },
  { day: -41, type: '出菇管理', title: '出菇管理', description: '每日通风 3 次，保持 18–22℃，CO₂ 控制在 800ppm 以下', operator: '王建国' },
  { day: -32, type: '采收分级', title: '采收与分级', description: '第一潮菇采收 3200kg，按菌盖直径 3–5cm 分为一级菇', operator: '质检员 刘芳' },
  { day: -31, type: '冷链出库', title: '冷链出库', description: '4℃ 预冷 6 小时，抽检农残合格，当日发往南昌市场', operator: '质检员 刘芳' }
]);

seedTrace(batch2, [
  { day: -62, type: '无菌接种', title: '接种香菇 215', description: '接种 15000 棒，接种后 24 小时内温度不超过 28℃', operator: '技术员 周敏' },
  { day: -61, type: '菌棒养菌', title: '发菌管理', description: '恒温 23℃ 避光培养，定期检查菌丝长势', operator: '技术员 周敏' },
  { day: -20, type: '转色催蕾', title: '转色催蕾', description: '菌棒转色完成，降温至 18℃ 并加大昼夜温差', operator: '王建国' },
  { day: -12, type: '出菇管理', title: '第二潮菇出菇', description: '菇蕾密度均匀，开始每日环境巡检', operator: '王建国' }
]);

seedTrace(batch3, [
  { day: -45, type: '拌料装袋', title: '平菇制棒', description: '棉籽壳 60%、玉米芯 30%，装袋 9000 棒', operator: '李红梅' },
  { day: -10, type: '转色催蕾', title: '催蕾管理', description: '拉大温差至 10℃，湿度保持 88% 左右', operator: '李红梅' }
]);

function ensureProduct(row) {
  const found = db.prepare('SELECT * FROM products WHERE user_id = ? AND name = ?').get(uid, row.name);
  if (found) return found;
  const info = db
    .prepare(
      `INSERT INTO products (batch_id, name, icon, quantity, unit, price, available_date, off_shelf_date, status, description, user_id)
       VALUES (?, ?, '', ?, ?, ?, ?, '', 'available', ?, ?)`
    )
    .run(row.batchId, row.name, row.quantity, row.unit, row.price, row.availableDate, row.description, uid);
  return db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
}

const product1 = ensureProduct({
  batchId: batch1.id,
  name: '鲜香菇（一级）',
  quantity: 1000,
  unit: 'kg',
  price: 13.6,
  availableDate: dayText(-2),
  description: '菌盖 3–5cm，当日采收、冷链直发，附批次溯源二维码'
});
ensureProduct({
  batchId: batch3.id,
  name: '平菇（黑平王）',
  quantity: 800,
  unit: 'kg',
  price: 7.8,
  availableDate: dayText(-1),
  description: '合作社统一分级，适合商超与餐饮渠道'
});
ensureProduct({
  batchId: batch5.id,
  name: '羊肚菌（鲜品）',
  quantity: 120,
  unit: 'kg',
  price: 168,
  availableDate: dayText(30),
  description: '林下仿野生栽培，首批限量 120kg，支持预订'
});

function ensureDemand(row) {
  const found = db.prepare('SELECT * FROM demands WHERE user_id = ? AND buyer_name = ? AND product_name = ?').get(uid, row.buyer, row.product);
  if (found) return;
  db.prepare(
    `INSERT INTO demands (buyer_name, product_name, quantity, unit, price, requirements, contact, status, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`
  ).run(row.buyer, row.product, row.quantity, row.unit, row.price, row.requirements, row.contact, uid);
}
ensureDemand({
  buyer: '南昌旺旺生鲜采购部',
  product: '鲜香菇',
  quantity: 2000,
  unit: 'kg',
  price: 13.9,
  requirements: '要求可溯源，菌盖 3–5cm，每周二、五到货',
  contact: '0791-86002288'
});
ensureDemand({
  buyer: '九江浔阳餐饮供应链',
  product: '平菇',
  quantity: 800,
  unit: 'kg',
  price: 8.2,
  requirements: '每日凌晨 4 点前送达，全程冷链',
  contact: '0792-8220366'
});

function ensureTask(row) {
  if (db.prepare('SELECT 1 FROM tasks WHERE user_id = ? AND title = ?').get(uid, row.title)) return;
  db.prepare(
    `INSERT INTO tasks (title, description, batch_id, priority, due_date, status, user_id)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`
  ).run(row.title, row.description, row.batchId, row.priority, row.dueDate, uid);
}
ensureTask({
  title: '1号棚第二潮菇采收',
  description: '预计采收 600kg，安排 6 名工人，采后及时预冷',
  batchId: batch2.id,
  priority: 'high',
  dueDate: dayText(0)
});
ensureTask({
  title: '2号棚通风降 CO₂',
  description: '目标降至 800ppm 以下，连续观察 2 小时',
  batchId: batch3.id,
  priority: 'high',
  dueDate: dayText(-1)
});
ensureTask({
  title: '羊肚菌接种后温湿度巡检',
  description: '检查营养袋污染情况，记录 9:00 与 18:00 温湿度',
  batchId: batch5.id,
  priority: 'medium',
  dueDate: dayText(1)
});
ensureTask({
  title: '3号棚菌棒翻堆',
  description: '翻堆散热，挑出污染棒并单独隔离',
  batchId: batch4.id,
  priority: 'low',
  dueDate: dayText(3)
});

function ensureQuestion(row) {
  if (db.prepare('SELECT 1 FROM expert_questions WHERE user_id = ? AND title = ?').get(uid, row.title)) return;
  db.prepare(
    `INSERT INTO expert_questions (base_id, title, content, category, answer, status, answered_at, user_id, answer_source, ai_model)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')`
  ).run(row.baseId, row.title, row.content, row.category, row.answer, row.status, row.answeredAt, uid, row.source);
}
ensureQuestion({
  baseId: base1.id,
  title: '出菇期棚内湿度忽高忽低怎么办？',
  content: '白天开棚通风后湿度掉到 80%，晚上又升到 96%，香菇菌盖边缘有点干。',
  category: '环境调控',
  answer:
    '先找波动来源：把通风集中在早晚各 20–30 分钟，避开中午干燥时段；走道洒水或挂湿帘，不要直接向菌棒喷水；湿度低于 85% 时用雾化加湿，高于 95% 立即通风。连续记录每天 8:00、14:00、20:00 的温湿度，3 天就能判断是通风还是加湿器控制问题。',
  status: 'answered',
  answeredAt: new Date().toISOString(),
  source: 'rule'
});
ensureQuestion({
  baseId: base2.id,
  title: '菌棒表面出现少量绿霉是否需要整批淘汰？',
  content: '平菇菌棒有两三棒表面长出绿色霉斑，其他菌棒看起来正常。',
  category: '病虫害',
  answer:
    '不需要整批淘汰。先把感染棒单独移出，用 5% 石灰水或专用杀菌剂处理感染面，操作后洗手再碰健康棒；同时把棚内湿度降到 85% 左右并加强通风。如果 3 天内感染棒超过 5%，再整批隔离并请当地农技员现场取样。',
  status: 'answered',
  answeredAt: new Date().toISOString(),
  source: 'rule'
});
ensureQuestion({
  baseId: base3.id,
  title: '羊肚菌原基分化期要不要补光？',
  content: '林下棚白天散射光只有 120lux 左右，需要额外补光吗？',
  category: '栽培管理',
  answer: '',
  status: 'pending',
  answeredAt: '',
  source: ''
});

function ensureOrder(row) {
  if (db.prepare('SELECT 1 FROM orders WHERE order_no = ?').get(row.orderNo)) return;
  db.prepare(
    `INSERT INTO orders (
       order_no, product_id, product_name, product_icon, unit, price, quantity, amount,
       batch_id, batch_code, base_name, seller_id, seller_name, buyer_id, buyer_name,
       buyer_contact, address, remark, status, pay_method, pay_time, ship_time, receive_time, created_at, updated_at
     ) VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.orderNo,
    row.product.id,
    row.product.name,
    row.product.unit,
    row.product.price,
    row.quantity,
    Math.round(row.product.price * row.quantity * 100) / 100,
    row.product.batch_id,
    row.batchCode,
    row.baseName,
    uid,
    demo.display_name,
    buyer.id,
    buyer.display_name,
    row.contact,
    row.address,
    row.remark,
    row.status,
    row.payMethod,
    row.payTime,
    row.shipTime,
    row.receiveTime,
    row.createdAt,
    row.updatedAt
  );
}

ensureOrder({
  orderNo: 'GS-DEMO-20261112-01',
  product: product1,
  quantity: 200,
  batchCode: batch1.code,
  baseName: base1.name,
  contact: '0791-86002288',
  address: '南昌市西湖区八一大道 88 号 旺旺生鲜配送中心',
  remark: '周五一早到货，需要随车附溯源二维码',
  status: 'paid',
  payMethod: 'online',
  payTime: isoAt(1, 10),
  shipTime: '',
  receiveTime: '',
  createdAt: isoAt(1, 9),
  updatedAt: isoAt(1, 10)
});

const product2 = db.prepare('SELECT * FROM products WHERE user_id = ? AND name = ?').get(uid, '平菇（黑平王）');
if (product2) {
  ensureOrder({
    orderNo: 'GS-DEMO-20261106-02',
    product: product2,
    quantity: 100,
    batchCode: batch3.code,
    baseName: base2.name,
    contact: '0792-8220366',
    address: '九江市浔阳区滨江路 16 号 浔阳餐饮中央厨房',
    remark: '',
    status: 'received',
    payMethod: 'online',
    payTime: isoAt(7, 11),
    shipTime: isoAt(6, 8),
    receiveTime: isoAt(5, 15),
    createdAt: isoAt(7, 10),
    updatedAt: isoAt(5, 15)
  });
}

console.log(`已写入大赛演示数据：${readingCount} 条环境记录，3 个基地，5 个批次，2 条预警，2 笔订单。`);
console.log(`演示账号：${DEMO.username} / ${DEMO.password}（平台管理员）`);
console.log(`采购商账号：${BUYER.username} / ${BUYER.password}`);
console.log(`公开溯源样例：/trace.html?code=${batch1.code}`);
