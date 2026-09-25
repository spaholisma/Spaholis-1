import { Badge } from "@/components/ui/badge";
import { Infinity as InfinityIcon, Ticket } from "lucide-react";
import { useMyOfferings } from "@/hooks/useOfferings";
import { useOfferingEligibilityMap, filterEligibleOfferings } from "@/hooks/useOfferingEligibility";
import { cn } from "@/lib/utils";

interface Props {
  classId: string;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Renders a "Included in your membership" / "Use a class credit" badge
 * if the signed-in user has an offering valid for this class.
 * Renders nothing if the user has no eligible offerings (or isn't signed in).
 */
export function ClassEligibilityBadge({ classId, size = "md", className }: Props) {
  const { data: myOfferings = [] } = useMyOfferings();
  const { data: eligibilityMap = {} } = useOfferingEligibilityMap();

  const eligible = filterEligibleOfferings(myOfferings, classId, eligibilityMap);
  if (eligible.length === 0) return null;

  const membership = eligible.find((o) => o.type === "membership");
  const pass = eligible.find((o) => o.type === "class_pass" && (o.credits_remaining ?? 0) > 0);

  if (!membership && !pass) return null;

  const isSm = size === "sm";

  if (membership) {
    return (
      <Badge
        variant="secondary"
        className={cn(
          "gap-1 bg-spa-sage/15 text-spa-sage border-spa-sage/30 hover:bg-spa-sage/20",
          isSm && "px-1.5 py-0 text-[11px]",
          className,
        )}
      >
        <InfinityIcon className={cn(isSm ? "h-2.5 w-2.5" : "h-3 w-3")} />
        {isSm ? "Member" : "Included in your membership"}
      </Badge>
    );
  }

  return (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1 bg-spa-sage/15 text-spa-sage border-spa-sage/30 hover:bg-spa-sage/20",
        isSm && "px-1.5 py-0 text-[11px]",
        className,
      )}
    >
      <Ticket className={cn(isSm ? "h-2.5 w-2.5" : "h-3 w-3")} />
      {isSm ? "1 credit" : "Use 1 class credit"}
    </Badge>
  );
}
