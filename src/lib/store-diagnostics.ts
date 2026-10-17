/**
 * 存储层自检：用真实文件验证「原子写 / 文件锁 / 失败回滚」是否生效。
 *
 * 只在临时沙箱文件 selftest.json 上操作，结束后删除；
 * 不会碰任何业务集合，因此可以在运行中的服务里随时调用。
 */
import { collectionNames, loadCollection, loadCollectionSafe, saveCollection } from "./collections";
import {
  StoreError,
  deleteJson,
  getDataDir,
  getStoreMetrics,
  listStaleTempFiles,
  readJson,
  updateJson,
  writeJson,
} from "./store";

const SANDBOX_FILE = "selftest.json";
const CONCURRENT_WRITERS = 24;

export interface DiagnosticsCheck {
  name: string;
  ok: boolean;
  detail: string;
  durationMs: number;
}

export interface DiagnosticsReport {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  dataDir: string;
  sandboxFile: string;
  checks: DiagnosticsCheck[];
  collections: { name: string; ok: boolean; error?: string }[];
  metrics: {
    reads: number;
    writes: number;
    lockAcquisitions: number;
    lockContentions: number;
    maxLockQueueDepth: number;
    recoveryCount: number;
  };
}

interface Counter {
  count: number;
  updatedAt: string;
  writers: number;
}

async function timed(name: string, task: () => Promise<{ ok: boolean; detail: string }>): Promise<DiagnosticsCheck> {
  const startedAt = performance.now();
  try {
    const result = await task();
    return { name, ok: result.ok, detail: result.detail, durationMs: round(performance.now() - startedAt) };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: `执行异常：${error instanceof Error ? error.message : String(error)}`,
      durationMs: round(performance.now() - startedAt),
    };
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function runStoreDiagnostics(): Promise<DiagnosticsReport> {
  const startedAt = new Date().toISOString();
  const metricsBefore = getStoreMetrics();
  const checks: DiagnosticsCheck[] = [];

  const resetCounter = () => writeJson<Counter>(SANDBOX_FILE, { count: 0, updatedAt: new Date().toISOString(), writers: 0 });

  // 0) 先建一个干净的沙箱文件
  await resetCounter();

  checks.push(
    await timed("JSON 写入 + 读取回环", async () => {
      const payload = { count: 1, updatedAt: new Date().toISOString(), writers: 1 };
      const writeResult = await writeJson(SANDBOX_FILE, payload);
      const readBack = await readJson<typeof payload>(SANDBOX_FILE);
      const equal = JSON.stringify(readBack) === JSON.stringify(payload);
      return {
        ok: equal && writeResult.bytes > 0,
        detail: `写入 ${writeResult.bytes} 字节（${writeResult.durationMs} ms，替换已有文件：${writeResult.replacedExisting ? "是" : "否"}），读回内容一致：${equal ? "是" : "否"}`,
      };
    }),
  );

  checks.push(
    await timed(`并发写入 ${CONCURRENT_WRITERS} 路不丢更新（文件锁）`, async () => {
      await resetCounter();
      const lockBefore = getStoreMetrics();
      await Promise.all(
        Array.from({ length: CONCURRENT_WRITERS }).map(() =>
          updateJson<Counter>(SANDBOX_FILE, (current) => ({
            count: (current?.count ?? 0) + 1,
            updatedAt: new Date().toISOString(),
            writers: (current?.writers ?? 0) + 1,
          })),
        ),
      );
      const final = await readJson<Counter>(SANDBOX_FILE);
      const lockAfter = getStoreMetrics();
      const expected = CONCURRENT_WRITERS;
      return {
        ok: final.count === expected,
        detail: `期望计数 ${expected}，实际 ${final.count}；锁获取 ${lockAfter.lockAcquisitions - lockBefore.lockAcquisitions} 次，锁竞争 ${lockAfter.lockContentions - lockBefore.lockContentions} 次`,
      };
    }),
  );

  checks.push(
    await timed("序列化失败时不落盘（保留上一份数据）", async () => {
      const before = await readJson<Counter>(SANDBOX_FILE);
      const circular: Record<string, unknown> = { count: 999 };
      circular.self = circular;

      let caught: unknown = null;
      try {
        await writeJson(SANDBOX_FILE, circular);
      } catch (error) {
        caught = error;
      }

      const after = await readJson<Counter>(SANDBOX_FILE);
      const code = caught instanceof StoreError ? caught.code : null;
      return {
        ok: code === "SERIALIZE_ERROR" && after.count === before.count,
        detail: `异常码：${code ?? "无"}；写入后计数仍为 ${after.count}（写入前 ${before.count}）`,
      };
    }),
  );

  checks.push(
    await timed("非法数据被契约拒绝且不落盘", async () => {
      const before = await loadCollectionSafe("products");
      if (!before.ok) {
        return { ok: false, detail: `无法读取 products.json 作为基线：${before.error}` };
      }

      let rejectedWith: string | null = null;
      try {
        // 故意写入缺字段的数据，collections 层的 zod 校验应拒绝
        await saveCollection("products", [{ id: "broken" }] as unknown as Awaited<
          ReturnType<typeof loadCollection<"products">>
        >);
      } catch (error) {
        rejectedWith = error instanceof StoreError ? error.code : "UNKNOWN";
      }

      const after = await loadCollectionSafe("products");
      const unchanged = after.ok && JSON.stringify(after.data) === JSON.stringify(before.data);
      return {
        ok: rejectedWith === "SERIALIZE_ERROR" && unchanged,
        detail:
          rejectedWith === "SERIALIZE_ERROR"
            ? `契约校验拒绝写入（SERIALIZE_ERROR），products.json 内容未变：${unchanged ? "是" : "否"}`
            : `未按预期拒绝：${rejectedWith ?? "写入竟然成功了"}`,
      };
    }),
  );

  checks.push(
    await timed("临时文件无残留（原子 rename 清理）", async () => {
      const stale = await listStaleTempFiles();
      return {
        ok: stale.length === 0,
        detail: stale.length === 0 ? "数据目录没有 .tmp 残留" : `发现残留：${stale.join(", ")}`,
      };
    }),
  );

  checks.push(
    await timed("拒绝路径穿越（只允许数据目录内的 .json）", async () => {
      let blocked = false;
      try {
        await readJson("../package.json");
      } catch (error) {
        blocked = error instanceof StoreError && error.code === "INVALID_FILE_NAME";
      }
      return { ok: blocked, detail: blocked ? "../package.json 被拒绝" : "未拦截非法文件名" };
    }),
  );

  checks.push(
    await timed("22 个集合结构校验", async () => {
      const outcomes = await Promise.all(collectionNames.map((name) => loadCollectionSafe(name)));
      const failed = outcomes.filter((outcome) => !outcome.ok);
      return {
        ok: failed.length === 0,
        detail:
          failed.length === 0
            ? `全部 ${outcomes.length} 个集合通过 zod 校验`
            : `${failed.length} 个集合校验失败：${failed
                .map((outcome) => `${outcome.name}（${"error" in outcome ? outcome.error : ""}）`)
                .join("；")}`,
      };
    }),
  );

  // 收尾：删除沙箱文件，避免污染 data/ 目录
  await deleteJson(SANDBOX_FILE).catch(() => undefined);

  const outcomes = await Promise.all(collectionNames.map((name) => loadCollectionSafe(name)));
  const metricsAfter = getStoreMetrics();

  return {
    ok: checks.every((check) => check.ok),
    startedAt,
    finishedAt: new Date().toISOString(),
    dataDir: getDataDir(),
    sandboxFile: SANDBOX_FILE,
    checks,
    collections: outcomes.map((outcome) =>
      outcome.ok ? { name: outcome.name, ok: true } : { name: outcome.name, ok: false, error: outcome.error },
    ),
    metrics: {
      reads: metricsAfter.reads - metricsBefore.reads,
      writes: metricsAfter.writes - metricsBefore.writes,
      lockAcquisitions: metricsAfter.lockAcquisitions - metricsBefore.lockAcquisitions,
      lockContentions: metricsAfter.lockContentions - metricsBefore.lockContentions,
      maxLockQueueDepth: metricsAfter.maxLockQueueDepth,
      recoveryCount: metricsAfter.recoveryCount,
    },
  };
}
