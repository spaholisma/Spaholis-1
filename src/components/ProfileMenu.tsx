import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarDays, LogOut, ShieldCheck, User, UserCog } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useStaffRole } from "@/hooks/useStaffRole";
import { useLanguage, withLangPrefix } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

/** Initials for the round profile button: two letters from the name, else the email's first. */
export function profileInitials(name: string | null | undefined, email: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length) return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (email ?? "?").trim().charAt(0).toUpperCase() || "?";
}

/**
 * The signed-in person's menu in the top bar: a round button with their
 * initials that opens their account, their profile, the Admin Panel for the
 * team, and signing out — each with its icon.
 */
export function ProfileMenu({ myAccountLabel, signOutLabel }: { myAccountLabel: string; signOutLabel: string }) {
  const { user, signOut } = useAuth();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const staff = useStaffRole();
  if (!user) return null;

  const name = ((user.user_metadata as any)?.full_name as string | undefined)?.trim() || null;
  const email = user.email ?? null;
  const lp = (p: string) => withLangPrefix(p, language);
  const calendarOnly = staff === "coordinator" || staff === "viewer";
  const item = "cursor-pointer gap-2.5 py-2";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("nav.profileMenu", { defaultValue: "Your account menu" })}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full bg-spa-sage/20 text-foreground",
            "font-body text-xs font-semibold ring-1 ring-spa-sage/40 transition-colors hover:bg-spa-sage/30",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {profileInitials(name, email)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-60 rounded-xl p-1.5">
        <DropdownMenuLabel className="px-2 py-2 font-normal">
          <p className="truncate font-body text-sm font-medium text-foreground">{name || myAccountLabel}</p>
          {email && <p className="truncate font-body text-xs text-muted-foreground">{email}</p>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className={item}>
          <Link to={lp("/dashboard")}>
            <User className="h-4 w-4 text-muted-foreground" /> {myAccountLabel}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={item}>
          <Link to={lp("/dashboard#profile")}>
            <UserCog className="h-4 w-4 text-muted-foreground" /> {t("nav.myProfile", { defaultValue: "My profile" })}
          </Link>
        </DropdownMenuItem>
        {staff && (
          <DropdownMenuItem asChild className={item}>
            <Link to="/admin">
              {calendarOnly
                ? <CalendarDays className="h-4 w-4 text-muted-foreground" />
                : <ShieldCheck className="h-4 w-4 text-muted-foreground" />}
              {calendarOnly
                ? t("nav.treatmentsCalendar", { defaultValue: "Treatments calendar" })
                : t("nav.adminPanel", { defaultValue: "Admin Panel" })}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut()} className={cn(item, "text-destructive focus:text-destructive")}>
          <LogOut className="h-4 w-4" /> {signOutLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
