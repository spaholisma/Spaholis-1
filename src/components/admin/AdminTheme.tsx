import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Save, RotateCcw, Paintbrush } from "lucide-react";
import {
  applyTheme,
  clearTheme,
  DEFAULT_THEME,
  THEME_LABELS,
  hexToHslStr,
  hslStrToHex,
  type Theme,
  type ThemeColorKey,
} from "@/lib/theme";
import { toast } from "sonner";

const COLOR_KEYS = Object.keys(THEME_LABELS) as ThemeColorKey[];

export function AdminTheme() {
  const queryClient = useQueryClient();
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("site_content").select("content").eq("section_key", "theme").maybeSingle();
      const saved = (data?.content as Theme) || null;
      setTheme(
        saved
          ? { colors: { ...DEFAULT_THEME.colors, ...(saved.colors || {}) }, radius: saved.radius ?? DEFAULT_THEME.radius }
          : DEFAULT_THEME,
      );
      setLoading(false);
    })();
    // Re-apply the persisted theme when leaving so unsaved previews don't stick.
    return () => {
      clearTheme();
      queryClient.invalidateQueries({ queryKey: ["site-theme"] });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live preview: apply on every change so the whole admin recolors.
  useEffect(() => {
    if (!loading) applyTheme(theme);
  }, [theme, loading]);

  const setColor = (key: ThemeColorKey, hex: string) =>
    setTheme((t) => ({ ...t, colors: { ...t.colors, [key]: hexToHslStr(hex) } }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("site_content")
        .upsert({ section_key: "theme", content: theme as any, updated_at: new Date().toISOString() }, { onConflict: "section_key" });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["site-theme"] });
      toast.success("Theme saved and published");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save theme");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setTheme(DEFAULT_THEME);
    toast.info("Reset to default palette (click Save to publish)");
  };

  if (loading) return <p className="text-sm text-muted-foreground font-body">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <Paintbrush className="h-5 w-5" /> Theme &amp; Colors
          </h2>
          <p className="text-sm text-muted-foreground font-body max-w-2xl">
            Change the site’s color palette and button roundness. Preview updates live as you pick; click Save to publish to the live site.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleReset}><RotateCcw className="h-4 w-4 mr-1" /> Reset defaults</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : (<><Save className="h-4 w-4 mr-1" /> Save Changes</>)}</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {COLOR_KEYS.map((key) => {
          const hex = hslStrToHex(theme.colors[key]);
          return (
            <Card key={key}>
              <CardContent className="pt-4 flex items-center gap-3">
                <input
                  type="color"
                  value={hex}
                  onChange={(e) => setColor(key, e.target.value)}
                  className="h-11 w-11 rounded-lg border border-border cursor-pointer bg-transparent p-0.5 shrink-0"
                  aria-label={THEME_LABELS[key]}
                />
                <div className="min-w-0">
                  <p className="font-body text-sm font-medium text-foreground">{THEME_LABELS[key]}</p>
                  <p className="font-mono text-xs text-muted-foreground uppercase">{hex}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Radius */}
      <Card>
        <CardContent className="pt-4 space-y-2">
          <Label className="text-sm font-medium">Button &amp; card roundness — {theme.radius.toFixed(2)} rem</Label>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={theme.radius}
            onChange={(e) => setTheme((t) => ({ ...t, radius: parseFloat(e.target.value) }))}
            className="w-full max-w-md accent-spa-sage"
          />
        </CardContent>
      </Card>

      {/* Live preview */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Preview</p>
        <div className="rounded-2xl border border-border bg-background p-6 space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button variant="spa">Sage button</Button>
            <Button variant="default">Primary button</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost" className="border border-spa-charcoal/30">Ghost</Button>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="rounded-2xl bg-spa-sage text-spa-cream px-5 py-3 text-sm font-body">Sage surface</div>
            <div className="rounded-2xl bg-primary text-primary-foreground px-5 py-3 text-sm font-body">Primary surface</div>
            <div className="rounded-2xl bg-spa-charcoal text-spa-cream px-5 py-3 text-sm font-body">Charcoal surface</div>
            <div className="rounded-2xl bg-card border border-border text-foreground px-5 py-3 text-sm font-body">Card</div>
          </div>
        </div>
      </div>
    </div>
  );
}
