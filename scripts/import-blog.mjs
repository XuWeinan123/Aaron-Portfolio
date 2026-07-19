/**
 * 一次性导入 Hexo 博客文章 → Astro content collection。
 *
 * ⚠️ 会重建 src/content/blog/ 整个目录。日常新增单篇请用 add-post.mjs
 *   (npm run add:post),不要手改 src/content/blog/ 下的文件。
 *
 * 处理的差异:
 * - frontmatter 键名 `tag` / `tags` 混用 → 统一为 `tags`
 * - `categories` 统一为数组
 * - 裸时间戳按中国时区(+08:00)解析,统一为 ISO
 * - `<!-- more -->` 之前的内容 → excerpt(纯文本化截断)
 * - 估算中文阅读时长(分钟)
 */
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { toArray, parseChinaDate, buildPostFile } from './lib/post-utils.mjs';

const SRC = '/Users/aaronxu/Library/Mobile Documents/com~apple~CloudDocs/Share/xuweinanblog/source/_posts';
const DEST = path.join(import.meta.dirname, '../src/content/blog');

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.md'));
let ok = 0;
const problems = [];

for (const file of files) {
  const raw = fs.readFileSync(path.join(SRC, file), 'utf8');
  let parsed;
  try {
    parsed = matter(raw);
  } catch (e) {
    problems.push(`${file}: frontmatter 解析失败:${e.message}`);
    continue;
  }
  const fm = parsed.data ?? {};
  const body = parsed.content.trim();

  const title = String(fm.title ?? file.replace(/\.md$/, '')).trim();
  const date = parseChinaDate(fm.date);
  if (!date) {
    problems.push(`${file}: 日期缺失或无法解析(${fm.date})`);
    continue;
  }
  const tags = [...new Set([...toArray(fm.tags), ...toArray(fm.tag)])];
  const categories = toArray(fm.categories).flat();

  const out = buildPostFile({ title, date, author: fm.author, tags, categories, body });
  fs.writeFileSync(path.join(DEST, file), out);
  ok++;
}

console.log(`导入完成:${ok}/${files.length} 篇`);
if (problems.length) {
  console.log('存在问题的文章:');
  for (const p of problems) console.log('  - ' + p);
}
