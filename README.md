# 徐炜楠个人网站 · xuweinan.com

UX Engineer 作品集 + 站内博客 + Skill / 产品集。基于 [Astro 5](https://astro.build) 静态生成,视觉语言延续手搓原型(oklch 色系 · Inter + JetBrains Mono · 编辑部风格),博客一次性导入自本地 Hexo 文件夹,部署在 Cloudflare Pages 并绑定 [xuweinan.com](https://www.xuweinan.com)。

## 本地运行

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # 产物在 dist/,纯静态
npm run preview    # 本地预览构建产物
```

## Cloudflare Pages 部署

监听 `main` 分支,push 即自动构建部署。

| 配置 | 值 |
| --- | --- |
| Framework preset | Astro |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node.js version | `22`(见 `.node-version`) |

纯静态输出,不需要 `@astrojs/cloudflare` 适配器。`public/_headers` 随构建复制到 `dist/_headers`,用于自定义响应头。

## 站点结构

| 路由 | 内容 |
| --- | --- |
| `/` | 长滚动首页:Hero → 关于 → 经历 → 能力 → 实验性项目 → 精选案例 → 博客 → 联系我 |
| `/work/followup-ai/` | 案例:Followup.AI(B 端 SaaS / 设计系统 / AI Agent / Playbook) |
| `/work/comic-manga/` | 案例:漫漫书架 Comic&Manga(ComfyUI / design-to-code) |
| `/work/ai-design-system/` | 长案例:复合设计系统(15 个分幕) |
| `/work/other/` | 其他作品:Figma 插件 / 技术分享 / 动效设计 |
| `/blog/` | 博客列表(按年分组 + 分类筛选) |
| `/blog/<slug>/` | 文章详情(105 篇,含 2015–2026 全部存量文章,已对照旧站校验无遗漏) |
| `/skills/` | 自写 Agent Skill 列表(注册表:`src/data/skills.ts`) |
| `/products/` | 自研产品与小工具(注册表:`src/data/products.ts`;`/tools/` 旧地址自动重定向) |
| `/tools/punct/` | PWA 小工具「标点修正」:可添加到手机主屏幕,离线可用 |
| `/design/` | 活体样式指南:全部 Design Token(双主题实时对照)+ 全局组件实渲染 |

深浅色主题:右上角切换,跟随系统偏好,localStorage 记忆。
微交互:滚动显现、scrollspy、阅读进度条、复制按钮、hover 位移;`prefers-reduced-motion` 全部降级;URL 加 `?qa` 可跳过入场动画(视觉回归用)。

## 写文章

```bash
npm run new                # 询问文章名 → 生成空笔记(类似 hexo new)
npm run new -- 文章名       # 免交互
npm run new -- ~/draft.md  # 给 .md 路径 → 导入内容发布(规范化 frontmatter、搬运图片)
```

macOS 下也可以直接双击仓库根目录的 `新建文章.command`。更多细节见 [workflows/add-post.md](workflows/add-post.md)。

### 全量重导旧博客

```bash
npm run import:blog
```

从 `~/Library/Mobile Documents/com~apple~CloudDocs/Share/xuweinanblog/source/_posts` 读取全部 Hexo 文章,规范化 frontmatter(`tag`/`tags` 统一、裸时间戳按中国时区 +08:00 解析、`<!-- more -->` 提取摘要、估算阅读时长)后写入 `src/content/blog/`。已导入 105 篇;后续有新文章重跑一次即可(目标目录会重建,不要手改其中文件)。

已知限制:2017 年前后的老文章图片托管在新浪图床,源站已失效,站内做了降级占位样式(全站已设 `no-referrer` 尽量放行防盗链)。

## 项目规则

AI 上手必读:[AGENTS.md](AGENTS.md)(`CLAUDE.md` 指向同一文件)。

## ⚠️ 媒体占位待替换

Figma MCP 未授权,图片无法导出。所有图位以斜纹占位组件(`MediaSlot`)落位,页面上标注了节点 ID。从 Figma 文件 `Playground`(key `cpxGuEaNoMIHF4IZcmbUfx`)导出后替换:

**替换方式**:在 Figma 用节点 ID 定位画板(URL 的 `node-id` 把冒号换成短横线,如 `539:8738` → `node-id=539-8738`);按标注比例导出(建议 2x);存入 `public/media/`(建议按节点命名,如 `539-8738.png`,同一节点复用于两处的只需导出一次);把对应 `<MediaSlot … />` 换成 `<img src="/media/539-8738.png" alt="…" />`,或保留组件外壳自行扩展。

共 39 处代码位置、34 个独立 Figma 节点(其中 2 个各复用于 2 处)、3 处需自备脱敏截图(无 Figma 节点)。

<details>
<summary>展开完整清单(按页面分组,含代码行号)</summary>

**首页 Hero & About** —— `/`

| 用途 | 节点 | 比例 | 代码位置 |
| --- | --- | --- | --- |
| 个人头像 | `539:8624` | 4/5 | `src/pages/index.astro:150` |

**Followup.AI 案例** —— `/work/followup-ai/`

| 用途 | 节点 | 比例 | 代码位置 |
| --- | --- | --- | --- |
| Followup.AI 产品概览截图 | `539:8738` | 16/9 | `followup-ai.astro:92`(同图另用于首页精选卡,`data/cases.ts:63`) |
| Foundation Builder 全景截图 | `539:8772` | 16/9 | `followup-ai.astro:161` |
| Design Library 组件视觉 | `539:8904` | 4/3 | `followup-ai.astro:192` |
| Variables / Color Token 视觉 | `539:8919` | 4/3 | `followup-ai.astro:195` |
| Automation 工作流视觉 | `539:9040` | 21/9 | `followup-ai.astro:231` |
| Playbook UI 视觉 | `539:8959` | 21/9 | `followup-ai.astro:382`(聊天界面已按内容重建,此图为补充) |

**漫漫书架 Comic&Manga 案例** —— `/work/comic-manga/`

| 用途 | 节点 | 比例 | 代码位置 |
| --- | --- | --- | --- |
| App 截图 · 书架 | `539:9342` | 4/3 | `comic-manga.astro:76`(同图另用于首页精选卡,`data/cases.ts:79`) |
| App 截图 · 阅读 | `539:9343` | 4/3 | `comic-manga.astro:78` |
| App 截图 · AI 重绘 | `539:9344` | 4/3 | `comic-manga.astro:81` |
| iPad 实机视觉 | `539:9296` | 4/3 | `comic-manga.astro:121` |
| iPad 视觉 · 书页 | `539:9299` | 1/1 | `comic-manga.astro:123` |
| iPad 视觉 · 收藏 | `539:9302` | 1/1 | `comic-manga.astro:124` |
| 设计过程视觉 | `539:9284` | 4/3 | `comic-manga.astro:175` |
| 组件拆分视觉 | `539:9286` | 4/3 | `comic-manga.astro:177` |
| ComfyUI 工作流全景 | `539:9226` | 21/9 | `comic-manga.astro:210` |
| 输出 · 上色 | `539:9250` | 3/4 | `comic-manga.astro:213` |
| 输出 · 风格化 | `539:9254` | 3/4 | `comic-manga.astro:215` |
| 输出 · 转绘真人 | `539:9256` | 3/4 | `comic-manga.astro:218` |
| AI 工具截图 · UX Pilot | `539:9211` | 16/10 | `comic-manga.astro:52`(数据)/ `:259`(渲染) |
| AI 工具截图 · Dify | `539:9214` | 16/10 | 同上 |
| AI 工具截图 · Deep Research | `539:9217` | 16/10 | 同上 |

**其他作品** —— `/work/other/`

| 用途 | 节点 | 比例 | 代码位置 |
| --- | --- | --- | --- |
| 作品概览视觉 A | `539:9165` | 16/10 | `other.astro:18` |
| 作品概览视觉 B | `539:9167` | 16/10 | `other.astro:20` |
| Figma 插件视觉 | `539:9154` | 16/10 | `other.astro:41` |
| 分享现场视觉 | `539:9138` | 16/9 | `other.astro:64` |
| 站内数据 A | `539:9142` | 4/3 | `other.astro:66` |
| 站内数据 B | `539:9143` | 4/3 | `other.astro:67` |
| 动效示例 1–6 | `539:9121`–`539:9126` | 1/1 | `other.astro:84`(数据)/ `:87`(渲染) |

**AI 设计系统长案例** —— `/work/ai-design-system/`

| 用途 | 节点 | 比例 | 代码位置 |
| --- | --- | --- | --- |
| 结果示例 A · 仪表盘 Dashboard | 无(自备脱敏截图) | 4/5 | `ai-design-system.astro:705`(`results` 第 1 项) |
| 结果示例 B · 数据表 Data Table | 无(自备脱敏截图) | 4/5 | 同上,第 2 项 |
| 结果示例 C · 表单与详情 Form & Detail | 无(自备脱敏截图) | 4/5 | 同上,第 3 项 |

</details>

> `/design/` 页面里也有一个 `MediaSlot` 示例(`node="000:0000"`),那是样式指南的演示占位,不是真实待替换项。
