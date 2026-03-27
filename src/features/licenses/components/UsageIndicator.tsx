import { License } from "../types";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface UsageItemProps {
  readonly label: string;
  readonly used: number;
  readonly max: number | null;
}

function UsageItem({ label, used, max }: UsageItemProps) {
  const isUnlimited = max === null;
  const percentage = isUnlimited ? 0 : Math.min((used / max) * 100, 100);
  
  const getStatusColor = () => {
    if (isUnlimited) return "bg-emerald-500";
    if (percentage >= 90) return "bg-destructive";
    if (percentage >= 70) return "bg-amber-500";
    return "bg-emerald-500";
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex flex-col gap-1 w-full cursor-help">
            <div className="flex justify-between items-center text-[9px] uppercase font-bold text-muted-foreground/70 tracking-wider">
              <span>{label}</span>
              <span className={cn(percentage >= 90 ? "text-destructive" : "")}>
                {used}{isUnlimited ? "" : ` / ${max}`}
              </span>
            </div>
            <Progress 
              value={isUnlimited ? 100 : percentage} 
              className={cn("h-1.5", isUnlimited ? "opacity-30" : "")}
              indicatorClassName={getStatusColor()}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-[10px] font-medium">
          {label}: {used} {isUnlimited ? "usos (Ilimitado)" : `de ${max} usos permitidos`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function UsageIndicator({ license }: { readonly license: License }) {
  return (
    <div className="flex flex-col gap-2 min-w-[120px]">
      <UsageItem 
        label="Manual" 
        used={license.usage_manual || 0} 
        max={license.max_manual} 
      />
      <UsageItem 
        label="Turbo" 
        used={license.usage_turbo || 0} 
        max={license.max_turbo} 
      />
      <UsageItem 
        label="Agro" 
        used={license.usage_agro || 0} 
        max={license.max_agro} 
      />
    </div>
  );
}
