import { jsonOk, toErrorResponse } from "@/lib/api";
import { runStoreDiagnostics } from "@/lib/store-diagnostics";

export const dynamic = "force-dynamic";

/**
 * 存储层自检（原子写 / 文件锁 / 失败回滚 / 契约校验）。
 *
 * 这个接口最初是作为验收用的临时 API 写的，因为对日常排障有价值所以保留：
 * 它只在 selftest.json 沙箱文件上读写，测试结束即删除，不影响业务数据。
 * 用 GET 或 POST 都可以触发，人读看 checks，机器读看 ok。
 */
async function handle() {
  try {
    const report = await runStoreDiagnostics();
    // 始终返回 200：这是一份「自检报告」而不是请求失败，
    // 调用方读 data.ok 判断结果，部署探针也可以据此告警。
    return jsonOk(report);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export const GET = handle;
export const POST = handle;
