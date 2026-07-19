#!/bin/zsh
# 双击即可新建博客文章(macOS)。询问文章名或 .md 路径,详见 scripts/new-post.mjs。
cd "$(dirname "$0")"
node scripts/new-post.mjs
echo ""
read -k 1 "?按任意键关闭窗口…"
