/**
 * 产品注册表 —— /products/ 页面的唯一接线点，分两个 Section:
 *  · products:「大」产品（独立发布的 App / 开源项目）
 *  · tools:小工具（站内自制，PWA 或独立静态壳）
 *
 * 新增产品：补一条记录 + 把缩略图放进 public/media/products/。
 * 新增小工具：参照 src/pages/tools/punct.astro(PWA)或 public/tools/travel-maps/（静态壳）。
 */

export interface ProductLink {
  label: string;
  href: string;
  icon: 'app-store-logo' | 'github-logo' | 'arrow-up-right';
}

export interface ProductEntry {
  slug: string;
  name: string;
  /** 英文 mono 小标 */
  en: string;
  /** 一句话定位（全角标点） */
  tagline: string;
  /** 产品介绍（全角标点） */
  description: string;
  /** 缩略图（public 路径，方形图标） */
  image: string;
  imageAlt: string;
  links: ProductLink[];
  tags: string[];
  status?: 'shipped' | 'wip';
}

export interface ToolEntry {
  slug: string;
  name: string;
  en: string;
  description: string;
  /** 是否为可安装的 PWA（可添加到手机主屏幕） */
  pwa: boolean;
  status: 'shipped' | 'wip';
  tags?: string[];
  date?: string;
  /** 覆盖默认链接（默认 /tools/<slug>/） */
  href?: string;
  /** 在新标签页打开（独立壳工具，脱离主站导航） */
  newTab?: boolean;
}

export const products: ProductEntry[] = [
  {
    slug: 'comic-manga',
    name: '漫漫书架',
    en: 'COMIC & MANGA',
    tagline: '漫画阅读器与 AI 重绘',
    description:
      '为漫画爱好者打造的 iOS / iPadOS 阅读与收藏 App:个人漫画库与阅读进度追踪、按日漫 / 欧美漫自动切换阅读方向、EPUB / MOBI / AZW3 多格式、SMB / WebDAV 远程书库，还能用 AI 重绘喜欢的画面做成头像和壁纸。',
    image: '/media/products/comic-manga-icon.jpg',
    imageAlt: '漫漫书架 App 图标',
    links: [
      {
        label: 'App Store',
        href: 'https://apps.apple.com/cn/app/id6743392463',
        icon: 'app-store-logo',
      },
      { label: '设计案例', href: '/work/comic-manga/', icon: 'arrow-up-right' },
    ],
    tags: ['iOS / iPadOS', 'SwiftUI', 'AI 重绘'],
  },
  {
    slug: 'mastergo2figma',
    name: 'MasterGo2Figma',
    en: 'PLUGIN SUITE',
    tagline: '把 MasterGo 设计稿完整搬进 Figma',
    description:
      '开源插件套件：MasterGo 端把页面导出为 JSON 包，Figma 端一键还原成可编辑图层；也支持直接解析 .mg 原生文件，大文件走本地 Python 中继流式打包，另附独立 CLI。迁移设计资产不再靠截图。',
    image: '/media/products/mastergo2figma.png',
    imageAlt: 'MasterGo2Figma 图标：设计图层迁移',
    links: [
      {
        label: 'GitHub',
        href: 'https://github.com/XuWeinan123/MasterGo2Figma',
        icon: 'github-logo',
      },
    ],
    tags: ['Figma 插件', 'MasterGo', '开源'],
  },
  {
    slug: 'seal-note',
    name: 'Seal Note',
    en: 'ENCRYPT NOTES',
    tagline: '快速记录，不打断当前工作',
    description:
      'macOS 菜单栏 Markdown 便签：全局快捷键随时唤起悬浮便签；每篇笔记都是标准 Markdown 文件，不锁数据；敏感内容可选端侧 AES-GCM 加密，iCloud Drive 自然同步。SwiftUI + AppKit 原生体验，无账号、无追踪。',
    image: '/media/products/seal-note-icon.png',
    imageAlt: 'Seal Note App 图标',
    links: [
      {
        label: 'GitHub',
        href: 'https://github.com/XuWeinan123/EncryptNotes_for_TRAE',
        icon: 'github-logo',
      },
    ],
    tags: ['macOS', 'Markdown', '端侧加密'],
  },
];

export const tools: ToolEntry[] = [
  {
    slug: 'punct',
    name: '标点修正',
    en: 'PUNCT FIXER',
    description:
      '粘贴中文文案，一键把紧跟在中文后的半角标点 , : ; ! ? 转为全角，并修正含中文的半角括号对。离线可用，适合发文前最后一道校对。',
    pwa: true,
    status: 'shipped',
    tags: ['PWA', '排版', '离线可用'],
    date: '2026.07',
  },
  {
    slug: 'travel-maps',
    name: '出发吧打工人！',
    en: 'TRAVEL MAPS',
    description:
      '一张手账风格的真实等时旅行地图：可切换上海 / 杭州出发地，按高铁 / 飞机 / 驾车算出近 190 个城市的门到门耗时，配水彩等时圈与逐城攻略手账。',
    pwa: false,
    status: 'shipped',
    tags: ['地图', 'D3', '旅行'],
    date: '2026.07',
    href: '/tools/travel-maps/',
    newTab: true,
  },
];
