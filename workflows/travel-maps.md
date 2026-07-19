# travel-maps · 等时旅行地图 工具档案

「出发吧打工人！」，创意致敬 https://travel-maps.nazha.co/ (原版「从杭州出发」，静态站托管在 Vercel，未找到公开仓库；页面右下角已附致谢链接)。
本站版本位于 `public/tools/travel-maps/`，为独立实现并扩展：**多出发城市**(上海/北京/广州/深圳/杭州，默认上海)+ 逐城攻略手账。纯静态壳，从 /products/ 列表以新标签页打开，**不遵守主站设计规范**(见 AGENTS.md 硬性规则 2)。

手机与桌面的城市密度、图例默认状态、安全区和缩放控件差异见
[`public/tools/travel-maps/RESPONSIVE.md`](../public/tools/travel-maps/RESPONSIVE.md)。

## 出发城市与 URL

- 出发城市通过 `?from=<slug>` 表达(如 `/tools/travel-maps/?from=hangzhou`)，可直接收藏/分享。
- 无参数或参数非法时回落到默认 `shanghai`，并用 `history.replaceState` 把 `?from=` 固化进地址栏。
- 顶栏出发城市是**手账风 dropdown**(`#city-switch`),选项由 `js/app.js` 的 `DEPARTURES` 注册表自动生成——新增出发城市**无需改 HTML**,登记一行即长出新选项。选中 = 换 URL 整页重载(两套数据集独立)。支持键盘(↑↓ 移动、Enter 选、Esc 关、点外部关)。

## 架构(全部本地文件，无任何外部 API)

| 文件 | 说明 |
| --- | --- |
| `index.html` | 页面骨架：顶栏(出发城市切换 + 四种出行方式切换)+ 地图 + 图例 + 攻略侧板 + 底部声明/致谢 |
| `css/style.css` | 手账风样式(纸纹、和纸胶带、水彩色)，以及拖动/缩放时的临时性能模式；字体走 Google Fonts(ZCOOL KuaiLe / Zhi Mang Xing / Noto Serif SC) |
| `js/app.js` | 入口：解析 `?from=` → 选数据集 → 初始化地图；`DEPARTURES` 注册表在此 |
| `js/map.js` | D3 地图引擎：Albers 投影、手绘边界、等时圈栅格采样 + `d3.contours`、城市贴纸、缩放 LOD 与手势性能状态。数据经 `init({ data })` 注入，引擎本身不感知出发城市 |
| `js/iso-worker.js` | 等时圈计算 Worker：在后台线程完成距离场采样与 `d3.contours`，向主线程返回 SVG path；模式结果按视口缓存 |
| `js/panel.js` | 城市手账面板：交通票根对比、推荐理由、景点贴纸、逐日行程 |
| `data/cities.js` | **基础数据源**：`CITY_DATA_HANGZHOU`(190 个目的地城市的完整攻略 + 杭州端交通与接驳常量)。攻略内容(spots/itinerary/tips)为各出发城市共用 |
| `data/cities-shanghai.js` | **上海端覆盖**：`CITY_DATA_SHANGHAI`。只登记每个目的地的 `transport`/`recommend`(+ 可选 hook/tagline/tips/label/minK 覆盖)，攻略内容沿用 cities.js；剔除「上海」。**同时定义共享常量 `HANGZHOU_DEST_BASE`**(杭州作为目的地的内容，各出发城市数据文件共用，故加载顺序上必须先于其他 cities-*.js) |
| `data/cities-beijing.js` `data/cities-guangzhou.js` `data/cities-shenzhen.js` | 北京/广州/深圳端覆盖(`CITY_DATA_BEIJING/GUANGZHOU/SHENZHEN`)，结构同上海版:各自 190 个目的地(全集去掉自己) |
| `data/china.json` | 省级 GeoJSON，来自阿里 DataV GeoAtlas(含南海诸岛/九段线无名要素) |
| `vendor/d3.min.js` | D3 v7 |

## 缩放与 LOD(map.js)

- 缩放范围 `scaleExtent [0.5, 18]`;右下角有缩放控件(放大/缩小/恢复 100%,内联 Phosphor Icons SVG),城市详情 panel 打开时自动隐藏(CSS 兄弟选择器)。
- LOD 三档(`applyZoomStyles`):`k < 0.85` 全部地点缩成小图标(无文字);`0.85 ≤ k < 1.8` 只显示名称;`k ≥ 1.8` 名称 + 耗时。`minK` 城市仍需放大到 `minK` 才展开。
- 反向缩放:图标屏幕尺寸 = `sqrt(k)`(温和放大),文本恒定屏幕大小(`scale(1/k)` 反向抵消),放大后不占地。
- 拖动/缩放事件按 `requestAnimationFrame` 合帧，手势期间只更新地图根 transform；城市贴纸反向缩放与 LOD 延后到 `zoom end` 一次完成，贴纸用 180ms 过渡恢复，名称/耗时在交互时淡出、结束后按最终 LOD 淡入。
- 手势开始后用 90ms 将阴影、Home 光环、色带视觉强度和边界扰动淡出，再停用省界 SVG 滤镜、色带混合模式与贴纸阴影；手势结束时先以零强度重新接回，再用 180ms 恢复。该策略同时作用于触屏和桌面鼠标/触控板，`prefers-reduced-motion` 下直接跳变。
- 等时色带保留配色与分带，但不再使用 `feTurbulence + feDisplacementMap + feGaussianBlur` 水彩滤镜；这是常驻性能取舍，不随手势恢复。
- 贴纸 transform 三层分工:`.sticker-zoom`(缩放反比例,跟手不过渡)> `.sticker-lod`(LOD 折叠,250ms 过渡)> `.sticker-bg`(hover 恒 1.18 倍)。**不要把缩放值写进 `.sticker-bg` 的 transform 属性**——CSS hover 会整体替换它。
- 模式切换:城市节点原地更新，不克隆或重建 `.layer-cities`;等时圈由 `iso-worker.js` 后台计算并缓存，只让约十条新旧等时 path 做 300ms 交叉溶解。出发城市切换:离场 body 淡出 200ms(app.js)+ 到场 `.root` fade-in 动画 450ms。全部动效在 `prefers-reduced-motion` 下禁用。

## 等时圈模型(map.js)

`T(任意点) = min over 锚点城市( 该方式门到门耗时 + 剩余距离按 65km/h 驾车 )`，
在像素栅格上采样后用 `d3.contours` 取等值面，按 2/4/6/8/12 小时分带上色。

## 数据结构

目的地完整结构(cities.js，新增目的地照此填):

```js
{
  id: "slug", name: "城市名", emoji: "🏔", sub: "一句副标",
  coord: [经度, 纬度],
  minK: 1.6,                    // 可选：贴近出发地的小城，缩放 ≥ minK 才展开标签
  label: { dx, dy, anchor },    // 可选：密集区标签偏移
  hook: "悬浮提示一句话", tagline: "「面板开场白」",
  transport: {
    rail:  { title, breakdown, price, veh, arr, dep? },  // veh=乘车分钟 arr=到站→市中心分钟 dep 可覆盖出发端接驳
    fly:   { title, breakdown, price, veh, arr, dep? },  // 无该方式填 null
    drive: { title, breakdown, veh },
  },
  recommend: { mode: "rail|fly|drive", reason: "推荐理由" },
  spots: [{ emoji, name }, ...],            // 5-6 个
  itinerary: [{ day: "DAY 1", route: [...], note }, ...],
  tips: "小贴士",
}
```

上海端覆盖结构(cities-shanghai.js 的 `T` 表，每城一条):

```js
  slug: {
    transport: { rail, fly, drive },        // 结构同上，上海端数值
    recommend: { mode, reason },            // 以上海视角重写
    // 可选覆盖(仅当原条目文案含出发地视角时)：hook / tagline / tips / label / minK
  },
```

门到门耗时由各数据文件头部的接驳常量自动合成。杭州端:`toRail 35 + railBuf 25`、`toAir 45 + airBuf 90`;上海端:`toRail 40(虹桥) + railBuf 25`、`toAir 50(两场折中) + airBuf 90`,fly 的 `dep` 覆盖口径:浦东国内 150、港澳台/国际经浦东 180。驾车超 4 小时每 2 小时加 15 分休息。

## 新增出发城市工作流

1. 新建 `data/cities-<slug>.js`,照 `cities-shanghai.js` 的骨架:出发端接驳常量、`T` 覆盖表(**必须覆盖全部 190 个目的地**,组装时缺谁 console.warn 谁)、把旧出发城市补成目的地、剔除自己。
2. `index.html` 加 `<script>`;`js/app.js` 的 `DEPARTURES` 注册一行(`{ data: () => CITY_DATA_XXX, emoji: "…" }`)——**下拉选项自动生成,不用动 HTML**。
3. 攻略文案里的出发地视角(「返程」已中性化;tagline/hook/tips 若提旧出发地)用覆盖字段处理。
4. 自测:node 侧把两个数据文件 eval 后核对城市数/doorToDoor 无异常,浏览器里过四种模式 + 面板 + `?from=` 回落。

## 信息来源口径(增补城市沿用)

- 高铁时刻/票价：`trains.ctrip.com`(区间页)、`shike.gaotie.cn`、`gaotie.cn`
- 航班航线/时长：机场官网航线表、`flights.ctrip.com/schedule/`、天巡 `tianxun.com/routes/`
- 新线开通与最快时分：政府/官媒新闻稿(people.com.cn、thepaper.cn、gov.cn 各级)、维基百科线路条目、百度百科车次条目
- 驾车里程/时长：地图导航估算
- 口径：**2024-2026 真实时刻表的研究性整理，非实时**；页脚已声明以 12306/航司/地图 App 为准
- 新增城市时把出处以块注释附在该批城市数据末尾

## 注意

- **dev 服务器不解析 `public/` 目录索引**：`npm run dev` 下 `/tools/travel-maps/` 会 404,需访问 `/tools/travel-maps/index.html`;`npm run build` + preview 与线上(Cloudflare Pages)目录 URL 均正常,工具卡链接保持干净 URL 不动
- 工具内文案(半角标点、单个 em-dash)是原站风格,**不跑 `fix:punct`**、不套主站排版规则
- `data/*.js` 与 `data/china.json` 是数据文件,改动需整体自测:出发城市切换、四种模式切换、点城市开面板、缩放 LOD
