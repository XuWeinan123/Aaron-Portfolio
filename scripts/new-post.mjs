/**
 * 一键创建文章 —— 类似 hexo new 的交互式入口。
 *
 * 用法:
 *   npm run new                    # 交互式询问「文章名或 .md 路径」
 *   npm run new -- 我的新文章       # 直接给文章名,免交互
 *   npm run new -- ~/draft.md      # 给已有 .md 文件路径 → 导入其内容发布(走 add-post 规范化)
 *   双击仓库根目录的「新建文章.command」亦可(macOS)
 *
 * 行为:
 *   - 输入是存在的 .md 文件 → 交给 scripts/add-post.mjs:frontmatter 规范化、
 *     摘要/阅读时长计算、相对路径图片搬运,一步到位。
 *   - 输入是文章名 → 在 src/content/blog/ 生成规范 frontmatter 的空笔记,直接开写。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';
import GithubSlugger from 'github-slugger';
import { buildPostFile } from './lib/post-utils.mjs';

const SITE = path.join(import.meta.dirname, '..');
const DEST_DIR = path.join(SITE, 'src/content/blog');

let input = process.argv.slice(2).join(' ').trim();

if (!input) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  input = (await rl.question('文章名(或要导入的 .md 文件路径):')).trim();
  rl.close();
}

if (!input) {
  console.error('未输入任何内容,已取消。');
  process.exit(1);
}

// Finder 拖到终端后会生成 Shell 转义路径,例如 foo\ bar.md。
// readline 不会像 Shell 那样解析转义,因此在判断路径前手动还原;
// 只做字符还原,不通过 Shell 执行输入。
function decodeTerminalPath(value) {
  let decoded = value;
  const first = decoded[0];

  if ((first === "'" || first === '"') && decoded.at(-1) === first) {
    decoded = decoded.slice(1, -1);
  }

  return decoded.replace(/\\(.)/gs, '$1');
}

function revealInFinder(file) {
  if (process.platform === 'darwin') {
    spawnSync('open', ['-R', file], { stdio: 'ignore' });
  }
}

// 支持 ~ 开头的路径
const pathInput = decodeTerminalPath(input);
const expanded = pathInput.replace(/^~(?=\/|$)/, process.env.HOME ?? '~');
const asPath = path.resolve(expanded);

if (/\.md$/i.test(expanded) && fs.existsSync(asPath) && fs.statSync(asPath).isFile()) {
  // 路径模式:导入已有 .md 的内容来发布
  console.log(`检测到已有 Markdown 文件,导入发布:${asPath}`);
  const r = spawnSync(process.execPath, [path.join(SITE, 'scripts/add-post.mjs'), asPath], {
    stdio: 'inherit',
  });
  if (r.status === 0) {
    const slug = path.basename(asPath, '.md').trim().replace(/\s+/g, '-');
    revealInFinder(path.join(DEST_DIR, `${slug}.md`));
  }
  process.exit(r.status ?? 1);
}

if (/\.md$/i.test(expanded)) {
  console.error(`✕ 找不到文件:${asPath}`);
  console.error('  如果想创建同名空文章,请去掉 .md 后缀重试。');
  process.exit(1);
}

// 文章名模式:创建空笔记
const title = input;
const slug = title.replace(/\s+/g, '-');
const destFile = path.join(DEST_DIR, `${slug}.md`);

if (fs.existsSync(destFile)) {
  console.error(`✕ 已存在同名文章:src/content/blog/${slug}.md`);
  process.exit(1);
}

fs.mkdirSync(DEST_DIR, { recursive: true });
fs.writeFileSync(
  destFile,
  buildPostFile({
    title,
    date: new Date(),
    author: undefined,
    tags: ['随笔'],
    categories: ['随笔'],
    body: '',
  })
);

console.log(`✓ 已创建空文章:src/content/blog/${slug}.md`);
console.log(`  上线地址:/blog/${new GithubSlugger().slug(slug)}/`);
console.log('  打开文件填写正文即可;分类/标签在 frontmatter 里补充。');
console.log('  验证:npm run dev 或 npm run build');

revealInFinder(destFile);
