// 全站微交互:主题切换 / 头部滚动态 / 滚动显现 / scrollspy / 复制按钮

// ---- 主题切换 ----
const toggle = document.getElementById('theme-toggle');
if (toggle) {
  toggle.addEventListener('click', () => {
    const root = document.documentElement;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    localStorage.setItem('theme', next);
  });
}

// ---- 头部滚动态(IO 哨兵,避免 scroll 监听) ----
const header = document.querySelector('.site-header');
const sentinel = document.querySelector('.scroll-sentinel');
if (header && sentinel) {
  new IntersectionObserver(([e]) =>
    header.classList.toggle('scrolled', !e.isIntersecting)
  ).observe(sentinel);
}

// ---- 滚动显现(交错延迟通过 --d 控制) ----
const revealEls = document.querySelectorAll('.reveal');
if (revealEls.length) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
  );
  revealEls.forEach((el) => io.observe(el));
}

// ---- 首页 scrollspy:高亮当前所在区块的导航项 ----
if (header?.dataset.scrollspy) {
  const links = new Map(
    [...header.querySelectorAll('nav a[data-nav]')].map((a) => [a.dataset.nav, a])
  );
  const sections = [...document.querySelectorAll('section[data-spy]')];
  if (sections.length) {
    const spy = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          links.forEach((a) => a.classList.remove('active'));
          links.get(e.target.dataset.spy)?.classList.add('active');
        }
      },
      { rootMargin: '-30% 0px -60% 0px' }
    );
    sections.forEach((s) => spy.observe(s));
  }
}

// ---- 失效外链图片降级(老博客图床部分已失效) ----
document.querySelectorAll('.prose img').forEach((img) => {
  const mark = () => img.classList.add('broken');
  if (img.complete && img.naturalWidth === 0) mark();
  else img.addEventListener('error', mark, { once: true });
});

// ---- 复制按钮(联系方式) ----
document.querySelectorAll('[data-copy]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      btn.classList.add('copied');
      const label = btn.querySelector('[data-copy-label]');
      const original = label?.textContent;
      if (label) label.textContent = '已复制';
      setTimeout(() => {
        btn.classList.remove('copied');
        if (label && original) label.textContent = original;
      }, 1600);
    } catch {
      /* clipboard 不可用时静默 */
    }
  });
});
