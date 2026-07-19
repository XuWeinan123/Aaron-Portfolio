/* ============================================================
   城市手账面板：交通票根对比 + 推荐理由 + 景点贴纸 + 行程攻略
   ============================================================ */

const CityPanel = (() => {

  const MODE_META = {
    rail:  { icon: "🚄", name: "高铁" },
    fly:   { icon: "🛫", name: "飞机" },
    drive: { icon: "🚗", name: "驾车" },
  };

  function fmt(min) { return TravelMap.fmtMin(min); }

  function ticketHTML(city, key) {
    const leg = city.transport[key];
    const d2d = city.doorToDoor[key];
    if (!leg) {
      return `<div class="ticket unavailable">
        <span class="tk-icon">${MODE_META[key].icon}</span>
        <div class="tk-main">
          <div class="tk-name">${MODE_META[key].name}</div>
          <div class="tk-detail">这条线路不适合 / 无直达，就别勉强啦</div>
        </div><span class="tk-time">—</span></div>`;
    }
    const isReco = key === city.recommend.mode;
    return `<div class="ticket ${isReco ? "recommended" : ""}">
      ${isReco ? `<span class="tk-badge">⭐ 推荐</span>` : ""}
      <span class="tk-icon">${MODE_META[key].icon}</span>
      <div class="tk-main">
        <div class="tk-name">${MODE_META[key].name} <span style="font-weight:normal;font-size:11px;color:#7a6a58">${leg.title}</span></div>
        <div class="tk-detail">${leg.breakdown}</div>
      </div>
      <div>
        <div class="tk-time">${fmt(d2d)}</div>
        ${leg.price ? `<div class="tk-price">${leg.price}</div>` : ""}
      </div>
    </div>`;
  }

  function render(city) {
    const el = document.getElementById("panel-content");

    const tickets = ["rail", "fly", "drive"].map(k => ticketHTML(city, k)).join("");

    const spots = city.spots.map(s =>
      `<span class="spot-sticker"><span class="sp-emoji">${s.emoji}</span>${s.name}</span>`
    ).join("");

    const days = city.itinerary.map(d => `
      <div class="day-block">
        <span class="day-tag">${d.day}</span>
        <div class="day-route">${d.route.map(r => `<span>${r}</span>`).join(`<span class="rt-arrow">→</span>`)}</div>
        ${d.note ? `<div class="day-note">✎ ${d.note}</div>` : ""}
      </div>`).join("");

    el.innerHTML = `
      <div class="pj-head">
        <span class="pj-emoji">${city.emoji}</span>
        <div>
          <h2>${city.name}</h2>
          <span class="pj-sub">${city.sub || ""}</span>
        </div>
      </div>
      <p class="pj-tagline">「${city.tagline}」</p>

      <div class="pj-section-title">🎫 怎么去？（门到门实算）</div>
      ${tickets}
      <div class="pj-reco">💡 <b>为什么推荐${MODE_META[city.recommend.mode].name}：</b>${city.recommend.reason}</div>

      <div class="pj-section-title">📍 经典打卡</div>
      <div class="spot-wall">${spots}</div>

      <div class="pj-section-title">🗺 路线攻略 · ${city.itinerary.length}日玩法</div>
      ${days}

      ${city.tips ? `<div class="pj-tips"><b>🌟 小贴士</b><br>${city.tips}</div>` : ""}
    `;

    document.getElementById("panel").classList.remove("hidden");
    document.querySelector(".panel-paper").scrollTop = 0;
  }

  function close() { document.getElementById("panel").classList.add("hidden"); }

  return { render, close };
})();
