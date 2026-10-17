#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";

import { runNext } from "./next-runner.mjs";

if (!existsSync(path.join(process.cwd(), ".next", "BUILD_ID"))) {
  console.error("[snackops] 还没有构建产物（.next/BUILD_ID 不存在）。先运行：pnpm build");
  process.exit(1);
}

runNext("start");
