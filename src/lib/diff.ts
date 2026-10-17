/**
 * 行级 diff（LCS）。不引第三方依赖，输出结构化行，便于前端按 +/- 渲染，
 * 同时能拼成 unified diff 文本供复制。
 */
export type DiffLineType = "equal" | "add" | "remove";

export interface DiffLine {
  type: DiffLineType;
  text: string;
  /** 旧文件行号（新增行为 undefined） */
  left?: number;
  /** 新文件行号（删除行为 undefined） */
  right?: number;
}

export interface DiffResult {
  lines: DiffLine[];
  added: number;
  removed: number;
  unchanged: number;
  changed: boolean;
  /** 用于复制/贴进工单的纯文本 diff */
  text: string;
}

export function diffLines(before: string, after: string): DiffResult {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);

  // LCS 长度表：dp[i][j] = a[i..] 与 b[j..] 的最长公共子序列长度
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;
  let unchanged = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ type: "equal", text: a[i]!, left: i + 1, right: j + 1 });
      unchanged += 1;
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      lines.push({ type: "remove", text: a[i]!, left: i + 1 });
      removed += 1;
      i += 1;
    } else {
      lines.push({ type: "add", text: b[j]!, right: j + 1 });
      added += 1;
      j += 1;
    }
  }
  while (i < a.length) {
    lines.push({ type: "remove", text: a[i]!, left: i + 1 });
    removed += 1;
    i += 1;
  }
  while (j < b.length) {
    lines.push({ type: "add", text: b[j]!, right: j + 1 });
    added += 1;
    j += 1;
  }

  return {
    lines,
    added,
    removed,
    unchanged,
    changed: added > 0 || removed > 0,
    text: toUnifiedText(lines),
  };
}

function toUnifiedText(lines: DiffLine[]): string {
  return lines
    .map((line) => {
      const sign = line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";
      return `${sign}${line.text}`;
    })
    .join("\n");
}

/** 去掉未变更区域之外的噪声：只保留变更行前后 2 行上下文 */
export function withContext(lines: DiffLine[], context = 2): DiffLine[] {
  const keep = new Set<number>();
  lines.forEach((line, index) => {
    if (line.type === "equal") return;
    for (let offset = -context; offset <= context; offset += 1) {
      const target = index + offset;
      if (target >= 0 && target < lines.length) keep.add(target);
    }
  });

  const result: DiffLine[] = [];
  let skipped = 0;
  lines.forEach((line, index) => {
    if (keep.has(index)) {
      if (skipped > 0) {
        result.push({ type: "equal", text: `… 省略 ${skipped} 行未变更内容 …` });
        skipped = 0;
      }
      result.push(line);
    } else {
      skipped += 1;
    }
  });
  if (skipped > 0) result.push({ type: "equal", text: `… 省略 ${skipped} 行未变更内容 …` });
  return result;
}
