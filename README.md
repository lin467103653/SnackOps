# SnackOps

零食电商客服 Agent 的**运营平台**：把 Planner / Skill / Tool / Eval 的运行质量摆到一张桌面上，
让运营和产品能回答三个问题——今天 Agent 解决得好不好、哪些会话需要人接、下一个版本该改什么。

不是营销站点：没有 Hero，首屏直接是运营指标、待接管队列与风险提醒。

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React](https://img.shields.io/badge/React-19-149eca)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6)
![Tailwind](https://img.shields.io/badge/Tailwind%20CSS-4-06b6d4)
![version](https://img.shields.io/badge/version-v0.1.0-success)
![license](https://img.shields.io/badge/license-MIT-blue)

> **当前版本：v0.1.0**（tag `v0.1.0`）
> 范围：第一段到第八段的完整快照——骨架与 JSON 存储层、Skill/Tool 注册系统、Agent 主链路、
> 管理后台、运营中心、Eval 子系统、批量评测与版本对比、工程化收尾。
>
> **数据说明**：仓库里的 `data/` 全部是演示数据（由 `scripts/seed*.mjs` 生成），
> 不含任何真实用户、订单或密钥；`.env.local` 与 `data/*.bak` 已在 `.gitignore` 中排除。

- **第一段**：项目骨架、JSON 存储层、运营总览 / 运行 / 评测 / 改进 / 数据 / 配置页面。
- **第二段**：Skill 与 Tool 的**业务能力注册系统**——只有启用中的能力会被 Planner 读取，支持启停、编辑提示词、版本快照与 diff。
- **第三段**：**Agent 主链路**——LLM Provider 抽象（coze / openai-compatible / classroom-fixture）、Planner、独立 Plan Validator、
  按 Plan 执行的 Executor、统一 RunRecord、SSE 流式接口，以及工作台 / 演示 / 详情三个页面。
- **第四段**：**管理后台**——Skill / Tool / Planner / 模型四块，全部真实读写服务端数据；
  Provider 切换与 Planner 配置会直接影响后续运行，密钥只以「是否已配置」的形式出现在页面上。
- **第五段**：**运营中心 `/ops`**——运行监控、多维评分、标注、规则聚类 → 改进项 → Prompt 草案 → 应用 / 回滚的闭环。
- **第六段**：**Eval 子系统 `/eval`**——用例走真实 Agent 主链路；关键词 / 禁词 / 价格 / 能力 / 风控五类**机器可判断言** + 可追溯评分证据。
- **第七段**：**批量评测与版本对比**——逐条真实执行、批次快照、用 `caseSetHash` / `evaluatorHash` 判定两次批次是否可比。
- **第八段**：**工程化收尾**——Provider 矩阵、`classroom:reset` 一键回基线、`pnpm verify` 端到端断言、三份 `.bat` 启动脚本。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Next.js 16（App Router，Turbopack）+ React 19 + TypeScript 5.9 |
| 样式 | Tailwind CSS 4（`@theme inline` + OKLCH 变量） |
| 组件 | shadcn/ui 风格组件（`src/components/ui/*`，基于 Radix UI primitives） |
| 图标 / 反馈 | lucide-react / sonner |
| 图表 | recharts（运行量与成功率） |
| 校验 | zod（存储契约 + 请求体契约 + Tool 入参） |
| 包管理 | pnpm 10（`node-linker=hoisted`，见 `.npmrc`） |

## 快速开始

```bash
pnpm install
pnpm seed:reset    # 生成 21 份基础数据 + 注册系统（Skill/Tool/版本/转人工规则）+ 评测用例
pnpm dev           # 默认 http://127.0.0.1:5000
```

| 脚本 | 说明 |
| --- | --- |
| `pnpm dev` | 开发服务器，端口默认 `5000`，可用 `DEPLOY_RUN_PORT` 覆盖 |
| `pnpm build` / `pnpm start` | 生产构建 / 启动（同样支持 `DEPLOY_RUN_PORT`） |
| `pnpm lint` / `pnpm typecheck` | ESLint / `tsc --noEmit` |
| `pnpm validate` | `typecheck` + `lint`，CI 唯一入口 |
| `pnpm seed` / `pnpm seed:reset` | 生成演示数据（`seed.mjs` 基础 21 份 → `seed-registry.mjs` 注册系统 → `seed-eval.mjs` 评测用例） |
| `pnpm check:data` | 校验 23 个集合的 zod 契约、交叉引用与 Skill 文件哈希 |
| `pnpm test:scorer` | 评分器单元测试（18 项断言，纯函数、不联网） |
| `pnpm verify` | 端到端验证 59 项断言（需先启动服务；会自建运行记录并在最后两次 `classroom:reset`） |
| `pnpm classroom:reset` | 把质量类数据恢复成课堂基线（可重复执行，业务数据不动） |

Windows 双击启动（无需命令行）：`run-dev.bat`（日常开发）、`run-prod.bat`（构建后启动）、`run-verify.bat`（对着已启动的服务跑断言）。

## 目录结构

```text
src/app/                  App Router：页面 + 路由处理器
src/app/api/              REST 出口（唯一的读写通道）
src/components/           业务组件（shell / 状态徽标 / 区块 / diff 视图 / 图表）
src/components/ui/        shadcn/ui primitives
src/components/actions/   写操作的表单与按钮（启停、编辑器、工具测试…）
src/hooks/                useApiAction / useFilterNavigation
src/lib/store.ts          JSON 存储原语（原子写 / 文件锁 / 备份恢复）
src/lib/schemas.ts        25 个集合的 zod 契约（唯一事实来源）
src/lib/skills/           Skill 注册中心：文件守卫 + 注册表 + 版本快照
src/lib/tools/            Tool 注册中心：入参校验 + 6 个真实数据实现 + 执行器
src/lib/catalog.ts        业务数据摘要（/catalog）
data/                     25 份 JSON（运行时数据，客户端不可直接读写）
skills/                   14 个 Skill 的提示词源文件（<id>.md）+ 历史场景说明
tools/                    Tool 契约样例（JSON Schema 片段 + 风控参数）
public/ assets/ scripts/  静态资源、设计素材、dev/start/seed/check 脚本
```

## 页面

| 路径 | 作用 |
| --- | --- |
| `/` | **Agent 工作台**：输入问题 → 流式看 Plan / 校验 / Trace / 风险 / 最终回复 |
| `/demo` | 简化聊天页：同一个 `/api/agent/run`，回复可点进 Trace |
| `/overview` | 运营总览：核心指标、14 天趋势、待接管队列、风险提醒、Skill 健康度 |
| `/runs` | 运行记录：Agent RunRecord（主链路）+ 第一段历史运行 |
| `/runs/[id]` | 运行详情：Plan、校验、Trace（输入/输出可展开）、风险审查、重试 / 接管 / 标注 / 解释 |
| `/skills` | Skill 管理：列表 + 按启用状态筛选、Prompt 正文预览、启停、模型参数、进入编辑 |
| `/skills/[id]` | 提示词编辑、保存版本、版本历史、版本内容、行级 diff、文件镜像一致性 |
| `/tools` | Tool 管理：列表、输入/输出 schema、启停、**服务端测试台**（真实输入/输出/耗时/错误） |
| `/tools/[id]` | 输入/输出 JSON Schema、单项运行测试（返回真实数据）、调用方 Skill |
| `/planner` | Planner 管理：版本/配置、提示词、可选 Skill/Tool 白名单、必需能力、计划预览与校验 |
| `/models` | 模型管理：Provider 卡片与切换、连接测试、环境变量状态、模型参数、运行模式 Banner |
| `/catalog` | 业务数据目录：10 类数据的摘要、分布、风险项与跳转 |
| `/evals` `/improvements` | 评测批次（真实执行）/ AB 实验 / 改进闭环 |
| `/data` `/data/[collection]` | 25 个集合的契约状态与通用数据浏览器 |
| `/settings` | 模型配置、兜底策略、存储信息与存储自检 |

## Skill 注册系统

**数据形状**（`data/skills.json`，14 条，按 `order` 排序）：

```jsonc
{
  "id": "risk-check",            // 同时是文件名与 URL 段
  "name": "风险审查",
  "description": "发送前的最后一道闸……",
  "stage": "守卫",                // 输入理解 / 决策 / 生成 / 守卫 / 收口
  "enabled": true,               // Planner 只读 enabled=true
  "model": "deepseek-reasoner",
  "temperature": 0,
  "maxTokens": 1800,
  "requiredTools": [],           // 依赖的 tool id
  "version": "1.3.1",            // 每次保存正文 patch +1
  "filePath": "skills/risk-check.md",
  "hash": "9f2c…",               // 正文 sha256 前 16 位
  "systemPrompt": "# 风险审查 Skill\n…",
  "order": 7, "owner": "苏明", "updatedAt": "…"
}
```

**正文与版本**

- `data/skills.json` 是主存储（原子写 + zod 校验），`skills/<id>.md` 是可读镜像，保存时同步覆写；
- 保存正文 → 先保证「修改前的正文」在版本库里有落点（同内容已有快照就复用，不重复留档）→ 版本 patch +1 → 追加新快照；
- 版本快照记录 `content / hash / changeNote / createdAt / author / evalScore / regression`；
- 版本可列表、可查看全文、可做行级 diff（`+`/`−` + 行号，不只靠颜色）。

**路径防护**（`src/lib/skills/files.ts`）

- 只接受 `skills/<id>.md` 形态，`<id>` 只允许字母、数字、下划线、连字符与中文；
- 解析后的绝对路径必须仍在 `skills/` 内，`../../package.json`、`skills/../x`、`/etc/passwd` 全部 400；
- 写入走同目录 `.tmp` + `fsync` + `rename`。

**启用状态**

`PATCH /api/skills/{id}` 改 `enabled`（也可改模型/温度/工具）。停用后：
`/api/registry`、`/api/skills?enabled=1` 不再返回它；`/api/skills` 仍可管理。

## Tool 注册系统

`data/tools.json` 6 个工具，全部**直接读 `data/*.json`**，没有外部依赖：

| id | 名称 | 类型 | 说明 |
| --- | --- | --- | --- |
| `query_products` | 商品查询 | 查询 | 关键词/类目/价格带/过敏原过滤，返回配料与营养 |
| `query_activities` | 活动查询 | 查询 | 门槛、优惠规则、适用类目、有效期 |
| `query_coupons` | 优惠券查询 | 查询 | 面额、门槛、适用范围、叠加、限领 |
| `calculate_price` | 价格试算 | 计算 | 明细 + 活动 + 券的应付金额，输出冲突说明 |
| `query_orders` | 订单查询 | 查询 | 订单 / 物流 / 售后三列状态 |
| `query_logistics` | 物流查询 | 查询 | 轨迹、最新节点、延误时长 |

- 每个 Tool 在注册表里有 `inputSchema` / `outputSchema`（JSON Schema）与 `sampleInput`；
- 执行前用 zod 再校验一次入参（`src/lib/tools/schemas.ts`），与 Schema 字段一致；
- 错误分类：`INVALID_INPUT → 422`、`NOT_FOUND → 404`、未实现 → `501`；
- 注册表与实现不一致（只注册没实现 / 有实现没注册）会在 `/tools` 顶部标出。

## Agent 主链路

```text
userInput + history
   → mandatoryCapabilities（能力词典推导，不含答案）
   → Planner（输出结构化 JSON Plan，失败则安全 fallback）
   → Plan Validator（未启用/不存在/必需能力缺失/价格缺 calculate_price/风险缺 risk-check）
   → Executor（先查工具 → 再跑 Skill → 最后 risk-check；每步落 step）
   → 最终回复 + 风险结果 + 完整 Trace → RunRecord（data/agent-runs.json）
```

### LLM Provider

| provider | 触发方式 | 说明 |
| --- | --- | --- |
| `coze` | `LLM_PROVIDER=coze` + `COZE_API_KEY` | 通过 `coze-coding-dev-sdk` 的 `LLMClient.invoke` 调用；SDK 未安装时给出结构化错误 |
| `openai-compatible` | `LLM_PROVIDER=openai-compatible`（或只给 `OPENAI_API_KEY`） | 读取 `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `LLM_MODEL`，调用 `/chat/completions` |
| `classroom-fixture` | `LLM_PROVIDER=classroom-fixture` | 无外部密钥时的确定性输出，**必须显式开启** |

- **不会静默降级**：未配置时 `/api/agent/run` 返回 503 + 中文说明 + 切换演示模式的具体做法；
- fixture 与真实模型吃同一份 prompt（同一个 `<<<CONTEXT>>>` 块）和同一条链路，只是生成阶段换成规则；
- fixture 的回复带 `[课堂演示模式]` footer，RunRecord 的 `provider/model/notice` 也会标注；
- fixture 的 risk-check 用 R1–R8 规则引擎给出确定性判定，不是写死 PASS。

### Planner / Validator / Executor

- **Planner** 输入 `question / conversationHistory / availableSkills / availableTools / mandatoryCapabilities`，
  输出 `selectedSkills / selectedTools / reasoning / mandatoryCapabilities / riskAssessment / degradation`；
  JSON 解析失败 → 安全 fallback Plan（标记 `degraded`），不会让页面崩。
- **Validator** 独立于 Planner：拦未启用/不存在的能力，自动补齐可补的必需能力（记 warning），
  补不齐就记 error（价格缺 `calculate_price`、风险缺 `risk-check`、缺少 reply 能力都会阻断）。
- **Executor** 顺序固定：查询 Tool → Skill → risk-check。每步记录 `stepId/type/name/status/input/output/durationMs/error`；
  必需能力的 Tool 失败 → 整个运行 `failed`（不伪造回复）；Skill 超时 → 步骤 `timeout` + 明确错误；
  risk-check 输出无法解析时按阻断处理。

### RunRecord

`id / question / source / conversationId / createdAt / status / finalReply / plan / planValidation / steps / riskResult /
durationMs / error / provider / model / skillVersions / toolVersions / notice / handoff / retryOf`。

### 本段 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/agent/run` | SSE 流：`run_start / plan / validation / step / risk / final / error / done` |
| GET | `/api/runs?limit=&offset=` | 分页列出 RunRecord |
| GET | `/api/runs/[id]` | 完整详情 |
| POST | `/api/run/retry` | 用同一问题重跑，新记录 `retryOf` 指向原记录 |
| POST | `/api/runs/[id]/handoff` | 标记人工接管 |
| POST | `/api/runs/[id]/annotate` | 写入统一标注库（`targetType=agent_run`） |
| POST | `/api/explain` | 解释运行（走模型）或问题（走规则引擎） |

> 故障注入：只有 `SNACKOPS_ALLOW_FAULTS=1` 时，请求体里的 `faults` 才会生效，用于验证「Tool 报错」「Skill 超时」。

## 管理后台

四块管理页都直接读写服务端：改完刷新仍然生效，按钮不是只改 React state。

### `/skills` — Skill 管理

- 列表：名称、描述、阶段、启用状态、版本、模型/温度/Token、依赖 Tool、快照数；
- 按启用状态筛选（URL `?enabled=1|0`，可分享）；
- 每行「查看 Prompt 正文」直接展开全文；「编辑」进入 `/skills/[id]`；
- 保存正文 = 快照旧正文 → 版本 patch+1 → 写注册表 → 同步 `skills/<id>.md`；
- 版本列表 / 版本正文 / 行级 diff / changeNote 在详情页；
- **失败保留旧版本**：内容过短、路径越界、schema 不合法都会在落盘前被拒（422/400），旧正文与版本不变，页面显示错误。

### `/tools` — Tool 管理

- 列表：描述、类型、风险、版本、输入字段数、调用方、启停；
- 每行可展开输入/输出 JSON Schema；
- **测试台**：选 Tool → 填 JSON → `POST /api/tools/[id]/test`；
  展示「真实输入 / 真实输出 / 耗时 / 错误」，客户端只渲染服务端返回，不构造成功文案；
- 输出示例来自服务端真实数据（例如商品查询返回 `data/products.json` 里的记录）。

### `/planner` — Planner 管理

- 版本（`v1.4.0`）、模型/温度/Token、提示词哈希、历史版本列表；
- 可编辑并保存 Planner 系统提示词（保存后版本 +1，写 changeNote 与 hash）；
- 选择可用 Skill / Tool 白名单（不勾选 = 全部启用项）、设置默认必需能力；
- 测试问题 → **预览计划**：展示 selectedSkills / selectedTools / reasoning / 必需能力 / 风险判断 / 校验结果；
- 计划非法时逐条列出原因（例如「缺少必需能力：售后判定（after_sales）没有被任何已选能力覆盖」），并显示校验器自动补齐了哪些能力；
- 预览走真实的 `Planner → Validator`，与正式运行同一份配置，但不执行 Skill/Tool。

### `/models` — 模型管理

- 当前 Provider、描述、默认模型、运行模式 Banner（演示模式 / 真实模型 / 缺配置）；
- Provider 卡片：已配置/缺配置、需要哪些环境变量、一键切换（写入 `data/llm-config.json`）；
- 环境变量状态：只显示「已配置（已隐藏）」或「未配置」，**从不显示密钥原文**；
- 连接测试：真实发一次最小请求，失败返回结构化 `{code, message, hint}`；
- 模型参数：默认 / 规划 / 兜底模型、温度、Max Tokens、超时、Planner 步数。

### 管理后台 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/skills?enabled=1` | Skill 列表（含正文），可按启用状态过滤 |
| GET | `/api/skills/[id]/versions` | 版本列表（`?withContent=1` 带正文） |
| PUT | `/api/skills/[id]/content` | 保存正文（自动留档 + 版本 +1 + 同步镜像） |
| GET | `/api/tools?enabled=1` | Tool 列表 + 实现审计 |
| POST | `/api/tools/[id]/test` | 服务端真实执行 Tool |
| GET/PUT | `/api/planner` | Planner 配置 / 提示词；PUT 保存并升版本 |
| POST | `/api/planner/preview` | 只跑 Planner + Validator，返回计划与校验 |
| GET/PUT | `/api/llm-config` | Provider 状态、模型配置；PUT 保存模型参数 |
| POST | `/api/llm-config/switch` | 切换 Provider（持久化，立即影响后续运行） |
| POST | `/api/llm-config/test` | 连接测试（失败结构化，密钥脱敏） |

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/registry` | **Planner/Executor 入口**：启用中的 Skill（含正文）+ Tool（含 Schema）+ 转人工规则 |
| GET | `/api/skills` | Skill 列表，`?enabled=1` 只看启用 |
| GET | `/api/skills/{id}` | 详情 + 文件一致性 + 版本数；`POST` 重新导出镜像 |
| PATCH | `/api/skills/{id}` | 启停 / 改模型、温度、Token、依赖工具、名称 |
| PUT | `/api/skills/{id}/content` | 保存正文（自动留档 + 版本 +1 + 同步镜像；越界 `filePath` 400） |
| GET | `/api/skills/{id}/versions` | 版本列表（`?withContent=1` 带正文） |
| GET | `/api/skills/{id}/versions/{version}` | 单版本全文（支持快照 id） |
| GET | `/api/skills/{id}/diff?from=&to=` | 行级 diff（`to` 可为 `current`） |
| GET | `/api/tools` | Tool 列表 + 实现覆盖审计，`?enabled=1` 只看启用 |
| GET/PATCH | `/api/tools/{id}` | 详情 / 启停 |
| POST | `/api/tools/{id}/test` | 运行工具（省略入参用 `sampleInput`），返回真实数据 |
| GET | `/api/catalog` | 业务数据目录摘要 |
| GET | `/api/health` `/api/diagnostics/store` | 健康检查 / 存储自检（原子写、24 路并发锁、契约校验） |
| GET | `/api/data/{collection}` | 只读集合出口（23 个白名单） |
| POST/PATCH/PUT | `/api/annotations` `/api/tickets/{id}` `/api/improvements` `/api/config` | 第一段的写接口（`POST /api/eval-batches` 已在评测存储合并时下线 → 410） |

## 数据模型（25 个集合）

商品（口味/配料/过敏原/糖分营养/适用人群）、活动（门槛/规则/适用类目/叠加）、优惠券（面额/门槛/适用范围/限领）、
订单（物流状态/售后状态/售后原因）、用户（新客/偏好/过敏禁忌/最近订单）、售后政策（破损/缺件/退换货/退款/临期/延迟发货）、
FAQ、物流、**转人工规则**、工单、运行、评分、标注、Skill、Skill 版本、Tool、Tool 配置、评测用例、评测批次、AB 实验、改进项、模型配置、兜底策略。

## 验收记录（本机实测）

环境：Windows / Node v24.18.0 / pnpm 10.34.6 / Next 16.4.2 / React 19.3.1。

| # | 命令 / 请求 | 结果 |
| --- | --- | --- |
| 1 | `pnpm seed:reset` | 退出码 0：14 Skill（启用 13）、16 版本、6 Tool、7 转人工规则、23 集合 |
| 2 | `pnpm check:data` | 退出码 0：23 集合 zod 契约全 PASS，交叉引用无悬空，14 个 Skill 文件哈希一致 |
| 3 | `pnpm typecheck` | 退出码 0 |
| 4 | `pnpm lint` | 退出码 0（0 error / 0 warning） |
| 5 | `pnpm build` | 退出码 0，50 条路由，全部 `ƒ (Dynamic)` |
| 6 | `GET /`、`/skills`、`/skills/risk-check`、`/tools`、`/tools/query_products`、`/catalog` … | 全部 200 |
| 7 | `GET /api/registry` | 13 个启用 Skill（含 2800+ 字正文）+ 6 个 Tool + 7 条转人工规则 |
| 8 | `PATCH /api/skills/conversation-summary {enabled:false}` | 启用列表 13 → 12，`/api/registry` 同步消失；恢复后回到 13 |
| 9 | `POST /api/tools/*/test`（15 条断言） | 全部 PASS：商品/订单/物流与本地过滤结果一致，`calculate_price` 应付金额与独立计算一致 |
| 10 | `PUT /api/skills/risk-check/content` | 版本 1.3.1 → 1.3.2，旧正文留档可回滚，镜像 `skills/risk-check.md` 同步 |
| 11 | `GET /api/skills/risk-check/diff` | 返回 `+2` 行，含新增标题，行级 `+` 标记可见 |
| 12 | 越界写 5 个路径（`../../package.json` 等） | 全部 400，项目外无文件产生，`filePath` 未被污染 |
| 13 | `GET /api/diagnostics/store` | 7 项自检全 PASS，25 个集合校验通过 |

### 第三段：Agent 主链路（8 组场景、46 条断言全 PASS）

环境同前，`LLM_PROVIDER=classroom-fixture`（无外部密钥），`SNACKOPS_ALLOW_FAULTS=1`。

| 场景 | 观测结果 |
| --- | --- |
| 正常推荐问题 | `status=success`；Plan 选 `recommendation-decision + product-substitution + response-generator` + `query_products/calculate_price`；回复里带真实库存/价格/含糖量 |
| 价格问题 | Trace 里 `calculate_price` 步骤 `success`，返回 `subtotal=79.8 / payable=79.8`，`notes` 说明未达门槛（差 219.2 / 119.2） |
| 订单 + 物流问题 | Trace 里 `query_orders` + `query_logistics` 均 `success` |
| 中奖诈骗问题 | risk-check 命中 `R7` → `verdict=block`，`status=blocked`，最终回复换成安全兜底话术 |
| 禁用 `response-generator` | 校验报「没有可生成回复的 Skill」→ `status=blocked`，不产出假回复；恢复后正常 |
| 注入 Tool 故障（`query_orders`） | 步骤 `status=error` + 错误文案，RunRecord `status=failed` 且 `error` 非空 |
| 持久化 | `/api/runs` 列出 10 条；详情页刷新后仍在，Trace 可展开输入/输出 |
| 接管 / 标注 / 解释 / 重试 | 依次 200 / 201 / 200 / 200；重跑生成新 `runId` 且 `retryOf` 指向原记录 |

### 第四段：管理后台（38 条断言全 PASS）

| 场景 | 观测结果 |
| --- | --- |
| Skill 编辑持久化 | 保存后版本 1.4.0 → 1.4.1，API 与页面刷新都能看到标记 |
| 保存失败保留旧版本 | 内容过短 → 422；旧正文仍在、版本不变 |
| Tool 真实调用 | `query_products` 返回的 id 顺序与 `data/products.json` 过滤结果完全一致，价格取自真实记录 |
| Planner 预览受启用状态影响 | 停用 `recommendation-decision` 后预览不再选中它；恢复后重新选中；`allowedSkills` 限制同样生效 |
| 计划非法有明确原因 | 停用售后 Skill 后预览报「缺少必需能力：售后判定（after_sales）没有被任何已选能力覆盖」 |
| Provider 切换影响 RunRecord | 切到 `openai-compatible` 后新 RunRecord 的 `provider` 变为 `openai-compatible`，状态 `failed`（没有伪装成功） |
| Provider 测试失败结构化 | 返回 `{ok:false, code:"UPSTREAM", message, hint}`，响应里不含密钥 |
| 密钥不泄露 | `/models`、`/settings`、`/planner`、`/` 与 `.next/static` 全部 bundle 均不含哨兵密钥；页面只显示「已配置（已隐藏）」 |

- **第五段**：**运营中心 `/ops`**——运行监控、服务评分、数据标注、规则聚类改进与 Prompt 草案闭环，
  以及人工评估 / 版本回滚 / Prompt A/B / 改进记录四个入口。

## 运营中心（`/ops`）

不是数字看板：每一块都能往下操作，全部落在服务端数据上。

| 区块 | 能力 |
| --- | --- |
| 运行监控 | 运行总数、成功率、平均耗时、失败步骤、风险分布、人工接管率、最近运行（可点进 `/runs/[id]`） |
| 服务评分 | 记录评分（关联 RunRecord，保存当时问答对）；≤2 分自动落一条坏案例标注；按时间（7/30 天）、评分（低/高）、问题类型筛选 |
| 数据标注 | pending / accepted / rejected 状态流转；correctness / relevance / completeness / safety / tone / overall 六维评分；标注人、时间、备注；导出 JSON / CSV；一键沉淀评测用例或转改进项 |
| 改进建议 | **规则聚类**（R1 风险拦截 / R2 工具失败 / R3 计划被阻断 / R4 低分回复 / R5 知识缺口）→ 生成改进项（Planner/Skill/Tool/Eval 方向 + 样本 Run）→ 生成 Prompt 草案 → 预览 diff → 勾选确认后应用 |
| 其他入口 | 人工评估（运行详情）、版本快照与回滚（Skill 详情）、Prompt A/B 实验（登记 + 结论）、改进记录 `/improvements` |

### 闭环上的三条硬约束

1. **聚类是规则**：`buildClusters()` 只读既有字段，页面与草案里都写明「规则聚类 / 规则草案」，不冒充 LLM 分析；
2. **草案不覆盖生产**：`generate-prompt` 只写 `improvement.draft`，Skill 正文与版本纹丝不动（验收脚本对比过 hash 与版本号）；
3. **应用前必留快照**：`apply-prompt` 走 `saveSkillContent`，先给当前正文打版本、再写新正文、版本 patch+1；回滚同理（回滚本身也会前进一个版本）。

### 运营中心 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST | `/api/ratings` | 评分列表（时间/分数/意图筛选）与创建（低分自动路由） |
| GET/POST | `/api/annotations` | 标注列表（状态/标签筛选）与创建（含六维评分） |
| PATCH | `/api/annotations/[id]` | 状态、维度、备注；`action=to_eval_case` 沉淀用例，`action=to_improvement` 转改进 |
| GET | `/api/annotations/export` | 导出 JSON / CSV（含内容部署头） |
| GET/POST | `/api/improvements` | 列表；`{rule}` 按规则聚类创建，或按表单手工创建 |
| POST | `/api/improvements/generate-prompt` | 生成 Prompt 草案（不改 Skill） |
| POST | `/api/improvements/apply-prompt` | 必须 `confirm:true`；应用前自动留快照 |
| GET/POST | `/api/ab-tests` | A/B 实验列表与创建 |
| PATCH | `/api/ab-tests/[id]` | 登记指标 / 结束实验 |
| POST | `/api/skills/[id]/rollback` | 回滚到指定版本（恢复正文，版本继续前进） |
### 第五段：运营中心（65 条断言全 PASS）

| 场景 | 观测结果 |
| --- | --- |
| 从 Run 创建低分评分 | `POST /api/ratings {score:2}` → 201，返回的 rating 带问答对快照，并自动生成坏案例标注 |
| 评分出现在运营中心 | `/ops` HTML 含该问题与评语；`GET /api/ratings?maxScore=2` 能查到 |
| 标注刷新仍在 | 创建 → `pending`；刷新 `/ops` 与 `GET /api/annotations` 都在；PATCH 状态为 `accepted` 生效 |
| 导出字段正确 | JSON 含 `id/targetType/targetId/tag/status/note/author/createdAt/overall/improvementId`；CSV 带表头与数据行 |
| 低分进入改进建议 | `POST /api/improvements {rule:"R4 低分回复（price）"}` → 201，`cluster.rule` 与样本 Run 齐全 |
| 草案不覆盖原 Skill | `generate-prompt` 前后 Skill 正文与版本完全一致，只有 `improvement.draft` 变化 |
| 应用前留快照 | `apply-prompt` 返回 `snapshotVersion=1.2.1`；版本 1.2.1 → 1.2.2；快照里存着应用前正文 |
| 回滚恢复旧正文 | `rollback {version:"1.2.1"}` → 正文与快照逐字相同，草案段落消失，版本 1.2.2 → 1.2.3 |
| 请求失败不崩页 | `/ops` 带非法筛选参数仍 200；未知标注 / 未知 run / 未知改进项分别 404，缺 `confirm` 400 |
- **第六段**：**Eval 子系统 `/eval`**——走同一条 Agent 主链路的评测集、单条测试与可追溯评分；
  评分器是纯函数，带 16 项单元测试。

## 评测集（`/eval`）

不是脱离主链路的假测试：单条测试先调 `POST /api/agent/run`（同一套 Planner / Skill / Tool / risk-check），
拿到本次 `runId` 与最终回复，再调 `POST /api/eval/score` 用**已持久化的 RunRecord** 评分。

### 用例模型（`data/eval-cases.json`）

`id / name / question / category / difficulty / riskLevel / expectedBehavior / expectedReply /
expectedKeywords / keywordMode(AND|OR) / forbiddenWords / expectedPrice / priceTolerance / expectRiskPassed /
requiredCapabilities / forbiddenCapabilities / evalDimension / llmJudgePrompt / tags / sourceRunId / createdAt / enabled`

内置 9 条方向：麻辣办公室零食预算推荐、新客礼盒、老人低糖、价格核验、破损缺件售后、促销叠加、功效夸大、中奖诈骗、模糊需求。

### 评分口径（三个概念分开）

| 概念 | 含义 |
| --- | --- |
| `inputRisk` | 用户输入本身的风险意图（中奖/转账/验证码…），只记录，不直接判失败 |
| `replySafety` | 最终回复是否安全：危险话术、禁词、价格不符、功效夸大 |
| `shouldSend` | 这条回复能不能发出去；安全回复不会因为问题本身风险高被判失败 |

状态：`PASS / FAIL / REVIEW / ERROR`。**ERROR** 表示运行或模型侧失败，不计入产品失败率；
**REVIEW** 表示规则通过但用例配置了 `llmJudgePrompt` 而模型评判未接入，单独统计，绝不伪造分数。

评分结果字段：`status / passed / reason / evidence / keywordHits / keywordMisses / forbiddenHits /
expectedPrice / mentionedPrice / riskIssues / capabilityHits / inputRisk / replySafety / shouldSend / durationMs / runId`。

### API 与页面

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/eval` | cases + batches + skills + tools |
| POST | `/api/eval/cases` | 新增（可用 `sourceRunId` 从一次 Run 带入问题） |
| PATCH | `/api/eval/cases/[id]` | 编辑 / 启停 / `{duplicate:true}` 复制 |
| DELETE | `/api/eval/cases/[id]` | 删除 |
| POST | `/api/eval/score` | 用真实 `runId` 评分，返回证据与 Trace 摘要 |

页面 `/eval`：分类 / 难度 / 风险 / 维度筛选，行内编辑、复制、启停、删除、单测；
单测结果展示最终回复、评分证据、`shouldSend`、Trace，失败时页面内展开错误与提示。
### 第六段：Eval 子系统（16 项单元测试 + 38 条接口断言全 PASS）

| 场景 | 观测结果 |
| --- | --- |
| 新增用例刷新仍在 | `POST /api/eval/cases` → 201；`GET /api/eval` 与刷新后的 `/eval` 页面都能看到 |
| 改关键词评分真的变化 | 同一 `runId`：`expectedKeywords:["元"]` → PASS；改成不存在的词 → FAIL，并记录 `keywordMisses` |
| 停用/删除后不在启用集 | 停用后仍可在列表见，但默认启用集（9 条）不含它；删除后彻底消失 |
| 单测是真实回复 | 评分返回的 `run.finalReply` 与 `GET /api/runs/{runId}` 一致，Trace 有 6 步 |
| 证据可追溯 | 评分 `runId` 与证据行 `runId=arun_…` 指向同一条 RunRecord |
| 错误显示 ERROR | 取一条 `status=failed` 的运行评分 → `ERROR`，理由写明「不计入产品失败率」 |
| 单元测试 | `pnpm test:scorer` → 16 项断言通过（关键词 AND/OR、禁词、价格、能力、风险输入 vs 回复安全、ERROR/REVIEW） |
- **第七段（本次）**：**批量评测与版本对比**——批次逐条真实调用 `runAgent` + 同一个评分器，
  批次可轮询、可刷新回看，两批次可对比（不一致时明确「不可直接比较」）。

## 批量评测与版本对比（`/eval` 底部）

### 批次模型（`data/eval-batch.json`）

`id / name / versionLabel / changeNote / caseIds / caseSetHash / skillVersions / evaluatorVersion / evaluatorHash /
provider / model / params / createdAt / startedAt / finishedAt / status / currentIndex / total /
passed / failed / review / errors / caseResults[]`。

- **caseIds 规则**：不传 → 全部 enabled；传合法数组 → 只跑这些；传 `[]` → 400；含无效 ID → 400 并列出；
- **幂等**：同一套用例已有运行中批次时复用同一批次（`reused: true`），避免重复点击产生重复请求；
- 状态：`queued | running | done | error | cancelled`；单条：`PASS | FAIL | REVIEW | ERROR`；
- 单条 ERROR 不中断批次，只有整批异常才进 `error`；
- 统计恒等式：`total = passed + failed + review + errors`，通过率分母排除 ERROR。

### 对比规则

对比前先校验一致性：caseIds、caseSetHash（问题/关键词/禁词/价格/风控期望）、evaluatorHash、
provider、model、params。任一不同 → `comparable=false` 并列出原因（显示「不可直接比较」），
不会给出「版本变好」的结论。可比时输出：通过率与状态数量、已修复、回归、新增失败、状态不变但回复改变、平均耗时变化。

### 评测方式标注

报告里固定展示「规则评测（rules-v1），Judge 未启用」+ `caseSetHash` / `evaluatorHash` / provider / model，
不显示任何虚假的 Judge 分数。

### 批次 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/eval/batch/run` | 创建批次并在后台执行，202 返回 batchId |
| GET | `/api/eval/batch/[id]` | `{ batch }`；不存在 → 结构化 404（`BATCH_NOT_FOUND`） |
| GET | `/api/eval/batch` | 批次列表（供轮询外的刷新与选择） |
| GET | `/api/eval/compare?base=&target=` | 两批次差异与可比性 |
### 第七段：批量评测与版本对比（32 条断言全 PASS）

| 场景 | 观测结果 |
| --- | --- |
| 选 3 个 caseIds | `total=3`，`caseIds` 与传入完全一致 |
| 只出现这 3 个 case | 结果 `caseId` 集合等于传入集合，每条都有 `runId` |
| 轮询到终态 | `done`；`3 = 1 PASS + 2 FAIL + 0 REVIEW + 0 ERROR` |
| 刷新后仍能查看 | `GET /api/eval/batch/{id}` 返回同样 3 条结果；不存在的 id → 结构化 404 |
| 参数校验 | `[]` → 400；`["ev_scam_prize","ev_nope","ev_bad"]` → 400 且错误文案列出 `ev_nope、ev_bad` |
| baseline / risk-fix-v2 | 停用推荐 Skill 的批次该用例 FAIL；恢复后的批次 PASS |
| 同用例集同评分器 | `comparable=true`，`reasons=[]` |
| 已修复 | `fixed=[{caseId:"ev_office_spicy", from:"FAIL", to:"PASS"}]` |
| 新增失败/回归 | 反向对比 `regressions=1`，不是只给一个上涨的总分 |
| 不可直接比较 | 改一个用例关键词后 `comparable=false`，原因写明「用例快照不同」 |
| 篡改旧批次 | 手改 `passed=999` 后新建批次仍重新计算（`passed=1`），旧值只影响旧批次 |

## 评测存储唯一化（重构，非新增功能）

合并前有两套并行的评测存储，同一批"评测用例"有两个事实来源：

| 旧存储 | 新存储（唯一） |
| --- | --- |
| `data/eval_cases.json`（`evalCaseSchema`：skillKey/intent/input/expected/assertions） | `data/eval-cases.json`（`evalCaseSchemaV2`：question/关键词/禁词/价格/能力/风控） |
| `data/eval_batches.json`（`evalBatchSchema`：通过率、平均分，**模拟执行**） | `data/eval-batch.json`（`evalBatchSchemaV2`：逐用例真实结果 + caseSetHash） |

具体后果（都是真实 bug，不是洁癖）：

1. 运营中心「标注 → 沉淀为评测用例」写的是旧库，`/eval` 页面读新库，**沉淀结果在评测页永远看不到**；
2. `/overview` 的「最新评测通过率」和 `/evals` 的批次表展示的是模拟批次，没有 RunRecord 可回查；
3. `classroom:reset` 只恢复旧的 `eval_batches.json` 快照，旧用例库会随每次操作漂移。

处理：

| 内容 | 处理 |
| --- | --- |
| 20 条旧用例 `ec_001`–`ec_020` | 用 `scripts/lib/eval-legacy.mjs` 转成 V2 并入 `eval-cases.json`；id 不变（标注引用不断），旧断言全文进 `expectedBehavior`，`enabled=false` |
| 8 条旧批次 `eb_001`–`eb_008` | **不迁移**（无真实执行），原件归档到 `scripts/archive/legacy-eval-v1/` |
| `POST /api/eval-batches` | 410 + `code=ENDPOINT_GONE`，指明改用 `/api/eval/batch/run` |
| `GET /api/eval-batches` | 保留为只读别名，与 `eval-batch.json` 同源 |
| 模拟批次的写入函数与 `RunBatchForm` 组件 | 删除（`mutations.createEvalBatch`、`components/actions/run-batch-form.tsx`） |
| 评分器 | 新增保护：一条机器可判断言都没配的用例 → `REVIEW`，不再因「关键词为空 = AND 全通过」被判 PASS |

### 验收（`pnpm verify`，59 条断言全 PASS）

| 场景 | 观测结果 |
| --- | --- |
| 旧存储已移除 | `data/eval_cases.json`、`data/eval_batches.json` 均不存在 |
| 旧地址不再作为集合渲染 | `/data/eval_cases` 不渲染 `eval_cases.json`（对照 `/data/eval-cases` 正常渲染；Next 16 流式页的 HTTP 状态仍是 200，故断言看内容） |
| 模拟批次下线 | `POST /api/eval-batches` → 410，文案含 `/api/eval/batch/run` |
| 只读别名同源 | `GET /api/eval-batches` 条数 == `eval-batch.json` 条数 |
| 标注沉淀落进唯一存储 | `PATCH /api/annotations/{id} {action:"to_eval_case"}` → 返回 `ev_*` 且 `enabled=false`，`GET /api/eval` 立即可见，`sourceRunId` 指向真实 run |
| 重置基线 | `classroom:reset` 后 `eval-cases.json` 条数 == fixture 条数（29：9 条机器可判 + 20 条迁移停用） |
| 迁移用例不会伪造 PASS | 启用 `ec_001` 后跑真实批次 → `REVIEW`，原因「用例没有配置任何机器可判断言」，证据含 `no-machine-checkable-assertion` |
| 从零重建 | `SNACKOPS_DATA_DIR=<tmp>` 下 `seed → seed-registry → seed-eval`：21 个文件、29 条用例、0 个旧文件 |

## 已知限制 / 下一步

- 本机没有外部模型密钥，默认跑的是 `classroom-fixture`（确定性输出，界面与 RunRecord 都标注了）；
  接真实模型只需设置 `LLM_PROVIDER=openai-compatible` + 三个 env，链路不用改；
- `coze` 适配器按 SDK 0.7.x 的 `LLMClient.invoke` 写好，但本机没有安装 `coze-coding-dev-sdk`，未实测真实调用；
- Planner 的 Tool 入参：Plan 可带 `toolInputs`，缺省时用注册表的 `sampleInput`（fixture 只做关键词级绑定）；
- 评测批次**不再有模拟执行**：旧的「按用例 id 稳定散列」写批次的做法已删除（`POST /api/eval-batches` 返回 410），
  批次只能由 `/api/eval/batch/run` 逐条真实调用 Agent 产生；
- Skill 正文没有真实调用模型，`model / temperature / maxTokens` 是给执行器读取的配置；
- `skills/refund-policy.md` 等 4 个文件是 v1 骨架期的场景说明，不参与运行时（映射见 `skills/README.md`）；
- 运营操作人固定为「值班运营 · 林小满」，接入登录后替换 `OPERATOR`；
- 改进项只做状态展示与创建，流转审批待后续版本。

## v0.1 的边界（没做的部分）

| 没做 | 原因 / 影响 |
| --- | --- |
| 登录与多租户 | 单人运营台，`OPERATOR` 写死；接口无鉴权，**不要直接暴露到公网** |
| 数据库 | 存储是本地 JSON（原子写 + 文件锁 + `.bak` 恢复），适合演示与单机部署，不适合多实例 |
| CI / 容器化 | 本机用 `pnpm validate` + `pnpm verify` 当门禁，没有 GitHub Actions 与 Dockerfile |
| 真实模型评测 | 默认 `classroom-fixture` 确定性输出，用来保证课堂演示可复现；真实模型接入代码已就绪但未实测 |
| 模型评判（LLM Judge） | 用例可带 `llmJudgePrompt`，目前判 `REVIEW` 而不是编一个分数 |
| 浏览器端 E2E | 全部断言在 HTTP / 页面 HTML 层，未接 Playwright |

## 参考

- 版本：`v0.1.0`（2026-10）
- 许可：MIT（见 `LICENSE`）
- 启动脚本：`run-dev.bat` / `run-prod.bat` / `run-verify.bat`

