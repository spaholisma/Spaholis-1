/**
 * Switches for whole features that are paused, not deleted.
 *
 * The Teacher Admin Panel (/teacher) is off since 2026-10: the teachers chose
 * not to use it, and Holis Wellness Center runs the classes, passes, coupons
 * and payments itself. Its code stays as it is — set this back to true to
 * open the panel again (the menu link, the My Account card and the route).
 */
export const TEACHER_PANEL_ENABLED = false;

/**
 * The Wellness Programs promo window that opened a moment after the site was
 * opened. Off since 2026-10 (the team asked to take it down). The component
 * stays (src/components/PromoPopup.tsx) — set this back to true to show it again.
 */
export const PROMO_POPUP_ENABLED = false;
