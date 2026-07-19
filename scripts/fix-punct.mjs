/**
 * 中文排版修正:将紧跟在 CJK 字符后的半角标点转为全角。
 * 只处理站点源码中我方撰写的文案,不触碰导入的博客内容。
 */
import fs from 'node:fs';

const files = process.argv.slice(2);
const CJK = /[　-ヿ㐀-鿿豈-﫿！-｠「」『』…—·]/;
const MAP = { ',': '，', ':': '：', ';': '；', '!': '！', '?': '？' };

for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (MAP[ch] && i > 0 && CJK.test(src[i - 1])) {
      out += MAP[ch];
    } else {
      out += ch;
    }
  }
  // 内容含 CJK 的半角括号对 → 全角
  out = out.replace(/\(([^()\n]*)\)/g, (m, inner) =>
    CJK.test(inner) ? `（${inner}）` : m
  );
  if (out !== src) {
    fs.writeFileSync(file, out);
    console.log('fixed:', file);
  }
}
