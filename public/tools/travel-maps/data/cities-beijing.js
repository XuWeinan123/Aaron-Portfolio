/* ============================================================
   北京出发数据：只登记各目的地的北京端差异（transport / recommend
   及可选 hook/tagline/tips/label/minK 覆盖），攻略内容沿用 cities.js。
   口径同杭州/上海版：2024-2026 真实时刻表 / 航班 / 导航数据研究整理，非实时。
   ============================================================ */

const CITY_DATA_BEIJING = (() => {

  // 北京端固定接驳（分钟）
  const BJ = {
    toRail: 45,   // 二环一带 → 北京南/北京西/北京朝阳（地铁折中）
    railBuf: 25,  // 取票候车检票
    toAir: 60,    // 市区 → 首都约50-70分 / 大兴约55-70分，折中
    airBuf: 90,   // 值机安检
  };

  const railD2D  = (veh, arr, dep = BJ.toRail) => dep + BJ.railBuf + veh + arr;
  const flyD2D   = (veh, arr, dep = BJ.toAir + BJ.airBuf) => dep + veh + arr;
  const driveD2D = v => v + (v > 240 ? Math.floor(v / 120) * 15 : 0); // 长途加休息

  const home = { name: "北京", coord: [116.4, 39.9] };

  /* ----------------------------------------------------------
     T：目的地 id → 北京端覆盖数据
     ---------------------------------------------------------- */
  const T = {
/* @BJ_BATCHES_START */
/* @BJ_BATCHES_END */
  };

  /* ----------------------------------------------------------
     组装：杭州版目的地 + 杭州共享内容为底，去掉北京，换上北京端交通
     ---------------------------------------------------------- */
  const OVERRIDE_KEYS = ["hook", "tagline", "tips", "label", "minK"];

  const cities = [...CITY_DATA_HANGZHOU.cities, HANGZHOU_DEST_BASE]
    .filter(c => c.id !== "beijing")
    .map(base => {
      const o = T[base.id];
      if (!o) { console.warn("[cities-beijing] 缺少北京端数据:", base.id); return null; }
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
