# portfolio-simple

参考 `portfolio/site` 创建的极简 Astro 5 静态站，用于测试 Cloudflare Pages 的 Git 集成、构建、域名、HTTPS、缓存与响应头配置。

## 本地运行

```bash
npm install
npm run dev
npm run build
npm run preview
```

构建产物位于 `dist/`。

## Cloudflare Pages

如果仓库根目录就是本文件夹：

| 配置 | 值 |
| --- | --- |
| Framework preset | Astro |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node.js version | `22` |

如果这个文件夹位于一个更大的仓库中，还需要将 Root directory 设置为 `portfolio-simple`。

项目保持纯静态输出，不需要 `@astrojs/cloudflare` 适配器。`public/_headers` 会随构建复制到 `dist/_headers`，可用于验证 Cloudflare Pages 自定义响应头。
