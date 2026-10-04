#!/usr/bin/env node
/**
 * Agent Notes 门禁 —— 目录树、头部状态、章节骨架、替代方案与相对链接检查。
 *
 * 移植自 DeepSeek Harness (dsh) 的 agent-note-tree.ts + verify-agent-note-format.ts，
 * 按本仓库适配：单文件中文（无 .zh.md / i18n 伴随记录）、规范章节名固定为中文、
 * 无 grandfather 豁免、无归档哈希封存（见 .agents/notes/README.md § 与 dsh 的差异）。
 *
 * 规则的权威来源是 .agents/notes/README.md；本脚本只做机械可判定的部分，
 * 「变更是否平凡」由 review 判断，不在此分类。
 *
 * 零依赖，Node >= 18。用法：npm run verify:notes
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const notesRoot = join(repoRoot, '.agents/notes');

/** 生命周期（顶层文件夹，封闭集合）。archived/ 单列：仅存放已实施后归档的记录。 */
const LIFECYCLES = ['proposed', 'implemented', 'rejected'];
const ARCHIVE = 'archived';

/** 类别（次级文件夹，封闭集合）。新增类别须同步更新本列表与 README § 分类。 */
const CLASSES = ['feature', 'bug-fix', 'simplification', 'architecture', 'process', 'testing'];

/** 允许直接放在生命周期根目录的非 Note 文件。 */
const ROOT_ALLOWLIST = new Set(['AGENTS.md']);

/** 首章节（全文档通用）。 */
const OPENER = '## 问题';

/** 各生命周期必备章节（须与 README § 文件格式 逐字一致）。`## 曾考虑的替代方案`
 * 由下方专项检查覆盖（报错信息更具体），不重复列入。 */
const REQUIRED = {
  proposed: [OPENER, '## 提案', '## 验收标准', '## 风险'],
  implemented: [OPENER, '## 决策', '## 后果'],
  rejected: [OPENER, '## 提案'],
};
const REQUIRED_ARCHIVED = REQUIRED.implemented;

/** implemented（及 archived）禁用的提案期章节：事实已交付，规格用语须折入决策/后果。 */
const BANNED_IMPLEMENTED = /^## (?:提案|计划|迁移计划|验收标准)(?:\s|$)/;

/** 第 3 行 Status: 的语法，按文件夹交叉校验。 */
const STATUS = {
  proposed: { re: /^Status: proposed$/, hint: '`Status: proposed`' },
  implemented: { re: /^Status: implemented$/, hint: '`Status: implemented`' },
  rejected: { re: /^Status: rejected — .+$/, hint: '`Status: rejected — <一行原因>`' },
  archived: { re: /^Status: implemented$/, hint: '`Status: implemented`（归档不改状态）' },
};

const errors = [];
const fail = (kind, file, msg) => errors.push(`${kind}: ${file} — ${msg}`);

// ---------------------------------------------------------------------------
// 1. 目录树
// ---------------------------------------------------------------------------

if (!existsSync(notesRoot)) {
  console.error('verify-agent-notes: 缺少 .agents/notes/ 目录');
  process.exit(1);
}

for (const entry of readdirSync(notesRoot, { withFileTypes: true })) {
  if (entry.name === 'INDEX.md') {
    fail('structure', entry.name, '集中式 INDEX.md 被禁止——浏览生命周期/类别目录树或全仓库搜索');
    continue;
  }
  if (entry.isDirectory() && !LIFECYCLES.includes(entry.name) && entry.name !== ARCHIVE) {
    fail('structure', `${entry.name}/`, `未知生命周期文件夹（允许：${LIFECYCLES.join(', ')}，外加 ${ARCHIVE}/）`);
  }
}

/** 递归收集 dir 下的 .md 文件（相对 prefix，正斜杠）。 */
function walkMd(dir, prefix) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walkMd(join(dir, e.name), rel));
    else if (e.isFile() && e.name.endsWith('.md')) out.push(rel);
  }
  return out.sort();
}

const SLUG = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

/** @type {{lifecycle: string, rel: string, abs: string}[]} */
const notes = [];

for (const lifecycle of [...LIFECYCLES, ARCHIVE]) {
  for (const rel of walkMd(join(notesRoot, lifecycle), lifecycle)) {
    const segs = rel.split('/');
    // 生命周期根目录的白名单文件（如 implemented/AGENTS.md）。
    if (segs.length === 2 && ROOT_ALLOWLIST.has(segs[1])) continue;
    const cls = segs[1];
    const base = segs[2];
    if (segs.length !== 3 || !cls || !base) {
      fail('structure', rel, `层级应为 {lifecycle}/{class}/yyyy-mm-dd-slug.md（当前 ${segs.length} 层）`);
      continue;
    }
    if (!CLASSES.includes(cls)) {
      fail('structure', rel, `未知类别 "${cls}"（允许：${CLASSES.join(', ')}）`);
      continue;
    }
    if (!SLUG.test(base)) {
      fail('structure', rel, '文件名须为 yyyy-mm-dd-topic.md，slug 用 ASCII 小写连字符');
      continue;
    }
    notes.push({ lifecycle, rel, abs: join(notesRoot, rel) });
  }
}

// ---------------------------------------------------------------------------
// 2. 文件格式
// ---------------------------------------------------------------------------

/** 统一行尾为 LF：Windows 检出（无 .gitattributes 时为 CRLF）不得影响判定，
 * 否则空行会变成 "\r"、`## 问题` 会变成 "## 问题\r"，逐字校验全部落空
 * （2026-10-04 由 Windows CI 首次暴露，见同日期 bug-fix Note）。 */
const toLF = (text) => text.replace(/\r\n?/g, '\n');

/** 去掉代码围栏后的行：围栏内的示例不是文档结构。 */
function proseLines(text) {
  const out = [];
  let inFence = false;
  for (const line of toLF(text).split('\n')) {
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) out.push(line);
  }
  return out;
}

for (const note of notes) {
  const { lifecycle, rel, abs } = note;
  const failFmt = (msg) => fail('format', rel, msg);
  const lines = toLF(readFileSync(abs, 'utf8')).split('\n');
  const prose = proseLines(lines.join('\n'));

  // 头部块：前 4 行严格（机器 token 保持英文，见 README § 文件格式）
  if (!/^# Agent Note: \S/.test(lines[0] ?? '')) failFmt('第 1 行须为 `# Agent Note: <标题>`');
  if (lines[1] !== '') failFmt('第 2 行须为空行');
  const status = STATUS[lifecycle];
  if (status && !status.re.test(lines[2] ?? '')) {
    failFmt(`第 3 行须符合 ${lifecycle} 的状态语法：${status.hint}`);
  }
  if (lifecycle === ARCHIVE) {
    if (!/^Archived: \d{4}-\d{2}-\d{2}$/.test(lines[3] ?? '')) {
      failFmt('第 4 行须为 `Archived: YYYY-MM-DD`（紧跟 Status 行）');
    }
    if (lines[4] !== '') failFmt('第 5 行须为空行');
    if (prose.filter((l) => l.startsWith('Archived:')).length !== 1) {
      failFmt('全文须恰好有一行 `Archived:`');
    }
  } else if (lines[3] !== '') {
    failFmt('第 4 行须为空行');
  }
  if (prose.filter((l) => l.startsWith('Status:') && l === lines[2]).length !== 1) {
    failFmt('第 3 行的 `Status:` 须是全文唯一的状态行');
  }

  // 章节骨架
  const h2s = prose.filter((l) => l.startsWith('## ')).map((l) => l.trimEnd());
  if (h2s[0] !== OPENER) {
    failFmt(`首个章节须为 \`${OPENER}\`（当前：${JSON.stringify(h2s[0] ?? '<无>')})`);
  }
  const required = lifecycle === ARCHIVE ? REQUIRED_ARCHIVED : REQUIRED[lifecycle] ?? [];
  for (const heading of required) {
    if (!h2s.includes(heading)) failFmt(`缺少必备章节 \`${heading}\``);
  }
  if (lifecycle === 'implemented' || lifecycle === ARCHIVE) {
    for (const h2 of h2s.filter((h) => BANNED_IMPLEMENTED.test(h))) {
      failFmt(`\`${h2}\` 是提案期章节名；已实施记录只陈述既成事实（折入 决策/后果/测试）`);
    }
  }
  if (!h2s.includes('## 曾考虑的替代方案')) {
    failFmt('缺少 `## 曾考虑的替代方案`——决策不记录击败了什么，就是在邀请反复争论（本仓库无豁免）');
  }
}

// ---------------------------------------------------------------------------
// 3. 活跃文档的相对链接（archived/ 按冻结规则不查出站链接）
// ---------------------------------------------------------------------------

/** 参与链接检查：根 AGENTS.md + .agents/notes 下全部非归档 .md（含 README 与各级 AGENTS）。 */
const linkFiles = [join(repoRoot, 'AGENTS.md')]
  .filter(existsSync)
  .concat(
    walkMd(notesRoot, '')
      .filter((rel) => !rel.startsWith(`${ARCHIVE}/`) && rel !== 'INDEX.md')
      .map((rel) => join(notesRoot, rel)),
  )
  .map((abs) => ({
    abs,
    rel: abs.slice(repoRoot.length + 1),
    prose: proseLines(readFileSync(abs, 'utf8')).join('\n'),
  }));

let linkCount = 0;
for (const file of linkFiles) {
  const seen = new Set();
  for (const line of file.prose.split('\n')) {
    // 行内代码（`…`）里的示例不是链接；围栏已在 proseLines 中剔除。
    const text = line.replace(/`[^`]*`/g, '');
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1].replace(/^<|>$/g, '');
      if (target.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // 锚点 / 外链
      const path = target.split('#')[0];
      if (!path || seen.has(path)) continue;
      seen.add(path);
      linkCount += 1;
      let decoded = path;
      try {
        decoded = decodeURIComponent(path);
      } catch {
        /* 原样使用 */
      }
      if (!existsSync(resolve(dirname(file.abs), decoded))) {
        fail('link', file.rel, `相对链接无法解析："${m[1]}"`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 结果
// ---------------------------------------------------------------------------

if (errors.length === 0) {
  console.log(`verify-agent-notes: ${notes.length} 份 Agent Note、${linkFiles.length} 个文档（${linkCount} 条相对链接）检查通过`);
  process.exit(0);
}

console.error(`verify-agent-notes: 发现 ${errors.length} 处违规：`);
for (const e of errors) console.error(`  ${e}`);
process.exit(1);
