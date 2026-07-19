/** 按北京时间格式化为 YYYY.MM.DD(博客原始日期均为中国时区) */
export function formatDate(d: Date): string {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}.${get('month')}.${get('day')}`;
}

export function yearOf(d: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  })
    .format(d)
    .replace(/年/, '');
}
