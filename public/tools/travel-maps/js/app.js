/* ============================================================
   应用入口：解析出发城市（URL ?from=）、加载数据、绑定交互
   ============================================================ */

(async function main() {
  // 出发城市注册表：新增出发地 → 加一个 data/cities-<slug>.js，在此登记一行即可
  // （下拉选项由此表生成，无需再改 HTML）。emoji 可选，缺省用 📍。
  const DEPARTURES = {
    shanghai: { data: () => CITY_DATA_SHANGHAI, emoji: "🌆" },
    hangzhou: { data: () => CITY_DATA_HANGZHOU, emoji: "🌿" },
  };
  const DEFAULT_FROM = "shanghai";

  const param = new URLSearchParams(location.search).get("from");
  const from = Object.prototype.hasOwnProperty.call(DEPARTURES, param) ? param : DEFAULT_FROM;
  const data = DEPARTURES[from].data();

  // 出发城市固化进网址，收藏/分享即可直达
  const want = `?from=${from}`;
  if (location.search !== want) history.replaceState(null, "", want + location.hash);

  document.title = `出发吧打工人 · 从${data.home.name} · 旅行手账地图`;
  const legendHome = document.getElementById("legend-home");
  if (legendHome) legendHome.textContent = data.home.name;

  // 出发城市切换：手账风 dropdown。选项由注册表生成，选中即换 URL 整页加载
  buildCityDropdown(DEPARTURES, from);

  const geojson = await fetch("data/china.json").then(r => r.json());

  await TravelMap.init({
    container: "#map",
    geojson,
    data,
    onSelect: city => CityPanel.render(city),
  });

  // 出行方式切换
  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      TravelMap.setMode(btn.dataset.mode);
    });
  });

  // 缩放控件
  document.getElementById("zoom-in").addEventListener("click", () => TravelMap.zoomBy(1.6));
  document.getElementById("zoom-out").addEventListener("click", () => TravelMap.zoomBy(1 / 1.6));
  document.getElementById("zoom-reset").addEventListener("click", () => TravelMap.zoomReset());

  // 关闭面板
  document.getElementById("panel-close").addEventListener("click", CityPanel.close);
  document.addEventListener("keydown", e => { if (e.key === "Escape") CityPanel.close(); });

  /* ---- 出发城市 dropdown（选项来源 = DEPARTURES 注册表） ---- */
  function buildCityDropdown(registry, current) {
    const btn = document.getElementById("city-dd-btn");
    const label = document.getElementById("city-dd-label");
    const menu = document.getElementById("city-dd-menu");
    if (!btn || !menu) return;

    const entries = Object.entries(registry);
    label.textContent = `从${registry[current].data().home.name}`;

    menu.innerHTML = "";
    const opts = entries.map(([slug, def]) => {
      const li = document.createElement("li");
      li.className = "city-dd-opt";
      li.dataset.from = slug;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(slug === current));
      li.tabIndex = -1;
      li.innerHTML =
        `<span class="opt-emoji">${def.emoji || "📍"}</span>` +
        `<span class="opt-name">从${def.data().home.name}</span>` +
        `<span class="opt-check" aria-hidden="true">✓</span>`;
      const go = () => {
        if (slug === current) { close(); return; }
        // 离场淡出后再跳转;到场淡入由 map.js init 负责。减动效时直接跳
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          location.href = `?from=${slug}`; return;
        }
        document.body.classList.add("page-leave");
        setTimeout(() => { location.href = `?from=${slug}`; }, 200);
      };
      li.addEventListener("click", go);
      menu.appendChild(li);
      return li;
    });

    const isOpen = () => menu.classList.contains("open");
    const open = () => {
      menu.classList.add("open"); btn.setAttribute("aria-expanded", "true");
      (opts.find(o => o.dataset.from === current) || opts[0])?.focus();
    };
    const close = () => {
      menu.classList.remove("open"); btn.setAttribute("aria-expanded", "false");
    };
    const toggle = () => (isOpen() ? close() : open());

    btn.addEventListener("click", e => { e.stopPropagation(); toggle(); });
    document.addEventListener("click", e => {
      if (isOpen() && !document.getElementById("city-switch").contains(e.target)) close();
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && isOpen()) { close(); btn.focus(); } });

    // 方向键在选项间移动，Enter/Space 触发
    menu.addEventListener("keydown", e => {
      const i = opts.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); opts[Math.min(i + 1, opts.length - 1)].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); opts[Math.max(i - 1, 0)].focus(); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); document.activeElement.click(); }
    });
  }
})();
