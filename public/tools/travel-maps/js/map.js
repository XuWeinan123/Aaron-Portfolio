/* ============================================================
   地图引擎：投影、手绘省份、等时圈、城市贴纸
   等时圈模型：T(点) = min_锚点( 门到门耗时(锚点) + 锚点继续驾车的时间 )
   —— 即"先用该方式到达最近的枢纽城市，再开车前往"，
   能真实呈现高铁/航空走廊带来的时间凹陷。
   ============================================================ */

const TravelMap = (() => {

  const HOURS = h => h * 60;

  // 等时色带（分钟阈值 + 水彩色）
  const BANDS = [
    { max: HOURS(2),  color: "#f2837b", label: "2 小时内 · 说走就走" },
    { max: HOURS(4),  color: "#f5b754", label: "2–4 小时 · 周末刚好" },
    { max: HOURS(6),  color: "#a8c95c", label: "4–6 小时 · 小长假呀" },
    { max: HOURS(8),  color: "#5fbcab", label: "6–8 小时 · 值得专程" },
    { max: HOURS(12), color: "#7e9bd3", label: "8–12 小时 · 远方在召唤" },
    { max: Infinity,  color: "#b39ad2", label: "12 小时以上 · 大冒险！" },
  ];

  const ONWARD_SPEED_KMH = 65;     // 抵达枢纽后继续驾车的平均速度
  const GRID_STEP = 7;             // 等时场采样步长（像素）

  let svg, rootG, projection, geoPath, zoomBehavior;
  let chinaFC, provinces, dashLine, mode = "best";
  let onCityClick = () => {};
  let width = 0, height = 0;
  let DATA; // 当前出发城市的数据集 { home, cities, anchors }

  /* ---------- 工具 ---------- */

  function haversineKm([lon1, lat1], [lon2, lat2]) {
    const R = 6371, toR = Math.PI / 180;
    const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function fmtMin(min) {
    if (min == null || !isFinite(min)) return "—";
    const h = Math.floor(min / 60), m = Math.round(min % 60);
    return h ? (m ? `${h}小时${m}分` : `${h}小时`) : `${m}分钟`;
  }

  // 某地某方式的门到门分钟数（无该方式返回 null）
  function doorToDoor(place, m) {
    const d = place.doorToDoor || {};
    if (m === "best") {
      const vals = ["rail", "fly", "drive"].map(k => d[k]).filter(v => v != null);
      return vals.length ? Math.min(...vals) : null;
    }
    return d[m] != null ? d[m] : null;
  }

  function bandColor(min) {
    for (const b of BANDS) if (min <= b.max) return b.color;
    return BANDS[BANDS.length - 1].color;
  }

  /* ---------- 初始化 ---------- */

  // DataV GeoJSON 的环绕方向与 D3 球面多边形约定相反：
  // 单环面积 > 2π(半球) 说明方向反了，会被渲染成"全球减去该省"
  function rewind(fc) {
    for (const f of fc.features) {
      const g = f.geometry;
      if (!g) continue;
      const polys = g.type === "Polygon" ? [g.coordinates]
                  : g.type === "MultiPolygon" ? g.coordinates : [];
      for (const rings of polys) {
        for (const ring of rings) {
          if (d3.geoArea({ type: "Polygon", coordinates: [ring] }) > Math.PI * 2) {
            ring.reverse();
          }
        }
      }
    }
  }

  async function init({ container, geojson, data, onSelect }) {
    DATA = data;
    chinaFC = geojson;
    rewind(chinaFC);
    // DataV 数据末尾有一个无名称的南海诸岛/九段线要素：
    // 不能参与 fitExtent（会把地图挤小），也不能作为多边形填充
    provinces = chinaFC.features.filter(f => f.properties.name);
    dashLine = chinaFC.features.filter(f => !f.properties.name);
    onCityClick = onSelect;

    svg = d3.select(container);
    // 首帧可能尚未布局（如后台标签页），轮询等布局；不能用 rAF——后台页不派发。
    // 兜底取文档视口，保证任何情况下都能画出来
    let rect = svg.node().getBoundingClientRect();
    for (let i = 0; (!rect.width || !rect.height) && i < 20; i++) {
      await new Promise(r => setTimeout(r, 100));
      rect = svg.node().getBoundingClientRect();
    }
    width = rect.width || document.documentElement.clientWidth || 1280;
    height = rect.height || Math.max(300, (document.documentElement.clientHeight || 800) - 110);
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    // 中国常用 Albers 圆锥等积投影
    projection = d3.geoConicEqualArea()
      .parallels([25, 47])
      .rotate([-105, 0])
      .fitExtent([[20, 16], [width - 20, height - 8]],
        { type: "FeatureCollection", features: provinces });
    geoPath = d3.geoPath(projection);

    buildDefs();

    rootG = svg.append("g").attr("class", "root");

    rootG.append("g").attr("class", "layer-provinces");
    rootG.append("g").attr("class", "layer-iso").attr("clip-path", "url(#clip-china)");
    rootG.append("g").attr("class", "layer-border");
    rootG.append("g").attr("class", "layer-routes");
    rootG.append("g").attr("class", "layer-cities");

    drawProvinces();
    drawIsochrones();
    drawCities();
    drawHome();
    buildLegend();

    // 首屏/切换出发城市到场:整图淡入由 CSS .root 的 fade-in 动画负责
    // (新插入节点的 transition 首帧不可靠,animation 必然播放)

    zoomBehavior = d3.zoom()
      .scaleExtent([0.5, 18])
      .on("zoom", ev => {
        rootG.attr("transform", ev.transform);
        applyZoomStyles(ev.transform.k);
      });
    svg.call(zoomBehavior).on("dblclick.zoom", null);
    applyZoomStyles(1);
  }

  function buildDefs() {
    const defs = svg.append("defs");

    // 手绘抖动滤镜
    const wobble = defs.append("filter").attr("id", "wobble")
      .attr("x", "-5%").attr("y", "-5%").attr("width", "110%").attr("height", "110%");
    wobble.append("feTurbulence")
      .attr("type", "fractalNoise").attr("baseFrequency", "0.015")
      .attr("numOctaves", 3).attr("seed", 7).attr("result", "noise");
    wobble.append("feDisplacementMap")
      .attr("in", "SourceGraphic").attr("in2", "noise").attr("scale", 4);

    // 水彩边缘（给等时圈）
    const wc = defs.append("filter").attr("id", "watercolor")
      .attr("x", "-8%").attr("y", "-8%").attr("width", "116%").attr("height", "116%");
    wc.append("feTurbulence")
      .attr("type", "fractalNoise").attr("baseFrequency", "0.022")
      .attr("numOctaves", 4).attr("seed", 3).attr("result", "noise");
    wc.append("feDisplacementMap")
      .attr("in", "SourceGraphic").attr("in2", "noise").attr("scale", 14).attr("result", "disp");
    wc.append("feGaussianBlur").attr("in", "disp").attr("stdDeviation", 1.2);

    // 全国轮廓裁剪（等时圈不溢出国界/海岸线）。
    // 注意：必须合并为单条 path —— Chromium 对多条复杂子路径的
    // clipPath 会整体判空（已实测），单条合并路径则正常。
    defs.append("clipPath").attr("id", "clip-china")
      .append("path")
      .attr("d", geoPath({ type: "GeometryCollection", geometries: provinces.map(f => f.geometry) }));
  }

  /* ---------- 省份 ---------- */

  const PROVINCE_FILLS = ["#f3ead6", "#efe4cc", "#f5eedd", "#ece1c6", "#f1e8d2"];

  function drawProvinces() {
    rootG.select(".layer-provinces")
      .attr("filter", "url(#wobble)")
      .selectAll("path")
      .data(provinces)
      .join("path")
      .attr("class", "province")
      .attr("d", geoPath)
      .attr("fill", (d, i) => PROVINCE_FILLS[i % PROVINCE_FILLS.length])
      .attr("stroke", "#c9b690")
      .attr("stroke-width", 0.7);

    // 南海诸岛 / 九段线：仅描边
    rootG.select(".layer-border")
      .attr("filter", "url(#wobble)")
      .selectAll("path.dash-line")
      .data(dashLine)
      .join("path")
      .attr("class", "dash-line")
      .attr("d", geoPath)
      .attr("fill", "none")
      .attr("stroke", "#c9b690")
      .attr("stroke-width", 0.8)
      .attr("stroke-dasharray", "4 3")
      .attr("pointer-events", "none");
  }

  /* ---------- 等时圈 ---------- */

  function isoAnchors() {
    return [...DATA.cities, ...DATA.anchors]
      .map(p => ({ coord: p.coord, t: doorToDoor(p, mode) }))
      .filter(p => p.t != null);
  }

  function drawIsochrones() {
    const anchors = isoAnchors().map(a => {
      const [x, y] = projection(a.coord);
      return { x, y, t: a.t, coord: a.coord };
    });
    // 出发城市本身耗时为 0
    const [hx, hy] = projection(DATA.home.coord);
    anchors.push({ x: hx, y: hy, t: 0, coord: DATA.home.coord });

    const cols = Math.ceil(width / GRID_STEP), rows = Math.ceil(height / GRID_STEP);
    const values = new Float64Array(cols * rows);

    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const px = i * GRID_STEP, py = j * GRID_STEP;
        const geo = projection.invert([px, py]);
        let best = Infinity;
        if (geo && isFinite(geo[0]) && isFinite(geo[1])) {
          for (const a of anchors) {
            const km = haversineKm(geo, a.coord);
            const t = a.t + (km / ONWARD_SPEED_KMH) * 60;
            if (t < best) best = t;
          }
        }
        // 给等值面算法一个有限的封顶值
        values[j * cols + i] = Math.min(best, 1e5);
      }
    }

    const layer = rootG.select(".layer-iso");
    layer.selectAll("*").remove();

    // d3.contours 生成 "值 >= 阈值" 的区域，而色带要表达 "<= 阈值"，
    // 故对时间场取反后再取等值面：>= -max 即 <= max。
    const inverted = values.map(v => -v);
    const idPath = d3.geoPath(d3.geoIdentity().scale(GRID_STEP));
    const regionD = BANDS.slice(0, -1).map(band => {
      const c = d3.contours().size([cols, rows]).thresholds([-band.max])(inverted)[0];
      return (c && c.coordinates.length) ? idPath(c) : null;
    });

    // 关键：每个色带画成"环"（本带区域挖掉更近一带），用 evenodd 实现，
    // 否则嵌套圆盘 + multiply 会把所有颜色乘在一起变成泥色。
    const chinaD = geoPath({ type: "GeometryCollection", geometries: provinces.map(f => f.geometry) });

    // 最外圈（12h+）：全国轮廓挖掉最大等时区域
    const outermost = [...regionD].reverse().find(d => d);
    layer.append("path")
      .attr("d", chinaD + (outermost || ""))
      .attr("fill-rule", "evenodd")
      .attr("class", "iso-band")
      .attr("fill", BANDS[BANDS.length - 1].color)
      .attr("opacity", 0.45);

    for (let i = regionD.length - 1; i >= 0; i--) {
      if (!regionD[i]) continue;
      const inner = regionD.slice(0, i).reverse().find(d => d); // 更近的下一带
      layer.append("path")
        .attr("d", regionD[i] + (inner || ""))
        .attr("fill-rule", "evenodd")
        .attr("class", "iso-band")
        .attr("filter", "url(#watercolor)")
        .attr("fill", BANDS[i].color)
        .attr("opacity", 0.55);
    }

    // 等时圈描边（虚线小波浪）
    regionD.forEach((d, i) => {
      if (!d) return;
      layer.append("path")
        .attr("d", d)
        .attr("fill", "none")
        .attr("class", "iso-band")
        .attr("stroke", d3.color(BANDS[i].color).darker(1.1))
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "5 4");
    });
  }

  /* ---------- 城市贴纸 ---------- */

  function drawCities() {
    const layer = rootG.select(".layer-cities");
    layer.selectAll("*").remove();

    const g = layer.selectAll("g.city-sticker")
      .data(DATA.cities, d => d.id)
      .join("g")
      .attr("class", "city-sticker")
      .attr("transform", d => {
        const [x, y] = projection(d.coord);
        return `translate(${x},${y})`;
      })
      .on("click", (ev, d) => { ev.stopPropagation(); onCityClick(d); })
      .on("mousemove", (ev, d) => showTip(ev, d))
      .on("mouseleave", hideTip);

    // 当前模式下不可达/无该方式的城市整体淡化
    g.attr("opacity", d => doorToDoor(d, mode) == null ? 0.42 : 1);

    // 加大命中区域：透明圆垫底
    g.append("circle")
      .attr("class", "hit-circle")
      .attr("r", 17)
      .attr("fill", "transparent");

    // 三层 transform 各司其职，避免互相覆盖：
    // .sticker-zoom 缩放反比例(随手势,无过渡) > .sticker-lod LOD 折叠(CSS 过渡) > .sticker-bg hover(CSS)
    const bg = g.append("g").attr("class", "sticker-zoom")
      .append("g").attr("class", "sticker-lod")
      .append("g").attr("class", "sticker-bg");

    bg.append("circle")
      .attr("r", 11)
      .attr("fill", "#fffdf6")
      .attr("stroke", d => d3.color(bandColor(doorToDoor(d, mode) ?? HOURS(13))).darker(0.8))
      .attr("stroke-width", 2);

    bg.append("circle")
      .attr("r", 11)
      .attr("fill", d => bandColor(doorToDoor(d, mode) ?? HOURS(13)))
      .attr("opacity", 0.35);

    bg.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.36em")
      .attr("font-size", 12)
      .text(d => d.emoji);

    // 标签位置：默认在贴纸下方，密集区城市在数据里给 label:{dx,dy,anchor}
    const lpos = d => {
      const l = d.label || {};
      return { dx: l.dx ?? 0, dy: l.dy ?? 23, anchor: l.anchor || "middle" };
    };

    g.append("text")
      .attr("class", "city-label")
      .attr("text-anchor", d => lpos(d).anchor)
      .attr("x", d => lpos(d).dx)
      .attr("y", d => lpos(d).dy)
      .attr("font-size", 11.5)
      .text(d => d.name);

    g.append("text")
      .attr("class", "city-time-tag")
      .attr("text-anchor", d => lpos(d).anchor)
      .attr("x", d => lpos(d).dx)
      .attr("y", d => { const p = lpos(d); return p.dy < 0 ? p.dy - 11 : p.dy + 11; })
      .attr("font-size", 10.5)
      .text(d => fmtMin(doorToDoor(d, mode)));
  }

  /* ---------- 缩放视觉（LOD + 反向缩放） ----------
     图标随缩放温和变化（屏幕上 = sqrt(k)），文本在屏幕上保持恒定大小；
     k < DOT_K 所有地点统一缩成小图标，k < TIME_K 隐藏耗时只留名称。
     minK 城市（贴着出发地的小城）仍需放大到 minK 才展开。 */
  const DOT_K = 0.85, TIME_K = 1.8;

  function applyZoomStyles(k) {
    const iconScale = 1 / Math.sqrt(k);
    const textScale = 1 / k;

    // 只作用于真实城市图层——模式切换的 .layer-ghost 克隆无 d3 数据,选中会抛错
    rootG.select(".layer-cities").selectAll(".city-sticker, .home-marker").each(function (d) {
      if (!d) return;
      const sel = d3.select(this);
      const [x, y] = projection(d.coord);
      sel.attr("transform", `translate(${x},${y})`);

      const isHome = sel.classed("home-marker");
      const collapsed = !isHome && (k < DOT_K || (d.minK && k < d.minK));
      const showName = isHome || !collapsed;
      const showTime = !isHome && !collapsed && k >= TIME_K;

      sel.select(".sticker-zoom")
        .attr("transform", `scale(${iconScale})`);
      sel.select(".sticker-lod")
        .attr("transform", `scale(${collapsed ? 0.55 : 1})`);
      sel.select(".hit-circle")
        .attr("transform", `scale(${iconScale})`);
      sel.select(".city-label")
        .attr("opacity", showName ? 1 : 0)
        .attr("transform", `scale(${textScale})`);
      sel.select(".city-time-tag")
        .attr("opacity", showTime ? 1 : 0)
        .attr("transform", `scale(${textScale})`);
    });
  }

  function drawHome() {
    const home = DATA.home;
    const [x, y] = projection(home.coord);
    const g = rootG.select(".layer-cities")
      .append("g")
      .datum(home)
      .attr("class", "home-marker")
      .attr("transform", `translate(${x},${y})`);

    const bg = g.append("g").attr("class", "sticker-zoom")
      .append("g").attr("class", "sticker-bg");

    bg.append("circle").attr("class", "home-pulse")
      .attr("r", 11).attr("fill", "none")
      .attr("stroke", "#e8606b").attr("stroke-width", 2);

    bg.append("circle").attr("r", 11.5)
      .attr("fill", "#e8606b").attr("stroke", "#fff8ec").attr("stroke-width", 2.5)
      .attr("filter", "drop-shadow(1.5px 2.5px 1px rgba(74,63,53,.3))");

    bg.append("text")
      .attr("text-anchor", "middle").attr("dy", "0.36em")
      .attr("font-size", 12).text("🏡");

    g.append("text")
      .attr("class", "city-label")
      .attr("text-anchor", "end").attr("x", -15).attr("y", -8).attr("font-size", 13)
      .text(`${home.name} · 家`);
  }

  /* ---------- 悬浮提示 ---------- */

  const tip = () => document.getElementById("hover-tip");

  function showTip(ev, d) {
    const t = tip();
    const best = doorToDoor(d, mode);
    const modeName = { best: "最快", rail: "高铁", fly: "飞机", drive: "驾车" }[mode];
    t.innerHTML = `<b>${d.emoji} ${d.name}</b> <span class="tip-time">${modeName} ${fmtMin(best)}</span><br>
      <span style="font-size:12px;color:#7a6a58">${d.hook || ""} · 点开看攻略 👆</span>`;
    t.classList.remove("hidden");
    const wrap = document.getElementById("map-wrap").getBoundingClientRect();
    let lx = ev.clientX - wrap.left + 16, ly = ev.clientY - wrap.top - 10;
    if (lx > wrap.width - 240) lx -= 260;
    t.style.left = lx + "px"; t.style.top = ly + "px";
  }

  function hideTip() { tip().classList.add("hidden"); }

  /* ---------- 图例 ---------- */

  function buildLegend() {
    const ul = document.getElementById("legend-bands");
    ul.innerHTML = BANDS.map(b =>
      `<li><span class="band-chip" style="background:${b.color}"></span>${b.label}</li>`
    ).join("");
  }

  /* ---------- 模式切换 ---------- */

  function setMode(m) {
    mode = m;
    hideTip();

    // 旧图层克隆成"幽灵层"淡出，新图层淡入 —— 真正的交叉淡化
    const reduce = reduceMotion();
    let ghosts = [];
    if (!reduce) {
      ghosts = [".layer-iso", ".layer-cities"].map(cls => {
        const orig = rootG.select(cls).node();
        const ghost = orig.cloneNode(true);
        ghost.setAttribute("class", "layer-ghost");
        ghost.style.pointerEvents = "none";
        orig.parentNode.insertBefore(ghost, orig.nextSibling);
        return ghost;
      });
    }

    drawIsochrones();
    drawCities();
    drawHome();
    // 保持当前缩放
    applyZoomStyles(d3.zoomTransform(svg.node()).k);

    if (!reduce) {
      // 幽灵层压在新层之上,淡出即溶解显出新状态。
      // 先强制样式冲刷,确立"初始不透明度 1"的过渡起点,否则同帧置 0 会瞬跳
      ghosts.forEach(g => void g.getBoundingClientRect());
      ghosts.forEach(g => { g.style.opacity = 0; });
      setTimeout(() => ghosts.forEach(g => g.remove()), 400);
    }
  }

  /* ---------- 缩放控件 ---------- */

  // 减动效或页面不可见（后台标签页 rAF 停摆，transition 不推进）时直接跳变
  const reduceMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const zoomTarget = () =>
    (reduceMotion() || document.hidden) ? svg : svg.transition().duration(240);

  function zoomBy(factor) { zoomTarget().call(zoomBehavior.scaleBy, factor); }
  function zoomReset() { zoomTarget().call(zoomBehavior.transform, d3.zoomIdentity); }

  return { init, setMode, zoomBy, zoomReset, fmtMin, doorToDoor, bandColor, currentMode: () => mode };
})();
