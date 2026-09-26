import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The "Back" at the top of a booking or request form — visible without
 * scrolling. What it does is up to the page: one step back inside the form, or
 * out of the form on its first step (see useLeaveFlow).
 */
export function FlowBackButton({
  onClick, disabled, label, className,
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className={cn("-ml-2 gap-1 text-muted-foreground hover:text-foreground", className)}
    >
      <ChevronLeft className="h-4 w-4" />
      {label ?? t("common.back", { defaultValue: "Back" })}
    </Button>
  );
}
