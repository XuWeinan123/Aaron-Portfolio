/* ============================================================
   广州出发数据：只登记各目的地的广州端差异（transport / recommend
   及可选 hook/tagline/tips/label/minK 覆盖），攻略内容沿用 cities.js。
   口径同杭州/上海版：2024-2026 真实时刻表 / 航班 / 导航数据研究整理，非实时。
   ============================================================ */

const CITY_DATA_GUANGZHOU = (() => {

  // 广州端固定接驳（分钟）
  const GZ = {
    toRail: 40,   // 珠江新城一带 → 广州南（地铁2/22号线折中）；广州东更近可用 dep 覆盖
    railBuf: 25,  // 取票候车检票
    toAir: 55,    // 市区 → 白云机场（地铁3号线北延/机场快线）
    airBuf: 90,   // 值机安检
  };

  const railD2D  = (veh, arr, dep = GZ.toRail) => dep + GZ.railBuf + veh + arr;
  const flyD2D   = (veh, arr, dep = GZ.toAir + GZ.airBuf) => dep + veh + arr;
  const driveD2D = v => v + (v > 240 ? Math.floor(v / 120) * 15 : 0); // 长途加休息

  const home = { name: "广州", coord: [113.26, 23.13] };

  /* ----------------------------------------------------------
     T：目的地 id → 广州端覆盖数据
     ---------------------------------------------------------- */
  const T = {
/* @GZ_BATCHES_START */
/* @GZ_BATCHES_END */
  };

  /* ----------------------------------------------------------
     组装：杭州版目的地 + 杭州共享内容为底，去掉广州，换上广州端交通
     ---------------------------------------------------------- */
  const OVERRIDE_KEYS = ["hook", "tagline", "tips", "label", "minK"];

  const cities = [...CITY_DATA_HANGZHOU.cities, HANGZHOU_DEST_BASE]
    .filter(c => c.id !== "guangzhou")
    .map(base => {
      const o = T[base.id];
      if (!o) { console.warn("[cities-guangzhou] 缺少广州端数据:", base.id); return null; }
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
