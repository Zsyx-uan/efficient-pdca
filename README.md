# 知知 · Knowledge Garden

一个可部署到 **GitHub Pages** 的个人知识花园。它是一个无需服务器的静态 Web 应用：书籍、知识卡片和个人洞见默认保存在浏览器的 `localStorage` 中，所有数据只归你自己控制。

## 已实现

- 数字书架：新建、浏览和检索书籍。
- 知识卡片：沉淀原文、个人理解、应用场景和标签。
- 知识地图：可视化展示核心概念之间的关系。
- 本地知识助手：在当前卡片中检索并组织回答（不发送数据到第三方）。
- 离线优先：浏览器内自动保存；支持导出 JSON 备份。
- 响应式界面：桌面与手机均可使用。

## 运行

```bash
npm install
npm run dev
```

## GitHub Pages

项目内置 GitHub Actions 部署工作流。推送到 `main` 后，在仓库 **Settings → Pages** 中将 Source 设为 **GitHub Actions**。

> GitHub Pages 只能托管静态网站。因此本版本不含服务端 PDF 解析、用户账户或安全的真实 AI API。请勿把 API Key 写进前端；需要云端 AI 时建议另加 Cloudflare Workers 或 Supabase Edge Functions。
