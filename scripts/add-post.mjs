/**
 * 新增博客文章 —— 把一篇(或多篇).md 规范化后放入站点。
 *
 * 用法:
 *   npm run add:post -- <文章.md> [更多.md ...]
 *   npm run add:post -- --force <文章.md>     # 覆盖同名已有文章
 *
 * 对来稿的要求:尽量宽松 ——
 *   - frontmatter 可整个省略,或只写一部分
 *   - title 缺省:取正文第一个「# 一级标题」(会从正文移除避免重复),再退回文件名
 *   - date 缺省:当前时间;给了裸时间戳则按中国时区(+08:00)理解
 *   - tags/tag、categories 均可省略;categories 缺省为「未分类」
 *   - 正文可用 <!-- more --> 手动指定摘要截断点,否则自动取前 140 字
 *   - 正文中引用的【相对路径图片】会被复制到 public/blog-assets/<slug>/ 并改写引用
 *
 * 文件名(去掉 .md、空格转 -)即 URL slug:/blog/<slug>/。
 */
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import GithubSlugger from 'github-slugger';
import { toArray, parseChinaDate, buildPostFile } from './lib/post-utils.mjs';

const SITE = path.join(import.meta.dirname, '..');
const DEST_DIR = path.join(SITE, 'src/content/blog');
const ASSET_ROOT = path.join(SITE, 'public/blog-assets');

const args = process.argv.slice(2);
const force = args.includes('--force');
const files = args.filter((a) => a !== '--force');

if (files.length === 0) {
  console.log('用法:npm run add:post -- [--force] <文章.md> [更多.md ...]');
  process.exit(1);
}

/** 复制正文引用的相对路径图片,改写为 /blog-assets/<slug>/xx */
function collectLocalImages(body, srcDir, slug) {
  const copied = [];
  const rewrite = (ref) => {
    if (/^(https?:)?\/\//i.test(ref) || ref.startsWith('/') || ref.startsWith('data:')) {
      return ref; // 外链/绝对路径/内联不动
    }
    const abs = path.resolve(srcDir, decodeURI(ref));
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      console.warn(`  ⚠ 引用的本地图片不存在,保持原样:${ref}`);
      return ref;
    }
    const destDir = path.join(ASSET_ROOT, slug);
    fs.mkdirSync(destDir, { recursive: true });
    let name = path.basename(abs);
    // 同名不同源时加序号防覆盖
    let candidate = path.join(destDir, name);
    let n = 1;
    while (fs.existsSync(candidate) && fs.readFileSync(candidate).length !== fs.readFileSync(abs).length) {
      const ext = path.extname(name);
      candidate = path.join(destDir, `${path.basename(name, ext)}-${n++}${ext}`);
    }
    fs.copyFileSync(abs, candidate);
    copied.push(path.basename(candidate));
    return `/blog-assets/${slug}/${encodeURI(path.basename(candidate))}`;
  };

  let out = body.replace(
    /(!\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g,
    (_, pre, ref, post) => pre + rewrite(ref) + post
  );
  out = out.replace(
    /(<img\b[^>]*\bsrc=")([^"]+)(")/gi,
    (_, pre, ref, post) => pre + rewrite(ref) + post
  );
  return { body: out, copied };
}

let ok = 0;
for (const input of files) {
  const src = path.resolve(input);
  console.log(`\n→ ${input}`);
  if (!fs.existsSync(src)) {
    console.error('  ✕ 文件不存在');
    continue;
  }

  const slug = path.basename(src, '.md').trim().replace(/\s+/g, '-');
  const destFile = path.join(DEST_DIR, `${slug}.md`);
  if (fs.existsSync(destFile) && !force) {
    console.error(`  ✕ 已存在同名文章(${slug}.md),如需覆盖加 --force`);
    continue;
  }

  let parsed;
  try {
    parsed = matter(fs.readFileSync(src, 'utf8'));
  } catch (e) {
    console.error(`  ✕ frontmatter 解析失败:${e.message}`);
    continue;
  }
  const fm = parsed.data ?? {};
  let body = parsed.content.trim();

  // 标题:frontmatter → 首个 H1(并从正文移除)→ 文件名
  let title = fm.title ? String(fm.title).trim() : '';
  if (!title) {
    const h1 = body.match(/^#\s+(.+?)\s*$/m);
    if (h1) {
      title = h1[1].trim();
      body = body.replace(h1[0], '').trim();
    } else {
      title = path.basename(src, '.md').trim();
    }
  }

  const date = parseChinaDate(fm.date) ?? new Date();
  const tags = [...new Set([...toArray(fm.tags), ...toArray(fm.tag)])];
  const categories = toArray(fm.categories).flat();
  if (categories.length === 0) categories.push('未分类');

  const { body: rewritten, copied } = collectLocalImages(body, path.dirname(src), slug);

  fs.mkdirSync(DEST_DIR, { recursive: true });
  fs.writeFileSync(
    destFile,
    buildPostFile({ title, date, author: fm.author, tags, categories, body: rewritten })
  );

  ok++;
  console.log(`  ✓ 已写入 src/content/blog/${slug}.md`);
  console.log(`    标题:${title}`);
  console.log(`    日期:${date.toISOString()} · 分类:${categories.join('、')}`);
  if (copied.length) console.log(`    图片:复制 ${copied.length} 张 → public/blog-assets/${slug}/`);
  // URL 与 Astro glob loader 一致(github-slugger:小写化并剥掉标点)
  console.log(`    上线地址:/blog/${new GithubSlugger().slug(slug)}/`);
}

if (ok > 0) {
  console.log(`\n完成 ${ok}/${files.length} 篇。验证:npm run dev 或 npm run build`);
}
process.exit(ok === files.length ? 0 : 1);
