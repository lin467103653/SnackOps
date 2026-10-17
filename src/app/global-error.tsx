"use client";

import { AlertOctagon } from "lucide-react";

/**
 * 根布局级别的兜底：这里发生错误时全局样式可能还没生效，
 * 所以使用内联样式，保证用户至少能看到可读的错误信息。
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fbf8f3",
          color: "#2f2a24",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 520, textAlign: "center" }}>
          <AlertOctagon size={28} style={{ color: "#b45309" }} aria-hidden />
          <h1 style={{ fontSize: 18, margin: "12px 0 6px" }}>SnackOps 启动失败</h1>
          <p style={{ fontSize: 13, lineHeight: 1.7, color: "#6b6157", margin: 0 }}>
            应用根布局渲染时发生错误，页面无法继续加载。请重试；若问题持续，检查 data/ 下的 JSON 文件与服务端日志。
          </p>
          <pre
            style={{
              marginTop: 12,
              padding: "8px 10px",
              background: "#f1ece4",
              borderRadius: 8,
              fontSize: 11,
              textAlign: "left",
              whiteSpace: "pre-wrap",
            }}
          >
            {error.message}
          </pre>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 12,
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid #d8cfc3",
              background: "#fff",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            重试
          </button>
        </div>
      </body>
    </html>
  );
}
