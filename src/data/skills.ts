/**
 * Skill 注册表 —— /skills/ 页面的唯一接线点。
 *
 * 这里登记「我自己写的 Agent Skill」（Claude Code / Codex 等使用的 SKILL.md 包）。
 * 新增 Skill 只需在此追加一条记录，列表页自动渲染；数组为空时页面显示预告态。
 */

export interface SkillEntry {
  /** 唯一标识，亦可作为未来详情页 slug */
  slug: string;
  /** Skill 名称（通常与 SKILL.md 的 name 一致） */
  name: string;
  /** 一句话说明：解决什么问题、怎么触发 */
  description: string;
  /** shipped:可用；wip:打磨中 */
  status: 'shipped' | 'wip';
  /** 仓库或文档链接（可选） */
  href?: string;
  /** 适用环境等标签，如 ['Claude Code', '设计'] */
  tags?: string[];
  /** 登记日期，YYYY.MM 即可 */
  date?: string;
}

export const skills: SkillEntry[] = [];
