"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cookie, Database, Menu, Settings2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { findNavItem, navGroups, navItems } from "@/lib/nav";
import { cn } from "@/lib/utils";

function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-4">
      <span className="bg-primary/12 text-primary flex size-9 items-center justify-center rounded-lg" aria-hidden>
        <Cookie className="size-5" />
      </span>
      <div className="min-w-0 leading-tight">
        <Link href="/" onClick={onNavigate} className="block text-[15px] font-semibold tracking-tight">
          SnackOps
        </Link>
        <span className="text-muted-foreground text-[11px]">零食客服 Agent 运营台</span>
      </div>
    </div>
  );
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="主导航" className="flex flex-col gap-4 px-3 pb-4">
      {navGroups.map((group) => {
        const items = navItems.filter((item) => item.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group} className="flex flex-col gap-0.5">
            <p className="text-muted-foreground/80 px-2 pb-1 text-[10px] font-medium tracking-widest uppercase">{group}</p>
            {items.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                    active
                      ? "bg-sidebar-accent text-foreground font-medium"
                      : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-foreground",
                  )}
                >
                  <Icon
                    aria-hidden
                    className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground/80 group-hover:text-foreground")}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

function StorageNote() {
  return (
    <div className="border-sidebar-border space-y-1 border-t px-4 py-3">
      <div className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
        <Database aria-hidden className="size-3" />
        <span>服务端 JSON 存储</span>
      </div>
      <p className="text-muted-foreground/70 text-[10px] leading-relaxed">
        原子写入 + 文件锁 · v0.1.0
      </p>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const activeItem = findNavItem(pathname);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[236px_minmax(0,1fr)]">
      <a
        href="#main-content"
        className="focus:bg-card focus:text-foreground sr-only rounded-md px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:shadow"
      >
        跳到主内容
      </a>

      <aside className="bg-sidebar border-sidebar-border hidden border-r lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <Brand />
        <div className="scroll-area-thin flex-1 overflow-y-auto">
          <NavList pathname={pathname} />
        </div>
        <StorageNote />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="bg-background/85 sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b px-3 backdrop-blur-sm sm:px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="打开导航菜单"
          >
            <Menu />
          </Button>
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-[13px] font-medium">{activeItem?.label ?? "SnackOps"}</span>
            <span className="text-muted-foreground hidden truncate text-[11px] md:inline">{activeItem?.description}</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Badge variant="outline" className="hidden gap-1 font-normal lg:inline-flex">
              <Database aria-hidden className="size-3" />
              data/*.json
            </Badge>
            <Button asChild variant="ghost" size="icon-sm">
              <Link href="/settings" aria-label="运行时配置">
                <Settings2 />
              </Link>
            </Button>
          </div>
        </header>

        <main id="main-content" className="mx-auto w-full max-w-[1440px] flex-1 px-3 py-4 sm:px-4 lg:px-6 lg:py-5">
          {children}
        </main>
      </div>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent
          showCloseButton={false}
          className="bg-sidebar top-0 left-0 h-dvh w-72 max-w-[82vw] translate-x-0 translate-y-0 grid-rows-[auto_1fr_auto] gap-0 rounded-none border-0 border-r p-0 sm:max-w-[82vw]"
        >
          <DialogTitle className="sr-only">导航菜单</DialogTitle>
          <DialogDescription className="sr-only">选择需要查看的运营模块</DialogDescription>
          <Brand onNavigate={() => setMobileOpen(false)} />
          <div className="scroll-area-thin overflow-y-auto">
            <NavList pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </div>
          <StorageNote />
        </DialogContent>
      </Dialog>
    </div>
  );
}
