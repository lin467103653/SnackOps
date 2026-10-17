"use client";

import * as React from "react";

export interface OpsTab {
  id: string;
  label: string;
  hint?: string;
  content: React.ReactNode;
}

/**
 * 运营中心的横向 Tab 容器。
 * 只负责切换布局：每个 tab 的内容都是服务端渲染好的节点，功能与之前完全一致。
 */
export function OpsTabs({ tabs }: { tabs: OpsTab[] }) {
  const [active, setActive] = React.useState(tabs[0]?.id ?? "");
  const activeTab = tabs.find((tab) => tab.id === active) ?? tabs[0];

  return (
    <div className="space-y-3">
      <div className="border-border -mx-1 overflow-x-auto border-b" role="tablist" aria-label="运营中心分区">
        <div className="flex min-w-max gap-1 px-1">
          {tabs.map((tab) => {
            const selected = tab.id === activeTab?.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`ops-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`ops-panel-${tab.id}`}
                onClick={() => setActive(tab.id)}
                className={[
                  "relative shrink-0 rounded-t-md px-3 py-1.5 text-[12.5px] transition-colors",
                  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                  selected
                    ? "text-foreground bg-card border-border border border-b-transparent font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/60 border border-transparent",
                ].join(" ")}
              >
                {tab.label}
                {tab.hint ? <span className="text-muted-foreground ml-1 text-[10.5px]">{tab.hint}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel" id={`ops-panel-${activeTab?.id ?? "none"}`} aria-labelledby={`ops-tab-${activeTab?.id ?? "none"}`}>
        {activeTab?.content}
      </div>
    </div>
  );
}
