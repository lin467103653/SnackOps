import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * 统一解析端口：DEPLOY_RUN_PORT 优先，默认 5000。
 * 端口非法时直接退出，避免 Next 用随机端口跑起来让人找不到服务。
 */
export function resolvePort(fallback = "5000") {
  const raw = (process.env.DEPLOY_RUN_PORT ?? "").trim();
  const port = raw === "" ? fallback : raw;

  if (!/^\d+$/.test(port)) {
    console.error(`[snackops] DEPLOY_RUN_PORT 必须是数字，当前值：${raw}`);
    process.exit(1);
  }

  const numeric = Number(port);
  if (numeric < 1 || numeric > 65535) {
    console.error(`[snackops] DEPLOY_RUN_PORT 超出合法范围（1-65535）：${port}`);
    process.exit(1);
  }

  return port;
}

export function resolveHost() {
  return (process.env.DEPLOY_HOST ?? "").trim() || "127.0.0.1";
}

/**
 * 用本地的 next CLI 启动，不依赖 shell 或 PATH，
 * stdio 继承父进程（在这台机器的沙箱下，管道 stdio 会被拒绝）。
 */
export function runNext(command, { defaultPort = "5000" } = {}) {
  const port = resolvePort(defaultPort);
  const host = resolveHost();

  const localCli = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const hasLocalCli = existsSync(localCli);

  const args = hasLocalCli
    ? [localCli, command, "-p", port, "-H", host, ...process.argv.slice(2)]
    : [command, "-p", port, "-H", host, ...process.argv.slice(2)];

  const child = spawn(hasLocalCli ? process.execPath : "next", args, {
    stdio: "inherit",
    env: process.env,
    cwd: process.cwd(),
  });

  const url = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`;
  console.log(`[snackops] next ${command} → ${url}  (DEPLOY_RUN_PORT=${process.env.DEPLOY_RUN_PORT ?? "未设置，使用默认值"})`);

  const forward = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.on("SIGINT", () => forward("SIGINT"));
  process.on("SIGTERM", () => forward("SIGTERM"));

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  child.on("error", (error) => {
    console.error(`[snackops] 启动 next 失败：${error.message}`);
    process.exit(1);
  });

  return child;
}
