"use client";

import * as React from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApiAction } from "@/hooks/use-api-action";

interface ToolOption {
  id: string;
  name: string;
}

/**
 * Skill 运行参数编辑：模型、温度、Token 上限、依赖工具。
 * 正文改动不在这里（走 SkillEditor），避免一次提交两种变更。
 */
export function SkillMetaForm({
  skillId,
  skill,
  tools,
}: {
  skillId: string;
  skill: {
    name: string;
    description: string;
    stage: string;
    model: string;
    temperature: number;
    maxTokens: number;
    requiredTools: string[];
    owner: string;
  };
  tools: ToolOption[];
}) {
  const { run, pending } = useApiAction();
  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [stage, setStage] = React.useState(skill.stage);
  const [model, setModel] = React.useState(skill.model);
  const [temperature, setTemperature] = React.useState(String(skill.temperature));
  const [maxTokens, setMaxTokens] = React.useState(String(skill.maxTokens));
  const [owner, setOwner] = React.useState(skill.owner);
  const [requiredTools, setRequiredTools] = React.useState<string[]>(skill.requiredTools);

  function toggleTool(toolId: string) {
    setRequiredTools((current) =>
      current.includes(toolId) ? current.filter((id) => id !== toolId) : [...current, toolId],
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = await run(`/api/skills/${skillId}`, {
      method: "PATCH",
      body: {
        name: name.trim(),
        description: description.trim(),
        stage,
        model: model.trim(),
        temperature: Number(temperature),
        maxTokens: Number(maxTokens),
        owner: owner.trim(),
        requiredTools,
      },
      successMessage: "Skill 运行参数已保存",
    });
    if (!payload) toast.error("保存失败，请检查字段");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 px-4 py-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="skill-name">名称</Label>
          <Input id="skill-name" value={name} onChange={(event) => setName(event.target.value)} className="h-8 text-[12.5px]" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="skill-stage">流水线阶段</Label>
          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger id="skill-stage" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["输入理解", "决策", "生成", "守卫", "收口"].map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="skill-description">描述</Label>
        <Input
          id="skill-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="h-8 text-[12.5px]"
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="skill-model">模型</Label>
          <Input
            id="skill-model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            className="h-8 font-mono text-[12px]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="skill-temp">温度</Label>
          <Input
            id="skill-temp"
            type="number"
            step="0.05"
            min={0}
            max={2}
            value={temperature}
            onChange={(event) => setTemperature(event.target.value)}
            className="h-8 tabular text-[12px]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="skill-tokens">Max Tokens</Label>
          <Input
            id="skill-tokens"
            type="number"
            min={128}
            max={32768}
            step={64}
            value={maxTokens}
            onChange={(event) => setMaxTokens(event.target.value)}
            className="h-8 tabular text-[12px]"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>依赖工具（Planner 只会在这几个工具内选择）</Label>
        <div className="flex flex-wrap gap-1.5">
          {tools.map((tool) => {
            const checked = requiredTools.includes(tool.id);
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => toggleTool(tool.id)}
                aria-pressed={checked}
                className={`rounded-md border px-2 py-1 text-[11.5px] transition-colors ${
                  checked
                    ? "border-primary/40 bg-primary/12 text-[color:var(--primary)]"
                    : "border-border text-muted-foreground hover:bg-accent"
                }`}
                title={tool.id}
              >
                {tool.name}
                <span className="ml-1 font-mono text-[10px] opacity-70">{checked ? "✓" : "+"}</span>
              </button>
            );
          })}
        </div>
        <p className="text-muted-foreground text-[10.5px]">
          已选 {requiredTools.length} 个
          {requiredTools.length === 0 ? "（纯生成类 Skill 不需要工具）" : `：${requiredTools.join("、")}`}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="skill-owner">负责人</Label>
          <Input
            id="skill-owner"
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
            className="h-8 text-[12.5px]"
          />
        </div>
        <div className="flex items-end justify-end">
          <Button type="submit" size="sm" disabled={pending}>
            <Save aria-hidden />
            {pending ? "保存中…" : "保存参数"}
          </Button>
        </div>
      </div>
    </form>
  );
}
