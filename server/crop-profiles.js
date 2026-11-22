/**
 * 品类档案：不同作物的环境要求不一样，这里把 8 个种植大类的
 * 参考区间与阶段要点集中成一份配置，供三处使用：
 *   1) GET /api/crops —— 前端在监测页显示「参考区间（当前品类）」；
 *   2) 新建批次时选品类，带出该品类的物候阶段与注意事项；
 *   3) AI 问答的上下文里带上品类标准，回答不再只按食用菌给数值。
 *
 * 阈值口径与 devices 表一致：温度上限、湿度下限、CO₂ 上限。
 * 设备级阈值（devices.temp_max / humidity_min / co2_max）优先级更高，
 * 因为它代表这个大棚实际执行的标准；品类档案是「默认参考值」。
 * 修改本文件后，请同步 gushi-miniapp/src/config/crops.ts（前端离线兜底用同一组数值）。
 */

const CROP_PROFILES = [
  {
    key: 'mushroom',
    label: '食用菌',
    summary: '菇房/菌棒栽培，前期控温养菌，后期靠温差与湿度催蕾，通风决定菌盖形态。',
    tempMin: 20,
    tempMax: 26,
    humidityMin: 80,
    humidityMax: 95,
    co2Max: 800,
    stageHints: ['育苗期 = 接种/制棒', '生长期 = 养菌', '成熟期 = 催蕾/出菇', '采收期 = 采摘'],
    tips: ['催蕾期用 8–10℃ 温差刺激原基分化', 'CO₂ 长期偏高会出现柄长盖小的「长腿菇」', '采后及时补水养菌，7–15 天可出下一潮菇']
  },
  {
    key: 'vegetable',
    label: '蔬菜',
    summary: '叶菜、瓜果、根茎类差异大，但都以「白天通风降温、夜间保温控湿」为主线。',
    tempMin: 15,
    tempMax: 28,
    humidityMin: 55,
    humidityMax: 85,
    co2Max: 1000,
    stageHints: ['育苗期 = 播种/移栽', '生长期 = 水肥管理', '成熟期 = 开花坐果', '采收期 = 分批采收'],
    tips: ['湿度长期高于 85% 易发霜霉、灰霉，优先通风而不是加温', '叶菜缺氮先黄老叶，缺铁先黄新叶', '瓜果类坐果期夜温高于 22℃ 容易落花']
  },
  {
    key: 'fruit',
    label: '水果',
    summary: '果树与浆果以光照、昼夜温差和水分管理为主，成熟期控水提糖。',
    tempMin: 15,
    tempMax: 30,
    humidityMin: 50,
    humidityMax: 80,
    co2Max: 1000,
    stageHints: ['育苗期 = 定植', '生长期 = 整形修剪', '成熟期 = 膨果转色', '采收期 = 分批采摘'],
    tips: ['成熟期土壤水分骤变容易裂果', '转色期昼夜温差大于 10℃ 有利于上色', '大棚草莓湿度高于 80% 要及时通风防灰霉']
  },
  {
    key: 'grain',
    label: '粮油',
    summary: '水稻、油菜、玉米等大田作物，以积温、墒情和病虫害测报为主。',
    tempMin: 15,
    tempMax: 30,
    humidityMin: 55,
    humidityMax: 85,
    co2Max: 1200,
    stageHints: ['育苗期 = 育秧/播种', '生长期 = 分蘖拔节', '成熟期 = 抽穗灌浆', '采收期 = 收割晾晒'],
    tips: ['抽穗扬花期遇连续阴雨要重点防稻曲病', '灌浆期墒情不足会明显降低千粒重', '油菜花期注意菌核病与蚜虫']
  },
  {
    key: 'herb',
    label: '中药材',
    summary: '根茎叶花入药部位不同，采收窗口与干燥方式比产量更影响品质。',
    tempMin: 15,
    tempMax: 28,
    humidityMin: 50,
    humidityMax: 80,
    co2Max: 1000,
    stageHints: ['育苗期 = 育苗/移栽', '生长期 = 遮阴与水肥', '成熟期 = 有效成分积累', '采收期 = 按部位采收'],
    tips: ['根类药材采收前 15 天控水，利于有效成分积累', '注意农药安全间隔期，采收前留足降解时间', '喜阴品种夏季需遮阴 50%–70%']
  },
  {
    key: 'tea',
    label: '茶叶',
    summary: '茶园看的是芽叶生长节奏，采摘窗口短，肥水与遮阴直接影响鲜叶品质。',
    tempMin: 15,
    tempMax: 28,
    humidityMin: 60,
    humidityMax: 85,
    co2Max: 1000,
    stageHints: ['育苗期 = 茶苗定植', '生长期 = 修剪施肥', '成熟期 = 芽叶萌发', '采收期 = 分批采摘'],
    tips: ['春茶采摘期 3–5 天一个轮次，错过芽叶就老了', '高温干旱时早晚灌溉，避免正午浇水', '茶园排水不畅易发根腐病']
  },
  {
    key: 'flower',
    label: '花卉',
    summary: '鲜切花与观赏苗木重视株型与花期控制，温度和光照决定开花时间。',
    tempMin: 15,
    tempMax: 26,
    humidityMin: 50,
    humidityMax: 80,
    co2Max: 1000,
    stageHints: ['育苗期 = 扦插/播种', '生长期 = 摘心整形', '成熟期 = 花芽分化', '采收期 = 切花采收'],
    tips: ['短日照品种补光时长不够会只长叶不开花', '切花采收宜在清晨，采后立即预冷', '高湿环境要及时通风，防灰霉与白粉病']
  },
  {
    key: 'other',
    label: '其他',
    summary: '未归入以上大类的种植品类，按通用大棚标准管理，再结合品种微调。',
    tempMin: 15,
    tempMax: 28,
    humidityMin: 50,
    humidityMax: 85,
    co2Max: 1000,
    stageHints: ['育苗期', '生长期', '成熟期', '采收期'],
    tips: ['先记录 1–2 周的温湿度曲线，再决定要不要加设备', '任何品类，通风都是最便宜有效的调控手段']
  }
];

const DEFAULT_CROP = 'mushroom';

function getProfile(category) {
  const key = String(category || '').trim();
  return CROP_PROFILES.find((item) => item.key === key) || CROP_PROFILES[0];
}

/** 供告警/界面使用的阈值三元组（温度上限、湿度下限、CO₂ 上限） */
function thresholdsOf(category) {
  const p = getProfile(category);
  return { temp_max: p.tempMax, humidity_min: p.humidityMin, co2_max: p.co2Max };
}

/** 一行人类可读的参考区间，例如「20–26℃ · 湿度 80–95% · CO₂ ≤800ppm」 */
function rangeText(category) {
  const p = getProfile(category);
  return `${p.tempMin}–${p.tempMax}℃ · 湿度 ${p.humidityMin}–${p.humidityMax}% · CO₂ ≤${p.co2Max}ppm`;
}

module.exports = { CROP_PROFILES, DEFAULT_CROP, getProfile, thresholdsOf, rangeText };
