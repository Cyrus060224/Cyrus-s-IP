# Cyrus · Digital Garden (个人数字大本营)

> 探索系统底层、AI 智能体与技术美学的交汇处。

这是 **Cyrus** 的个人独立站点与长文博客源码，基于现代 Astro 静态架构与 Cloudflare Pages 构建，视觉系统全面遵循编辑级设计规范（diagram-design）。

---

## ⚡ 架构特性

- **极致性能**：基于 [Astro](https://astro.build/) 构建，默认零运行时 JavaScript（Zero JS），毫秒级首屏加载。
- **编辑级视觉美学**：
  - 调色与排版对齐 `diagram-design` 规范（米灰纸质底色 `--paper: #f6f6f5` + 典雅炭墨黑 `--ink: #2d3142` + 珊瑚橙点睛 `--accent: #eb6c36`）。
  - 内置深浅色双主题无缝切换（Light Editorial / Dark Minimal）。
  - 配套高清信息架构图表（SVG / PNG 矢量渲染）。
- **零成本全球边缘分发**：代码托管于 GitHub，通过 [Cloudflare Pages](https://pages.cloudflare.com/) 实现全球边缘 CDN 秒级自动部署。

---

## 🚀 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 启动本地开发服务器
npm run dev

# 3. 生产环境构建预览
npm run build
npm run preview
```

---

## 🌐 部署指南 (Cloudflare Pages)

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)，进入 **Workers & Pages**。
2. 点击 **Create application** → **Pages** → **Connect to Git**。
3. 选择关联当前仓库 `Cyrus-s-IP`。
4. 构建预设选择：
   - **Framework preset**: `Astro`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. 点击 **Save and Deploy**，几秒钟后即可获得专属的 `*.pages.dev` 访问链接。
6. 在 **Custom domains** 中一键绑定你的专属自定义域名即可。

---

## 📝 许可与版权

© 2026 Cyrus. Content licensed under CC BY-NC-SA 4.0.
