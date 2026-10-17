import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";

import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SnackOps · 零食客服 Agent 运营台",
    template: "%s · SnackOps",
  },
  description:
    "零食电商客服 Agent 的运营平台：统一观测 Planner / Skill / Tool / Eval 的运行质量，把 badcase 推进到上线。",
  applicationName: "SnackOps",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#fbf7f0",
  width: "device-width",
  initialScale: 1,
};

// 数据来自服务端 JSON 文件，任何页面都必须在请求时读取，不能静态化。
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-background text-foreground min-h-dvh antialiased">
        <AppShell>{children}</AppShell>
        <Toaster
          position="top-center"
          theme="light"
          closeButton
          richColors
          toastOptions={{
            style: { fontSize: "13px" },
          }}
        />
      </body>
    </html>
  );
}
