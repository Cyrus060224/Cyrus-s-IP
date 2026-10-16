export interface CategoryMeta {
  id: string;
  name: string;
  enName: string;
  description: string;
  badgeBg: string;
  badgeColor: string;
}

export const CATEGORIES: Record<string, CategoryMeta> = {
  tech: {
    id: 'tech',
    name: '科技与AI',
    enName: 'Tech & AI',
    description: '前沿智能体、系统底层、架构设计与工程化思考',
    badgeBg: 'rgba(46, 90, 168, 0.12)',
    badgeColor: '#2e5aa8',
  },
  project: {
    id: 'project',
    name: '造物日记',
    enName: 'Build in Public',
    description: '独立开发、开源项目打磨与从 0 到 1 的踩坑记录',
    badgeBg: 'rgba(74, 138, 204, 0.12)',
    badgeColor: '#4a8acc',
  },
  travel: {
    id: 'travel',
    name: '旅行见闻',
    enName: 'Travel & Journey',
    description: '高原、城市与公路，在远行中记录旷野的流动与光影',
    badgeBg: 'rgba(42, 157, 143, 0.12)',
    badgeColor: '#2a9d8f',
  },
  essay: {
    id: 'essay',
    name: '散文随笔',
    enName: 'Essays & Prose',
    description: '关于生活节奏、胶片摄影、书影音与自省的散文片段',
    badgeBg: 'rgba(104, 120, 142, 0.12)',
    badgeColor: '#68788e',
  },
};

export function getCategoryMeta(categoryKey: string): CategoryMeta {
  return CATEGORIES[categoryKey] || {
    id: categoryKey,
    name: categoryKey,
    enName: categoryKey,
    description: '',
    badgeBg: 'rgba(120, 120, 120, 0.12)',
    badgeColor: '#666666',
  };
}
