/* 田序 · 离线演示数据层
 * 面向 Qoder Sites 静态托管：拦截 /api/* 请求，用真实后台导出的演示数据应答。
 * 只用于公开演示，不包含真实个人信息。 */
(function () {
  'use strict';

  var F = window.__TX_FIXTURES__ || { responses: {}, trace: {}, aiAnswers: {} };
  var clone = function (x) { return JSON.parse(JSON.stringify(x)); };
  var pick = function (key, fallback) {
    var r = F.responses[key];
    return clone(r && r.data !== undefined ? r.data : fallback);
  };

  var DATA = {
    dashboard: pick('/api/dashboard', {}),
    bases: pick('/api/bases', []),
    batches: pick('/api/batches?limit=60', []),
    devices: pick('/api/devices', []),
    readings: pick('/api/readings?limit=100', []),
    alerts: pick('/api/alerts?limit=100', []),
    questions: pick('/api/questions', []),
    products: pick('/api/products', []),
    demands: pick('/api/demands', []),
    tasks: pick('/api/tasks?limit=60', []),
    orders: pick('/api/orders?limit=60', []),
    partners: pick('/api/partners', []),
    traceEvents: pick('/api/trace-events', [])
  };

  var ADMIN_USER = pick('/api/auth/me', {
    id: 4, username: 'demo', display_name: '林青', role: 'admin',
    role_label: '平台管理员', created_at: '2026-09-15 15:56:25', permissions: '*'
  });
  var BUYER_USER = {
    id: 128, username: 'demo_buyer', display_name: '演示采购商', role: 'buyer',
    role_label: '采购商', created_at: '2026-11-17 04:25:07',
    permissions: { bases: 'r', batches: 'r', readings: 'r', alerts: 'r', 'trace-events': 'r', questions: 'rw', products: 'r', demands: 'rw', tasks: 'r', partners: 'r', devices: 'r', dashboard: 'r', uploads: 'w', ai: 'r', orders: 'rw' }
  };
  var FARMER_USER = {
    id: 900, username: 'demo_farmer', display_name: '演示菇农', role: 'farmer',
    role_label: '菇农', created_at: '2026-11-17 12:00:00',
    permissions: { bases: 'rw', batches: 'rw', readings: 'rw', alerts: 'rw', 'trace-events': 'rw', questions: 'rw', products: 'rw', demands: 'r', tasks: 'rw', partners: 'rw', devices: 'rw', dashboard: 'r', uploads: 'w', ai: 'r', orders: 'rw' }
  };
  var TOKENS = {
    'demo-token-admin': ADMIN_USER,
    'demo-token-buyer': BUYER_USER,
    'demo-token-farmer': FARMER_USER
  };
  var ACCOUNTS = {
    demo: { password: 'demo123456', role: 'admin', token: 'demo-token-admin' },
    demo_buyer: { password: 'demo123456', role: 'buyer', token: 'demo-token-buyer' }
  };

  var CAPTCHA_STORE = {};
  var CAPTCHA_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  function issueCaptcha() {
    var code = '';
    for (var i = 0; i < 4; i++) code += CAPTCHA_CHARS.charAt(Math.floor(Math.random() * CAPTCHA_CHARS.length));
    var id = 'demo-captcha-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
    CAPTCHA_STORE[id] = { code: code, expires: Date.now() + 5 * 60 * 1000 };
    return { id: id, code: code };
  }
  function checkCaptcha(id, code) {
    var record = CAPTCHA_STORE[id];
    if (!record || record.expires < Date.now()) return false;
    var passed = String(record.code).toUpperCase() === String(code || '').trim().toUpperCase();
    delete CAPTCHA_STORE[id];
    return passed;
  }
  var aiCounter = 100;

  var KNOWLEDGE = [
    { title: '温度偏高', keywords: ['温度高', '高温', '太热', '发烫', '闷', '烧菌'], advice: ['可能原因：通风不足、棚膜透光过强、菌棒堆码过密、外界气温骤升。', '处置：加大早晚通风（避开正午），加盖遮阳网或喷淋降温，把料温控制在 22–26℃；', '堆码适当疏散，发菌期单层摆放，避免菌棒自身发热叠加上升；', '若已出现菌丝停止生长或菌棒变软，及时隔离观察，防止烧菌扩散。'] },
    { title: '温度偏低', keywords: ['温度低', '低温', '太冷', '冻'], advice: ['处置：夜间加盖草帘或保温膜，减少冷风直吹，出菇期尽量维持 12–18℃；', '出菇期温差可适当利用，但避免长时间低于 5℃，否则菇蕾易死亡、菌盖畸形。'] },
    { title: '湿度不足', keywords: ['湿度低', '干燥', '干', '缺水', '喷水'], advice: ['处置：提高空气相对湿度到 85%–90%，采取少量多次喷雾，避免直接向菇体大量喷水；', '地面洒水或悬挂湿帘保湿，同时保持通风，防止高湿又闷棚引发杂菌。', '采摘前 4–6 小时停止喷水，可降低菇体含水量、延长保鲜期。'] },
    { title: 'CO₂ 偏高 / 通风', keywords: ['co2', '二氧化碳', '通风', '缺氧', '闷棚', '菇柄长'], advice: ['CO₂ 偏高典型表现：菇柄细长、菌盖小而薄（长腿菇），说明通风不足。', '处置：加大通风次数与时长，保持 CO₂ 在 800 ppm 以下（出菇期建议 600 ppm 以内）；', '通风与保温、保湿需要平衡，建议在温度较高的时段换气，避免温差过大。'] },
    { title: '杂菌污染（绿霉、木霉等）', keywords: ['绿霉', '木霉', '杂菌', '污染', '霉菌', '发绿', '黑斑', '酸臭'], advice: ['处置：立即将污染菌棒单独隔离并移出菇房，避免孢子扩散；', '局部轻微污染可挖除污染部位并撒石灰粉覆盖，严重污染整棒销毁，不得留用；', '检查灭菌是否彻底、接种是否无菌操作、环境湿度是否长期偏高；', '同一批次连续出现污染时，暂停该区域生产，对菇房做一次彻底消毒（如甲醛或过氧乙酸，按说明使用并充分通风）。'] },
    { title: '虫害（菇蚊、菇蝇、螨类）', keywords: ['虫', '蚊', '蝇', '螨', '幼虫', '蛀'], advice: ['处置：悬挂黄板或诱虫灯诱杀成虫，菇房门窗加装防虫网；', '清理菇根、废料和腐烂菌棒，切断滋生源；', '虫害严重时按登记农药与推荐剂量使用，严格遵守安全间隔期，采菇前禁止用药，必要时咨询当地植保部门。'] },
    { title: '菌棒不发菌 / 生长慢', keywords: ['不发菌', '菌丝', '长势慢', '不吃料', '稀疏', '发菌'], advice: ['排查：料温是否低于 20℃ 或高于 28℃、含水量是否合适（一般 60%–65%）、接种是否成活；', '处置：把环境调到菌丝最适 22–26℃，适当翻堆通气，及时挑出已污染的菌棒；', '接种后 7–10 天菌丝仍无明显扩展时，说明菌种活力或灭菌环节可能存在问题，建议补接或更换菌种。'] },
    { title: '转色 / 催蕾 / 出菇管理', keywords: ['转色', '催蕾', '出菇', '菇蕾', '畸形', '不开伞', '采收'], advice: ['转色期保持 18–22℃、空气湿度 85% 左右并加强通风，见光散射光即可；', '催蕾可通过降温 8–10℃ 的温差刺激配合适度干湿交替；', '采收掌握在菌盖尚未完全展开、边缘略微内卷时进行，采后及时补水养菌，7–15 天可出下一潮菇。'] },
    { title: '叶菜发黄 / 长势弱', keywords: ['发黄', '黄叶', '黄化', '缺素', '长势弱', '叶片'], advice: ['先分清部位：老叶先黄多为缺氮或根系吸收受阻，新叶先黄多为缺铁、缺镁；', '排查：土壤或基质是否积水沤根（湿度长期高于 85% 时最先怀疑）、pH 是否偏离 5.5–7.0、近期是否施过未腐熟有机肥；', '处置：先控水通风，再按缺素类型叶面补肥，7 天后复查新叶；', '连片发黄并伴随萎蔫时，挖取病株检查根系，排除根腐病与线虫。'] },
    { title: '水果裂果 / 日灼 / 转色差', keywords: ['裂果', '日灼', '转色', '上色', '糖度', '果实'], advice: ['裂果多由成熟期土壤水分骤变引起：保持均匀供水，雨后及时排水，避免久旱后大水漫灌；', '日灼出现在向阳面：保留适量叶幕遮阴，高温时段喷淋降温，果实套袋可显著减轻；', '转色差先看光照与昼夜温差（大于 10℃ 更利于上色），再控制氮肥、适当补钾；', '成熟期适度控水有利于提高糖度，但不要控到叶片萎蔫。'] }
  ];

  function knowledgeAnswer(question) {
    var value = String(question || '').toLowerCase();
    var matched = KNOWLEDGE.filter(function (item) {
      return item.keywords.some(function (k) { return value.indexOf(String(k).toLowerCase()) >= 0; });
    });
    if (!matched.length) {
      return {
        answer: ['【规则知识库】没有匹配到对应条目，暂时无法给出可靠建议。', '请补充以下信息后重试，或等待专家人工回复：', '1. 菌种与当前生长阶段（发菌/转色/催蕾/出菇）；', '2. 最近的温度、湿度、CO₂ 数值；', '3. 症状出现的部位、时间与变化速度，最好附照片。'].join('\n'),
        matched: []
      };
    }
    var lines = ['【规则知识库答复，非 AI 生成】'];
    matched.forEach(function (item) { lines.push('· ' + item.title); });
    matched.forEach(function (item) {
      item.advice.forEach(function (line) { lines.push('  - ' + line); });
    });
    return { answer: lines.join('\n'), matched: matched.map(function (i) { return i.title; }) };
  }

  function rulePriority(title, dueDate) {
    var value = (String(title || '') + ' ' + String(dueDate || '')).toLowerCase();
    var now = new Date();
    var due = dueDate ? new Date(dueDate) : null;
    var days = due && !isNaN(due.getTime()) ? Math.ceil((due.setHours(23, 59, 59, 999) - now.getTime()) / 86400000) : null;
    if (/紧急|立即|马上|故障|报警|抢救|污染/.test(value) || (days !== null && days <= 1)) return { priority: 'high', reason: '任务含紧急关键词或将在 1 天内到期' };
    if (days !== null && days <= 3) return { priority: 'medium', reason: '任务将在 3 天内到期' };
    return { priority: 'low', reason: '未发现紧急关键词，截止日期较充足' };
  }

  function nowText() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function nextId(list) {
    return list.reduce(function (max, item) { return Math.max(max, Number(item.id) || 0); }, 0) + 1;
  }

  function ok(data, message) { return { status: 200, json: { code: 0, message: message || 'success', data: data === undefined ? null : data } }; }
  function fail(code, message) { return { status: 200, json: { code: code, message: message, data: null } }; }
  function unauthorized() { return { status: 401, json: { code: 401, message: '请先登录账号', data: null } }; }

  function readToken(headers) {
    try {
      var auth = headers && (headers.Authorization || headers.authorization);
      if (auth && String(auth).indexOf('Bearer ') === 0) return String(auth).slice(7);
      var raw = localStorage.getItem('gushi_token');
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && 'data' in parsed) return String(parsed.data || '');
        return String(parsed || '');
      }
    } catch (e) { /* ignore */ }
    return '';
  }

  function userOf(token) { return TOKENS[token] || null; }

  var SERIES_CACHE = {};
  function emptySeries(deviceId) {
    var device = DATA.devices.filter(function (d) { return String(d.id) === String(deviceId); })[0] || null;
    var buckets = [];
    var now = Date.now();
    for (var i = 11; i >= 0; i--) {
      buckets.push({ start: new Date(now - (i + 1) * 7200000).toISOString(), end: new Date(now - i * 7200000).toISOString(), count: 0, temperature: null, humidity: null, co2: null, light: null });
    }
    return { device: device ? { id: device.id, code: device.code, name: device.name, base_id: device.base_id } : { id: Number(deviceId), code: '', name: '', base_id: null }, hours: 24, bucket_minutes: 120, total_records: 0, buckets: buckets };
  }

  var LIST_RESOURCES = { bases: 'bases', batches: 'batches', devices: 'devices', products: 'products', demands: 'demands', tasks: 'tasks', questions: 'questions', orders: 'orders', partners: 'partners', 'trace-events': 'traceEvents', alerts: 'alerts', readings: 'readings' };

  function listOf(resource) {
    if (resource === 'dashboard') return null;
    var key = LIST_RESOURCES[resource];
    return key ? DATA[key] : null;
  }

  async function handleApi(method, path, query, headers, bodyText) {
    var token = readToken(headers);
    var user = userOf(token);
    var json = {};
    try { json = bodyText ? JSON.parse(bodyText) : {}; } catch (e) { json = {}; }

    /* ---------- auth ---------- */
    if (path === '/api/auth/captcha' && method === 'GET') {
      var challenge = issueCaptcha();
      var tilt = (Math.random() * 6 - 3).toFixed(1);
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="44" viewBox="0 0 120 44" role="img" aria-label="图形验证码">' +
        '<rect width="120" height="44" rx="8" fill="#f3f7f4"/>' +
        '<path d="M2 31 Q78 26 118 23" stroke="#b9cdc1" stroke-width="1.4" fill="none" opacity="0.75"/>' +
        '<path d="M2 13 Q60 27 118 26" stroke="#b9cdc1" stroke-width="1.4" fill="none" opacity="0.75"/>' +
        '<text x="22" y="31" transform="rotate(' + tilt + ' 60 22)" font-family="Georgia, serif" font-size="24" fill="#244e3b" letter-spacing="6">' + challenge.code + '</text></svg>';
      return ok({ id: challenge.id, svg: svg, expiresIn: 300 });
    }
    if (path === '/api/auth/login' && method === 'POST') {
      if (json.captcha_id && !checkCaptcha(json.captcha_id, json.captcha)) {
        return fail(2, '验证码错误或已过期，请重新输入');
      }
      var account = ACCOUNTS[json.username];
      if (!account || account.password !== json.password) {
        return fail(1, '账号或密码不正确（演示账号 demo / demo123456，采购商 demo_buyer / demo123456）');
      }
      var loginUser = TOKENS[account.token];
      return ok({ user: loginUser, token: account.token, expires_at: new Date(Date.now() + 7 * 86400000).toISOString() }, '登录成功');
    }
    if (path === '/api/auth/register' && method === 'POST') {
      if (json.captcha_id && !checkCaptcha(json.captcha_id, json.captcha)) {
        return fail(2, '验证码错误或已过期，请重新输入');
      }
      return ok({ user: FARMER_USER, token: 'demo-token-farmer', expires_at: new Date(Date.now() + 7 * 86400000).toISOString() }, '注册成功');
    }
    if (path === '/api/auth/me' && method === 'GET') {
      return user ? ok(user) : unauthorized();
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      return ok(null, '已退出登录');
    }

    /* 公开溯源：扫码即看，无需登录（与后台 /api/trace/:code 一致） */
    var publicTraceMatch = path.match(/^\/api\/trace\/(.+)$/);
    if (publicTraceMatch && method === 'GET') {
      var publicTraceCode = decodeURIComponent(publicTraceMatch[1]);
      var publicTraceHit = F.trace && F.trace[publicTraceCode];
      if (publicTraceHit && publicTraceHit.code === 0) return { status: 200, json: publicTraceHit };
      return { status: 200, json: { code: 404, message: '未找到该批次', data: null } };
    }

    /* 其余接口都要求登录 */
    if (!user) return unauthorized();

    /* ---------- AI ---------- */
    if (path === '/api/ai/status' && method === 'GET') {
      return ok({ provider: 'qoder', label: 'Qoder', mode: 'offline', model: 'qwen3-max', baseUrl: 'https://api.qoder.com/v1', configured: false, knowledge_entries: KNOWLEDGE.length, note: '演示模式：内置离线规则知识库' });
    }
    if (path === '/api/ai/ask' && method === 'POST') {
      var question = String(json.question || '').trim();
      if (question.length < 4) return fail(400, '问题描述太短，请至少输入 4 个字');
      var result = knowledgeAnswer(question);
      var saved = null;
      if (json.save) {
        saved = {
          id: nextId(DATA.questions),
          base_id: json.base_id || null,
          title: String(json.title || question.slice(0, 30)),
          content: question,
          category: String(json.category || 'AI 问答'),
          answer: result.answer,
          status: 'answered',
          created_at: nowText(),
          answered_at: new Date().toISOString(),
          user_id: user.id,
          answer_source: 'rule',
          ai_model: '',
          owner_name: user.display_name || user.username,
          owner_username: user.username,
          is_mine: true
        };
        DATA.questions.unshift(saved);
      }
      return {
        status: 200,
        json: {
          code: 0, message: '已给出规则知识库答复',
          data: { answer: result.answer, source: 'rule', provider: 'offline', model: '', matched: result.matched, context_summary: '', fallback_reason: '演示模式：未接入在线大模型', question_id: saved ? saved.id : ++aiCounter }
        }
      };
    }
    if (path === '/api/ai/suggest-priority' && method === 'POST') {
      if (!json.title) return fail(400, 'title 必填');
      var priority = rulePriority(json.title, json.due_date);
      return ok({ priority: priority.priority, reason: priority.reason, source: 'rule' });
    }

    /* ---------- dashboard ---------- */
    if (path === '/api/dashboard' && method === 'GET') {
      var dash = clone(DATA.dashboard);
      dash.user = user;
      dash.bases = DATA.bases.length;
      dash.batches = DATA.batches.length;
      dash.devices = DATA.devices.length;
      dash.products = DATA.products.length;
      dash.demands = DATA.demands.length;
      dash.questions = DATA.questions.length;
      dash.openAlerts = DATA.alerts.filter(function (a) { return a.status === 'open'; }).length;
      dash.alerts = DATA.alerts.slice(0, 5);
      dash.latestQuestions = DATA.questions.slice(0, 3);
      dash.latestReadings = DATA.readings.slice(0, 5);
      return ok(dash);
    }

    /* ---------- device series ---------- */
    var seriesMatch = path.match(/^\/api\/devices\/(\d+)\/series$/);
    if (seriesMatch && method === 'GET') {
      var key = null;
      Object.keys(F.responses).some(function (k) {
        if (k.indexOf('/api/devices/' + seriesMatch[1] + '/series') === 0) { key = k; return true; }
        return false;
      });
      if (key) return { status: 200, json: F.responses[key] };
      if (!SERIES_CACHE[seriesMatch[1]]) SERIES_CACHE[seriesMatch[1]] = emptySeries(seriesMatch[1]);
      return ok(SERIES_CACHE[seriesMatch[1]]);
    }

    /* ---------- device secret ---------- */
    var secretMatch = path.match(/^\/api\/devices\/(\d+)\/secret$/);
    if (secretMatch && method === 'GET') {
      return ok({ secret: 'demo-mqtt-secret', mqtt_url: 'mqtt://127.0.0.1:1883', topic_prefix: 'gushi' }, '演示模式：密钥为模拟值');
    }

    /* ---------- alerts ack ---------- */
    var ackMatch = path.match(/^\/api\/alerts\/(\d+)\/ack$/);
    if (ackMatch && method === 'POST') {
      var alert = DATA.alerts.filter(function (a) { return String(a.id) === ackMatch[1]; })[0];
      if (!alert) return fail(404, '预警不存在');
      alert.status = 'handled';
      alert.handled_at = new Date().toISOString();
      return ok(alert, '已处理');
    }

    /* ---------- orders actions ---------- */
    var orderAction = path.match(/^\/api\/orders\/(\d+)\/(pay|ship|receive|cancel)$/);
    if (orderAction && method === 'POST') {
      var order = DATA.orders.filter(function (o) { return String(o.id) === orderAction[1]; })[0];
      if (!order) return fail(404, '订单不存在');
      var action = orderAction[2];
      var transitions = {
        pay: { from: ['created'], to: 'paid', text: '支付成功' },
        ship: { from: ['paid'], to: 'shipped', text: '已发货' },
        receive: { from: ['shipped'], to: 'received', text: '已确认收货' },
        cancel: { from: ['created', 'paid'], to: 'cancelled', text: '订单已取消' }
      };
      var rule = transitions[action];
      if (!rule || rule.from.indexOf(order.status) < 0) return fail(400, '当前订单状态不支持该操作');
      order.status = rule.to;
      order.updated_at = nowText();
      return ok(order, rule.text);
    }

    /* ---------- uploads ---------- */
    if (path === '/api/uploads' && method === 'POST') {
      if (json && json.file && typeof json.file === 'string' && json.file.indexOf('data:') === 0) {
        return ok({ url: json.file });
      }
      return ok({ url: './logo-mark.png' }, '演示模式：已模拟上传');
    }

    /* ---------- list & detail ---------- */
    var segments = path.replace(/^\/api\//, '').split('/');
    var resource = segments[0];
    var resourceId = segments[1];

    if (path === '/api/products/shared' && method === 'GET') return { status: 200, json: F.responses['/api/products/shared'] || ok(DATA.products) };
    if (path === '/api/demands/shared' && method === 'GET') return { status: 200, json: F.responses['/api/demands/shared'] || ok(DATA.demands) };

    var list = listOf(resource);
    if (list) {
      if (method === 'GET' && !resourceId) {
        var out = list.slice();
        var limit = Number(query.limit);
        if (limit > 0) out = out.slice(0, limit);
        return ok(out);
      }
      if (method === 'GET' && resourceId) {
        var item = list.filter(function (x) { return String(x.id) === String(resourceId); })[0];
        return item ? ok(item) : fail(404, '记录不存在');
      }
      if (method === 'POST' && !resourceId) {
        var created = Object.assign({}, json, { id: nextId(list), created_at: nowText(), updated_at: nowText(), user_id: user.id });
        list.unshift(created);
        if (resource === 'questions') { created.status = created.status || 'pending'; created.answer = created.answer || ''; }
        if (resource === 'tasks') { created.status = created.status || 'pending'; }
        return ok(created, '保存成功');
      }
      if (method === 'PUT' && resourceId) {
        var target = list.filter(function (x) { return String(x.id) === String(resourceId); })[0];
        if (!target) return fail(404, '记录不存在');
        Object.assign(target, json, { updated_at: nowText() });
        if (resource === 'questions' && json.answer) {
          target.status = 'answered';
          target.answered_at = new Date().toISOString();
          target.answer_source = 'expert';
        }
        return ok(target, '已保存');
      }
      if (method === 'DELETE' && resourceId) {
        var idx = -1;
        for (var i = 0; i < list.length; i++) { if (String(list[i].id) === String(resourceId)) { idx = i; break; } }
        if (idx < 0) return fail(404, '记录不存在');
        list.splice(idx, 1);
        return ok({ id: Number(resourceId) }, '已删除');
      }
    }

    if (path === '/api/ingest/readings' && method === 'POST') {
      return ok({ inserted: Array.isArray(json.readings) ? json.readings.length : 1 }, '已模拟写入演示数据');
    }

    return { status: 200, json: { code: 0, message: '演示模式：操作已模拟，不会写入真实数据', data: json && Object.keys(json).length ? json : null } };
  }

  function normalizeUrl(url) {
    try {
      var u = new URL(typeof url === 'string' ? url : url.url, location.href);
      return u;
    } catch (e) {
      return null;
    }
  }

  function isApi(u) {
    if (!u) return false;
    var sameOrigin = u.origin === location.origin;
    return sameOrigin && u.pathname.indexOf('/api/') === 0;
  }

  function parseQuery(u) {
    var q = {};
    u.searchParams.forEach(function (v, k) { q[k] = v; });
    return q;
  }

  /* ---------- patch fetch ---------- */
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      var u = normalizeUrl(input);
      if (!isApi(u)) return origFetch.apply(this, arguments);
      init = init || {};
      var method = String(init.method || (input && input.method) || 'GET').toUpperCase();
      var headers = {};
      try {
        if (init.headers) {
          if (typeof init.headers.forEach === 'function' && typeof init.headers.get === 'function') {
            init.headers.forEach(function (v, k) { headers[k] = v; });
          } else {
            Object.keys(init.headers).forEach(function (k) { headers[k] = init.headers[k]; });
          }
        } else if (input && input.headers && typeof input.headers.forEach === 'function') {
          input.headers.forEach(function (v, k) { headers[k] = v; });
        }
      } catch (e) { /* ignore */ }
      var bodyPromise = Promise.resolve(init.body || null);
      return bodyPromise.then(function (body) {
        var bodyText = null;
        if (typeof body === 'string') bodyText = body;
        else if (body && typeof body === 'object' && !(typeof FormData !== 'undefined' && body instanceof FormData)) {
          try { bodyText = JSON.stringify(body); } catch (e) { bodyText = null; }
        }
        return handleApi(method, u.pathname, parseQuery(u), headers, bodyText);
      }).then(function (result) {
        return new Response(JSON.stringify(result.json), { status: result.status, headers: { 'Content-Type': 'application/json' } });
      });
    };
  }

  /* ---------- patch XMLHttpRequest (Taro 的底层实现会走这里) ---------- */
  var OrigXHR = window.XMLHttpRequest;
  if (OrigXHR) {
    var open = OrigXHR.prototype.open;
    var send = OrigXHR.prototype.send;
    var setHeader = OrigXHR.prototype.setRequestHeader;

    OrigXHR.prototype.open = function (method, url) {
      this.__mockMethod = String(method || 'GET').toUpperCase();
      this.__mockUrl = normalizeUrl(url);
      this.__mockHeaders = {};
      this.__mock = isApi(this.__mockUrl);
      return open.apply(this, arguments);
    };
    OrigXHR.prototype.setRequestHeader = function (k, v) {
      if (this.__mock) this.__mockHeaders[k] = v;
      return setHeader.apply(this, arguments);
    };
    OrigXHR.prototype.send = function (body) {
      var self = this;
      if (!self.__mock) return send.apply(this, arguments);
      var u = self.__mockUrl;
      var bodyText = typeof body === 'string' ? body : null;
      handleApi(self.__mockMethod, u.pathname, parseQuery(u), self.__mockHeaders, bodyText).then(function (result) {
        var text = JSON.stringify(result.json);
        Object.defineProperty(self, 'readyState', { value: 4, configurable: true });
        Object.defineProperty(self, 'status', { value: result.status, configurable: true });
        Object.defineProperty(self, 'statusText', { value: 'OK', configurable: true });
        Object.defineProperty(self, 'responseText', { value: text, configurable: true });
        Object.defineProperty(self, 'response', { value: text, configurable: true });
        self.getResponseHeader = function (name) { return String(name).toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : null; };
        self.getAllResponseHeaders = function () { return 'content-type: application/json; charset=utf-8\r\n'; };
        try { if (self.onreadystatechange) self.onreadystatechange(); } catch (e) { /* ignore */ }
        try { if (self.onload) self.onload(); } catch (e) { /* ignore */ }
        try { self.dispatchEvent(new Event('load')); } catch (e) { /* ignore */ }
      });
    };
  }

  /* ---------- 登录页：点击「先看看田序能做什么」直接进入演示 ---------- */
  function enterDemo(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    }
    try {
      localStorage.setItem('gushi_token', JSON.stringify({ data: 'demo-token-admin' }));
      localStorage.setItem('gushi_user', JSON.stringify({ data: ADMIN_USER }));
    } catch (err) { /* ignore */ }
    location.hash = '#/pages/home/index';
    setTimeout(function () { location.reload(); }, 30);
  }

  document.addEventListener('click', function (e) {
    var node = e.target;
    while (node && node !== document.body) {
      var cls = node.className && typeof node.className === 'string' ? node.className : '';
      if (cls.indexOf('login-demo') >= 0 && cls.indexOf('login-demo-') < 0) {
        enterDemo(e);
        return;
      }
      node = node.parentNode;
    }
  }, true);

  window.__TX_DEMO_MODE__ = true;
})();
