"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFilterNavigation } from "@/hooks/use-filter-navigation";

export interface FilterOption {
  value: string;
  label: string;
}

/** 服务端筛选用的下拉：值写入 URL query，页面在服务端重新计算 */
export function FilterSelect({
  param,
  value,
  options,
  placeholder,
  className,
  ariaLabel,
}: {
  param: string;
  value: string | null;
  options: FilterOption[];
  placeholder: string;
  className?: string;
  ariaLabel?: string;
}) {
  const { update, isPending } = useFilterNavigation();
  return (
    <Select
      value={value ?? "all"}
      onValueChange={(next) => update({ [param]: next === "all" ? null : next })}
      disabled={isPending}
    >
      <SelectTrigger size="sm" className={className} aria-label={ariaLabel ?? placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
