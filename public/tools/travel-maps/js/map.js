/* ============================================================
   地图引擎：投影、省份、等时圈、城市贴纸
   等时圈模型：T(点) = min_锚点( 门到门耗时(锚点) + 锚点继续驾车的时间 )
   —— 即"先用该方式到达最近的枢纽城市，再开车前往"，
   能真实呈现高铁/航空走廊带来的时间凹陷。
   ============================================================ */

const TravelMap = (() => {

  const HOURS = h => h * 60;

  // 等时色带（分钟阈值 + 水彩色）
  const BANDS = [
    { max: HOURS(2),  color: "#f2837b", label: "说走就走" },
    { max: HOURS(4),  color: "#f5b754", label: "周末刚好" },
    { max: HOURS(6),  color: "#a8c95c", label: "小长假呀" },
    { max: HOURS(8),  color: "#5fbcab", label: "值得专程" },
    { max: HOURS(12), color: "#7e9bd3", label: "远方在召唤" },
    { max: Infinity,  color: "#b39ad2", label: "大冒险！" },
  ];

  const ONWARD_SPEED_KMH = 65;     // 抵达枢纽后继续驾车的平均速度
  const GRID_STEP = 7;             // 等时场采样步长（像素）
  const EFFECTS_OUT_MS = 90;       // 手势开始：先淡出，再彻底停用昂贵效果
  const EFFECTS_IN_MS = 180;       // 手势结束：先恢复渲染，再柔和淡入
  const MARKER_SETTLE_MS = 180;    // 城市贴纸在缩放结束后恢复恒定视觉尺寸
  const PHONE_LAYOUT = window.matchMedia("(max-width: 760px)");

  let svg, rootG, projection, geoPath, zoomBehavior;
  let chinaFC, provinces, dashLine, mode = "best";
  let onCityClick = () => {};
  let width = 0, height = 0;
  let DATA; // 当前出发城市的数据集 { home, cities, anchors }
  let chinaD = "", contourPath;
  let citySelection, cityOutlineSelection, cityFillSelection, cityTimeSelection;
  let zoomItems = [];
  let pendingZoomTransform = null, zoomFrame = 0, lastZoomK = NaN, lastLodBucket = -1;
  let mapInteracting = false, interactionToken = 0;
  let effectsToken = 0, effectsOffTimer = 0, effectsRestoreFrame = 0;
  let markerSettleFrame = 0, markerSettleTimer = 0;

  const isoCache = new Map();
  const isoPending = new Map();
  const isoRequests = new Map();
  let isoWorker = null, isoWorkerFailed = false, isoRequestId = 0, modeRequestId = 0;

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
    chinaD = geoPath({ type: "GeometryCollection", geometries: provinces.map(f => f.geometry) });
    contourPath = d3.geoPath(d3.geoIdentity().scale(GRID_STEP));

    buildDefs();

    rootG = svg.append("g").attr("class", "root");

    rootG.append("g").attr("class", "layer-provinces");
    rootG.append("g")
      .attr("class", "layer-iso layer-iso-current")
      .attr("clip-path", "url(#clip-china)");
    rootG.append("g").attr("class", "layer-border");
    rootG.append("g").attr("class", "layer-routes");
    rootG.append("g").attr("class", "layer-cities");

    drawProvinces();
    const initialIso = computeIsochrones(mode);
    isoCache.set(isoCacheKey(mode), initialIso);
    populateIsoLayer(rootG.select(".layer-iso-current"), initialIso);
    drawCities();
    drawHome();
    cacheZoomItems();
    buildLegend();

    // 首屏/切换出发城市到场:整图淡入由 CSS .root 的 fade-in 动画负责
    // (新插入节点的 transition 首帧不可靠,animation 必然播放)

    zoomBehavior = d3.zoom()
      .scaleExtent([0.5, 18])
      .on("start", beginMapInteraction)
      .on("zoom", ev => {
        pendingZoomTransform = ev.transform;
        if (!zoomFrame) zoomFrame = requestAnimationFrame(flushZoomFrame);
      })
      .on("end", endMapInteraction);
    svg.call(zoomBehavior).on("dblclick.zoom", null);
    applyZoomStyles(1, true);
    PHONE_LAYOUT.addEventListener?.("change", () => {
      applyZoomStyles(Number.isFinite(lastZoomK) ? lastZoomK : 1, true);
    });

    initIsoWorker();
  }

  function buildDefs() {
    const defs = svg.append("defs");

    // 全国轮廓裁剪（等时圈不溢出国界/海岸线）。
    // 注意：必须合并为单条 path —— Chromium 对多条复杂子路径的
    // clipPath 会整体判空（已实测），单条合并路径则正常。
    defs.append("clipPath").attr("id", "clip-china")
      .append("path")
      .attr("d", chinaD);
  }

  /* ---------- 省份 ---------- */

  const PROVINCE_FILLS = ["#f3ead6", "#efe4cc", "#f5eedd", "#ece1c6", "#f1e8d2"];

  function drawProvinces() {
    rootG.select(".layer-provinces")
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

  function isoAnchors(targetMode = mode) {
    return [...DATA.cities, ...DATA.anchors]
      .map(p => ({ coord: p.coord, t: doorToDoor(p, targetMode) }))
      .filter(p => p.t != null);
  }

  function isoCacheKey(targetMode) {
    return `${targetMode}:${width}x${height}`;
  }

  function contourPaths(values, cols, rows) {
    const inverted = values.map(v => -v);
    const thresholds = BANDS.slice(0, -1).map(band => -band.max);
    const contours = d3.contours()
      .size([cols, rows])
      .thresholds(thresholds)(inverted);
    const byValue = new Map(contours.map(c => [c.value, c]));

    return thresholds.map(value => {
      const c = byValue.get(value);
      return (c && c.coordinates.length) ? contourPath(c) : null;
    });
  }

  function computeIsochrones(targetMode) {
    const anchors = isoAnchors(targetMode);
    // 出发城市本身耗时为 0
    anchors.push({ coord: DATA.home.coord, t: 0 });

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

    return contourPaths(values, cols, rows);
  }

  async function computeIsochronesChunked(targetMode) {
    const anchors = isoAnchors(targetMode);
    anchors.push({ coord: DATA.home.coord, t: 0 });

    const cols = Math.ceil(width / GRID_STEP), rows = Math.ceil(height / GRID_STEP);
    const values = new Float64Array(cols * rows);
    const total = cols * rows;
    let index = 0;

    while (index < total) {
      const deadline = performance.now() + 8;
      do {
        const i = index % cols, j = Math.floor(index / cols);
        const geo = projection.invert([i * GRID_STEP, j * GRID_STEP]);
        let best = Infinity;
        if (geo && isFinite(geo[0]) && isFinite(geo[1])) {
          for (const a of anchors) {
            const km = haversineKm(geo, a.coord);
            const t = a.t + (km / ONWARD_SPEED_KMH) * 60;
            if (t < best) best = t;
          }
        }
        values[index++] = Math.min(best, 1e5);
      } while (index < total && performance.now() < deadline);

      if (index < total) await new Promise(resolve => setTimeout(resolve, 0));
    }

    return contourPaths(values, cols, rows);
  }

  function populateIsoLayer(layer, regionD) {
    layer.selectAll("*").remove();

    // 关键：每个色带画成"环"（本带区域挖掉更近一带），用 evenodd 实现，
    // 否则嵌套圆盘 + multiply 会把所有颜色乘在一起变成泥色。
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

  function replaceIsoLayer(regionD, animate = true) {
    rootG.selectAll(".layer-iso-retiring").interrupt().remove();

    const current = rootG.select(".layer-iso-current");
    const next = rootG.insert("g", ".layer-border")
      .attr("class", "layer-iso layer-iso-current")
      .attr("clip-path", "url(#clip-china)");
    populateIsoLayer(next, regionD);

    current.attr("class", "layer-iso layer-iso-retiring").interrupt();
    if (!animate || reduceMotion()) {
      current.remove();
      return;
    }

    next.attr("opacity", 0)
      .transition().duration(300)
      .attr("opacity", 1);
    current.transition().duration(300)
      .attr("opacity", 0)
      .remove();
  }

  function failIsoWorker(error) {
    if (isoWorker) isoWorker.terminate();
    isoWorker = null;
    isoWorkerFailed = true;
    const reason = error instanceof Error ? error : new Error(String(error || "Iso worker failed"));
    for (const request of isoRequests.values()) request.reject(reason);
    isoRequests.clear();
    isoPending.clear();
  }

  function initIsoWorker() {
    if (!("Worker" in window)) {
      isoWorkerFailed = true;
      return;
    }

    try {
      isoWorker = new Worker("js/iso-worker.js");
      isoWorker.addEventListener("message", event => {
        const message = event.data || {};
        if (message.type === "ready") {
          const warm = () => {
            ["rail", "fly", "drive"].forEach(targetMode => {
              getIsochrones(targetMode).catch(() => {});
            });
          };
          if ("requestIdleCallback" in window) {
            window.requestIdleCallback(warm, { timeout: 1500 });
          } else {
            setTimeout(warm, 800);
          }
          return;
        }

        const request = isoRequests.get(message.requestId);
        if (!request) return;
        isoRequests.delete(message.requestId);

        if (message.type === "result") {
          isoCache.set(request.key, message.paths);
          request.resolve(message.paths);
        } else {
          request.reject(new Error(message.message || "Iso worker computation failed"));
        }
      });
      isoWorker.addEventListener("error", event => {
        failIsoWorker(event.error || new Error(event.message || "Iso worker crashed"));
      });
      isoWorker.postMessage({
        type: "init",
        geojson: chinaFC,
        width,
        height,
        gridStep: GRID_STEP,
        bandMaxes: BANDS.slice(0, -1).map(band => band.max),
      });
    } catch (error) {
      failIsoWorker(error);
    }
  }

  function requestIsoFromWorker(targetMode, key) {
    const requestId = ++isoRequestId;
    const promise = new Promise((resolve, reject) => {
      isoRequests.set(requestId, { key, resolve, reject });
      isoWorker.postMessage({
        type: "compute",
        requestId,
        mode: targetMode,
        anchors: isoAnchors(targetMode),
        homeCoord: DATA.home.coord,
      });
    });
    isoPending.set(key, promise);
    promise.then(
      () => { if (isoPending.get(key) === promise) isoPending.delete(key); },
      () => { if (isoPending.get(key) === promise) isoPending.delete(key); },
    );
    return promise;
  }

  async function getIsochrones(targetMode) {
    const key = isoCacheKey(targetMode);
    if (isoCache.has(key)) return isoCache.get(key);
    if (isoPending.has(key)) return isoPending.get(key);

    if (isoWorker && !isoWorkerFailed) {
      try {
        return await requestIsoFromWorker(targetMode, key);
      } catch {
        // Worker 出错时继续走分片主线程兜底，保持模式切换可用。
      }
    }

    const paths = await computeIsochronesChunked(targetMode);
    isoCache.set(key, paths);
    return paths;
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
      .on("click", (ev, d) => { ev.stopPropagation(); onCityClick(d); });
    citySelection = g;
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      g.on("mousemove", (ev, d) => showTip(ev, d))
        .on("mouseleave", hideTip);
    }

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

    cityOutlineSelection = bg.append("circle")
      .attr("class", "sticker-outline")
      .attr("r", 11)
      .attr("fill", "#fffdf6")
      .attr("stroke-width", 2);

    cityFillSelection = bg.append("circle")
      .attr("class", "sticker-fill")
      .attr("r", 11)
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

    cityTimeSelection = g.append("text")
      .attr("class", "city-time-tag")
      .attr("text-anchor", d => lpos(d).anchor)
      .attr("x", d => lpos(d).dx)
      .attr("y", d => { const p = lpos(d); return p.dy < 0 ? p.dy - 11 : p.dy + 11; })
      .attr("font-size", 10.5);

    updateCitiesForMode(mode);
  }

  function updateCitiesForMode(targetMode) {
    if (!citySelection) return;
    citySelection.attr("opacity", d => doorToDoor(d, targetMode) == null ? 0.42 : 1);
    cityOutlineSelection.attr("stroke", d =>
      d3.color(bandColor(doorToDoor(d, targetMode) ?? HOURS(13))).darker(0.8));
    cityFillSelection.attr("fill", d =>
      bandColor(doorToDoor(d, targetMode) ?? HOURS(13)));
    cityTimeSelection.text(d => fmtMin(doorToDoor(d, targetMode)));
  }

  /* ---------- 缩放视觉（LOD + 反向缩放） ----------
     图标随缩放温和变化（屏幕上 = sqrt(k)），文本在屏幕上保持恒定大小；
     k < DOT_K 所有地点统一缩成小图标，k < TIME_K 隐藏耗时只留名称。
     minK 城市（贴着出发地的小城）仍需放大到 minK 才展开。 */
  const DOT_K = 0.85, TIME_K = 1.8;
  const LOD_BREAKPOINTS = [DOT_K, 1.4, 1.5, 1.6, 1.7, TIME_K];

  function cacheZoomItems() {
    zoomItems = [];
    rootG.select(".layer-cities")
      .selectAll(".city-sticker, .home-marker")
      .each(function (d) {
        if (!d) return;
        zoomItems.push({
          data: d,
          isHome: this.classList.contains("home-marker"),
          stickerZoom: this.querySelector(".sticker-zoom"),
          stickerLod: this.querySelector(".sticker-lod"),
          hitCircle: this.querySelector(".hit-circle"),
          label: this.querySelector(".city-label"),
          time: this.querySelector(".city-time-tag"),
        });
      });
  }

  function lodBucket(k) {
    let bucket = 0;
    while (bucket < LOD_BREAKPOINTS.length && k >= LOD_BREAKPOINTS[bucket]) bucket++;
    return bucket;
  }

  function applyZoomStyles(k, force = false) {
    const scaleChanged = force || k !== lastZoomK;
    if (scaleChanged) {
      const inverseIconScale = 1 / Math.sqrt(k);
      const textTransform = `scale(${1 / k})`;
      for (const item of zoomItems) {
        // 手机只缩小目的地贴纸的视觉尺寸；Home 与透明命中区保持原尺寸。
        const phoneScale = PHONE_LAYOUT.matches && !item.isHome ? 0.5 : 1;
        item.stickerZoom?.setAttribute("transform", `scale(${inverseIconScale * phoneScale})`);
        item.hitCircle?.setAttribute("transform", `scale(${inverseIconScale})`);
        item.label?.setAttribute("transform", textTransform);
        item.time?.setAttribute("transform", textTransform);
      }
      lastZoomK = k;
    }

    const bucket = lodBucket(k);
    if (!force && bucket === lastLodBucket) return;
    lastLodBucket = bucket;

    for (const item of zoomItems) {
      const collapsed = !item.isHome &&
        (k < DOT_K || (item.data.minK && k < item.data.minK));
      const showName = item.isHome || !collapsed;
      const showTime = !item.isHome && !collapsed && k >= TIME_K;
      item.stickerLod?.setAttribute("transform", `scale(${collapsed ? 0.55 : 1})`);
      item.label?.setAttribute("opacity", showName ? 1 : 0);
      item.time?.setAttribute("opacity", showTime ? 1 : 0);
    }
  }

  function suspendMapEffects() {
    const token = ++effectsToken;
    clearTimeout(effectsOffTimer);
    cancelAnimationFrame(effectsRestoreFrame);
    effectsRestoreFrame = 0;

    svg.classed("map-effects-off", false)
      .classed("map-effects-fading", true);

    if (reduceMotion()) {
      svg.classed("map-effects-off", true);
      return;
    }

    effectsOffTimer = setTimeout(() => {
      if (token !== effectsToken || !mapInteracting) return;
      svg.classed("map-effects-off", true);
    }, EFFECTS_OUT_MS);
  }

  function restoreMapEffects() {
    const token = ++effectsToken;
    clearTimeout(effectsOffTimer);
    effectsOffTimer = 0;

    // 阴影和动态光环已经淡出，先重新接回效果不会闪变。
    svg.classed("map-effects-off", false);

    if (reduceMotion()) {
      svg.classed("map-effects-fading", false);
      return;
    }

    effectsRestoreFrame = requestAnimationFrame(() => {
      effectsRestoreFrame = 0;
      if (token !== effectsToken || mapInteracting) return;
      svg.classed("map-effects-fading", false);
    });
  }

  function beginMapInteraction() {
    mapInteracting = true;
    interactionToken++;
    cancelAnimationFrame(markerSettleFrame);
    markerSettleFrame = 0;
    clearTimeout(markerSettleTimer);
    markerSettleTimer = 0;
    svg.classed("map-settling", false)
      .classed("map-interacting", true);
    suspendMapEffects();
  }

  function endMapInteraction(ev) {
    if (zoomFrame) cancelAnimationFrame(zoomFrame);
    zoomFrame = 0;

    const transform = pendingZoomTransform || ev?.transform;
    pendingZoomTransform = null;
    if (transform) rootG.attr("transform", transform);

    mapInteracting = false;
    const token = interactionToken;
    svg.classed("map-settling", true);

    // 等浏览器确认 settling 样式后再一次性同步 190 个城市，避免恢复时跳变。
    markerSettleFrame = requestAnimationFrame(() => {
      markerSettleFrame = 0;
      if (token !== interactionToken || mapInteracting) return;
      if (transform) applyZoomStyles(transform.k);
      svg.classed("map-interacting", false);
      restoreMapEffects();

      markerSettleTimer = setTimeout(() => {
        if (token !== interactionToken || mapInteracting) return;
        svg.classed("map-settling", false);
        markerSettleTimer = 0;
      }, MARKER_SETTLE_MS);
    });
  }

  function flushZoomFrame() {
    zoomFrame = 0;
    if (!pendingZoomTransform) return;
    const transform = pendingZoomTransform;
    pendingZoomTransform = null;
    rootG.attr("transform", transform);
    // 手势期间只移动整张地图；贴纸、命中区和文字在 end 时一次性同步。
    if (!mapInteracting) applyZoomStyles(transform.k);
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

    bg.append("g").attr("class", "home-pulse-wrap")
      .append("circle").attr("class", "home-pulse")
      .attr("r", 11).attr("fill", "none")
      .attr("stroke", "#e8606b").attr("stroke-width", 2);

    bg.append("circle").attr("class", "home-core").attr("r", 11.5)
      .attr("fill", "#e8606b").attr("stroke", "#fff8ec").attr("stroke-width", 2.5);

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

  async function setMode(m) {
    if (!BANDS.length || !["best", "rail", "fly", "drive"].includes(m)) return;
    if (m === mode && isoCache.has(isoCacheKey(m))) return isoCache.get(isoCacheKey(m));

    mode = m;
    hideTip();
    updateCitiesForMode(m);

    const requestId = ++modeRequestId;
    const modeSwitch = document.getElementById("mode-switch");
    const cached = isoCache.has(isoCacheKey(m));
    if (!cached) modeSwitch?.setAttribute("aria-busy", "true");

    try {
      const paths = await getIsochrones(m);
      if (requestId !== modeRequestId || mode !== m) return paths;
      replaceIsoLayer(paths, true);
      return paths;
    } catch (error) {
      console.error("[travel-maps] 等时圈计算失败:", error);
      return null;
    } finally {
      if (requestId === modeRequestId) modeSwitch?.removeAttribute("aria-busy");
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
