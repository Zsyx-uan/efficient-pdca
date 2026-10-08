import { emptyGarden, newBook, newCard, normalizeGarden } from '../src/gardenModel.ts';
import { parseMarkdownDocument } from '../src/markdownArchive.ts';
import { applyImport } from '../src/gardenModel.ts';
export const markdown = '# 测试资料\n\n## 核心原则\n\n### 反馈循环\n先设定目标，执行后用反馈校准。\n\n## 实践应用\n\n### 每周复盘\n记录真实的使用场景与改进方向。\n\n## 来源\n\n- 测试资料，不包含用户数据';
export function fixture() {
  const g = applyImport(emptyGarden(), parseMarkdownDocument(markdown), { title: '测试资料', author: '隔离测试作者', category: '学习' });
  return normalizeGarden(g, true);
}
export function independentCard(title = '独立快速笔记') { return { ...newCard(), title, insight: '用户自己的理解', updatedAt: '2026-10-08T08:00:00.000Z' }; }
export function manualBook() { return { ...newBook(), title: '手工资料', sections: [{ id: 'manual-section', title: '我的章节', body: '保留手工正文', kind: 'other', level: 2, order: 0, origin: 'manual' }] }; }
