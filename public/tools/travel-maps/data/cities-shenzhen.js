/* ============================================================
   深圳出发数据：只登记各目的地的深圳端差异（transport / recommend
   及可选 hook/tagline/tips/label/minK 覆盖），攻略内容沿用 cities.js。
   口径同杭州/上海版：2024-2026 真实时刻表 / 航班 / 导航数据研究整理，非实时。
   ============================================================ */

const CITY_DATA_SHENZHEN = (() => {

  // 深圳端固定接驳（分钟）
  const SZ = {
    toRail: 30,   // 福田CBD → 福田站就在脚下/深圳北约30分，折中
    railBuf: 25,  // 取票候车检票
    toAir: 50,    // 市区 → 宝安机场（地铁11号线约40分）
    airBuf: 90,   // 值机安检
  };

  const railD2D  = (veh, arr, dep = SZ.toRail) => dep + SZ.railBuf + veh + arr;
  const flyD2D   = (veh, arr, dep = SZ.toAir + SZ.airBuf) => dep + veh + arr;
  const driveD2D = v => v + (v > 240 ? Math.floor(v / 120) * 15 : 0); // 长途加休息

  const home = { name: "深圳", coord: [114.06, 22.55] };

  /* ----------------------------------------------------------
     T：目的地 id → 深圳端覆盖数据
     ---------------------------------------------------------- */
  const T = {
/* @SZ_BATCHES_START */
/* @SZ_BATCHES_END */
  };

  /* ----------------------------------------------------------
     组装：杭州版目的地 + 杭州共享内容为底，去掉深圳，换上深圳端交通
     ---------------------------------------------------------- */
  const OVERRIDE_KEYS = ["hook", "tagline", "tips", "label", "minK"];

  const cities = [...CITY_DATA_HANGZHOU.cities, HANGZHOU_DEST_BASE]
    .filter(c => c.id !== "shenzhen")
    .map(base => {
      const o = T[base.id];
      if (!o) { console.warn("[cities-shenzhen] 缺少深圳端数据:", base.id); return null; }
      const c = { ...base, transport: o.transport, recommend: o.recommend };
      for (const k of OVERRIDE_KEYS) if (o[k] !== undefined) c[k] = o[k];
      return c;
    })
    .filter(Boolean);

  // 统一计算门到门耗时
  cities.forEach(c => {
    const t = c.transport;
    c.doorToDoor = {
      rail:  t.rail  ? railD2D(t.rail.veh, t.rail.arr, t.rail.dep) : null,
      fly:   t.fly   ? flyD2D(t.fly.veh, t.fly.arr, t.fly.dep) : null,
      drive: t.drive ? driveD2D(t.drive.veh)            : null,
    };
  });

  return { home, cities, anchors: [] };
})();
