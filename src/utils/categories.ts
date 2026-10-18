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
    name: '科技与 AI',
    enName: 'Tech & AI',
    description: '前沿智能体、系统底层、架构设计与工程化思考',
    badgeBg: 'rgba(143, 196, 255, 0.12)',
    badgeColor: '#8FC4FF',
  },
  project: {
    id: 'project',
    name: '项目手记',
    enName: 'Project Notes',
    description: '独立开发、开源项目打磨与从 0 到 1 的踩坑记录',
    badgeBg: 'rgba(122, 162, 207, 0.12)',
    badgeColor: '#7AA2CF',
  },
  travel: {
    id: 'travel',
    name: '旅行见闻',
    enName: 'Travel & Journey',
    description: '高原、城市与公路，在远行中记录旷野的流动与光影',
    badgeBg: 'rgba(138, 148, 163, 0.12)',
    badgeColor: '#8A94A3',
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
