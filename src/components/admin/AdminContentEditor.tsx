import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, RotateCcw, Languages, Copy, Eraser, Eye, RefreshCw, ExternalLink, Bold, Italic, Link2, Search, Image as ImageIcon, ChevronDown, ChevronRight, Pencil, X } from "lucide-react";
import { content as defaults, seo as seoDefaults } from "@/data/content";
import { useSaveContent, setPreviewOverrides } from "@/hooks/useSiteContent";
import { supabase } from "@/integrations/supabase/client";
import { ImageUploadField } from "./ImageUploadField";
import { toast } from "sonner";

const IMAGE_KEY_PATTERNS = /^(.*image.*|.*img.*|.*logo.*|.*avatar.*|.*photo.*|.*thumbnail.*|.*banner.*|.*icon.*|.*background.*)$/i;

/* ============================================================
 * Raw fetch (bypasses merging done by useSiteContent)
 * ============================================================ */
function useRawSection<T>(key: string, fallback: T) {
  return useQuery({
    queryKey: ["site-content-raw", key],
    queryFn: async (): Promise<T> => {
      const { data } = await supabase
        .from("site_content")
        .select("content")
        .eq("section_key", key)
        .maybeSingle();
      // For ES rows, return empty object so missing keys = "fall back to EN"
      if (!data?.content) return key.endsWith("_es") ? ({} as T) : fallback;
      return data.content as T;
    },
    staleTime: 0,
  });
}

/* ============================================================
 * Path helpers
 * ============================================================ */
function setNestedValue(obj: any, path: string[], value: any): any {
  if (path.length === 0) return value;
  const result = obj == null ? {} : Array.isArray(obj) ? [...obj] : { ...obj };
  if (path.length === 1) {
    if (value === undefined || value === "") delete result[path[0]];
    else result[path[0]] = value;
    return result;
  }
  const [head, ...rest] = path;
  result[head] = setNestedValue(result[head], rest, value);
  return result;
}

function getNestedValue(obj: any, path: string[]): any {
  return path.reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

const TRANSLATABLE_KEY_HINT = /(title|subtitle|label|text|name|description|tagline|intent|eyebrow|note|message|copy|heading|body|caption|cta|placeholder|alt|hero|footer|content|tag|bio|role|question|answer|excerpt|item)/i;

function isImageValue(key: string, value: string) {
  return IMAGE_KEY_PATTERNS.test(key) || /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg|avif)/i.test(value);
}

function isUrlOrLink(key: string) {
  return /^(link|url|href|to)$/i.test(key);
}

// Long free-text leaves where rich formatting (links / bold) is offered in the
// editor. Kept broad; the public <RichText> renderer is backward-compatible so
// plain values are unaffected.
const RICH_TEXT_KEY_HINT = /(description|subtitle|tagline|intent|body|bio|copyright|text|note|message|paragraph|caption|answer|excerpt|quote|blurb)/i;
function isRichTextField(key: string) {
  return RICH_TEXT_KEY_HINT.test(key) && !isUrlOrLink(key);
}

// Whether a node (or any descendant) should show under the current search query
// / images-only filter. Used to hide non-matching fields and empty sections.
function subtreeVisible(key: string, value: any, query: string, imagesOnly: boolean): boolean {
  const q = query.trim().toLowerCase();
  if (value == null) return false;
  if (typeof value === "string") {
    if (imagesOnly && !isImageValue(key, value)) return false;
    if (q && !(key.toLowerCase().includes(q) || value.toLowerCase().includes(q))) return false;
    return true;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    if (imagesOnly) return false;
    if (q && !(key.toLowerCase().includes(q) || String(value).toLowerCase().includes(q))) return false;
    return true;
  }
  if (Array.isArray(value)) return value.some((it, i) => subtreeVisible(String(i), it, query, imagesOnly));
  if (typeof value === "object") return Object.entries(value).some(([k, v]) => subtreeVisible(k, v, query, imagesOnly));
  return false;
}

// Insert markdown around the current selection of a textarea and push the new
// value back through onChange. Used by the small format toolbar.
function applyMarkdown(fieldId: string, current: string, before: string, after: string, fallback: string, onChange: (v: string) => void) {
  const el = document.getElementById(fieldId) as HTMLTextAreaElement | null;
  const start = el?.selectionStart ?? current.length;
  const end = el?.selectionEnd ?? current.length;
  const sel = current.slice(start, end) || fallback;
  const next = current.slice(0, start) + before + sel + after + current.slice(end);
  onChange(next);
}

/* ============================================================
 * Small markdown format toolbar (bold / italic / link)
 * ============================================================ */
function FormatBar({ fieldId, value, onChange }: { fieldId: string; value: string; onChange: (v: string) => void }) {
  const btn = "inline-flex items-center justify-center h-6 w-6 rounded border border-border bg-background hover:bg-muted transition-colors";
  return (
    <div className="flex items-center gap-1">
      <button type="button" className={btn} title="Bold" onMouseDown={(e) => e.preventDefault()}
        onClick={() => applyMarkdown(fieldId, value, "**", "**", "bold text", onChange)}>
        <Bold className="h-3 w-3" />
      </button>
      <button type="button" className={btn} title="Italic" onMouseDown={(e) => e.preventDefault()}
        onClick={() => applyMarkdown(fieldId, value, "*", "*", "italic text", onChange)}>
        <Italic className="h-3 w-3" />
      </button>
      <button type="button" className={btn} title="Insert link — [text](https://…)" onMouseDown={(e) => e.preventDefault()}
        onClick={() => applyMarkdown(fieldId, value, "[", "](https://)", "link text", onChange)}>
        <Link2 className="h-3 w-3" />
      </button>
      <span className="text-[10px] text-muted-foreground ml-1">formatting &amp; links</span>
    </div>
  );
}

/* ============================================================
 * Bilingual field renderer
 *
 * For each leaf:
 *   • text strings that look translatable  → side-by-side EN / ES inputs
 *   • image / link / number / boolean      → single English-only control
 *
 * EN values write to enRoot. ES values write to esRoot. Empty ES means
 * "fall back to English" thanks to the merge logic in useSiteContent.
 * ============================================================ */
function BilingualFields({
  enValue,
  esValue,
  path,
  onEnChange,
  onEsChange,
  labels,
  query = "",
  imagesOnly = false,
}: {
  enValue: any;
  esValue: any;
  path: string[];
  onEnChange: (path: string[], value: any) => void;
  onEsChange: (path: string[], value: any) => void;
  labels?: Record<string, string>;
  query?: string;
  imagesOnly?: boolean;
}) {
  if (enValue == null) return null;

  return (
    <>
      {Object.entries(enValue).map(([key, value]) => {
        const currentPath = [...path, key];
        const fieldId = currentPath.join(".");
        const label = labels?.[key] || key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
        const esVal = esValue?.[key];

        if (value == null) return null;
        if (!subtreeVisible(key, value, query, imagesOnly)) return null;

        /* ---------- strings ---------- */
        if (typeof value === "string") {
          if (isImageValue(key, value)) {
            return (
              <ImageUploadField
                key={fieldId}
                fieldId={fieldId}
                label={label}
                value={value}
                onChange={(val) => onEnChange(currentPath, val)}
              />
            );
          }

          // Non-translatable single-column field (URLs, anchors, internal keys)
          const translatable = TRANSLATABLE_KEY_HINT.test(key) && !isUrlOrLink(key);
          if (!translatable) {
            return (
              <div key={fieldId} className="space-y-1.5">
                <Label htmlFor={fieldId} className="text-sm font-medium">{label}</Label>
                <Input
                  id={fieldId}
                  value={value}
                  onChange={(e) => onEnChange(currentPath, e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            );
          }

          const isLong = value.length > 80 || (typeof esVal === "string" && esVal.length > 80);
          const Field = isLong ? Textarea : Input;

          return (
            <div key={fieldId} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label htmlFor={fieldId} className="text-sm font-medium">{label}</Label>
                {isRichTextField(key) && (
                  <FormatBar fieldId={`${fieldId}.en`} value={value} onChange={(v) => onEnChange(currentPath, v)} />
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">EN</span>
                  <Field
                    id={`${fieldId}.en`}
                    value={value}
                    rows={isLong ? 3 : undefined as any}
                    onChange={(e: any) => onEnChange(currentPath, e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-primary flex items-center gap-1">
                    <Languages className="h-3 w-3" /> ES
                    <span className="text-muted-foreground font-normal normal-case ml-1">(blank = use English)</span>
                  </span>
                  <Field
                    id={`${fieldId}.es`}
                    value={typeof esVal === "string" ? esVal : ""}
                    rows={isLong ? 3 : undefined as any}
                    placeholder={value}
                    onChange={(e: any) => onEsChange(currentPath, e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>
            </div>
          );
        }

        /* ---------- numbers / booleans (English only — no translation needed) ---------- */
        if (typeof value === "number") {
          return (
            <div key={fieldId} className="space-y-1.5">
              <Label htmlFor={fieldId} className="text-sm font-medium">{label}</Label>
              <Input
                id={fieldId}
                type="number"
                value={value}
                onChange={(e) => onEnChange(currentPath, parseFloat(e.target.value) || 0)}
                className="font-mono text-sm max-w-xs"
              />
            </div>
          );
        }

        if (typeof value === "boolean") {
          return (
            <div key={fieldId} className="flex items-center justify-between py-2">
              <Label htmlFor={fieldId} className="text-sm font-medium">{label}</Label>
              <Switch
                id={fieldId}
                checked={value}
                onCheckedChange={(checked) => onEnChange(currentPath, checked)}
              />
            </div>
          );
        }

        /* ---------- arrays ---------- */
        if (Array.isArray(value)) {
          if (value.length === 0) return null;

          if (typeof value[0] === "string") {
            const esArr: string[] = Array.isArray(esVal) ? (esVal as string[]) : [];
            return (
              <div key={fieldId} className="space-y-2">
                <Label className="text-sm font-medium">{label}</Label>
                {value.map((item: string, i: number) => (
                  <div key={`${fieldId}.${i}`} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">EN #{i + 1}</span>
                      <Input
                        value={item}
                        onChange={(e) => {
                          const newArr = [...value];
                          newArr[i] = e.target.value;
                          onEnChange(currentPath, newArr);
                        }}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-primary flex items-center gap-1">
                        <Languages className="h-3 w-3" /> ES #{i + 1}
                      </span>
                      <Input
                        value={esArr[i] ?? ""}
                        placeholder={item}
                        onChange={(e) => {
                          const newArr = [...esArr];
                          newArr[i] = e.target.value;
                          onEsChange(currentPath, newArr);
                        }}
                        className="text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            );
          }

          if (typeof value[0] === "object") {
            const esArr: any[] = Array.isArray(esVal) ? esVal : [];
            return (
              <div key={fieldId} className="space-y-3">
                <Label className="text-sm font-medium">{label}</Label>
                {value.map((item: any, i: number) => (
                  <Card key={`${fieldId}.${i}`} className="bg-muted/50">
                    <CardContent className="pt-4 space-y-3">
                      <BilingualFields
                        enValue={item}
                        esValue={esArr[i] ?? {}}
                        path={[...currentPath, String(i)]}
                        onEnChange={onEnChange}
                        onEsChange={onEsChange}
                        query={query}
                        imagesOnly={imagesOnly}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            );
          }

          return null;
        }

        /* ---------- nested objects ---------- */
        if (typeof value === "object") {
          return (
            <div key={fieldId} className="space-y-3 pl-3 border-l-2 border-border">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
              <BilingualFields
                enValue={value}
                esValue={esVal && typeof esVal === "object" && !Array.isArray(esVal) ? esVal : {}}
                path={currentPath}
                onEnChange={onEnChange}
                onEsChange={onEsChange}
                query={query}
                imagesOnly={imagesOnly}
              />
            </div>
          );
        }

        return null;
      })}
    </>
  );
}

/* ============================================================
 * Main editor
 * ============================================================ */
export function AdminContentEditor() {
  const queryClient = useQueryClient();
  const enContentQ = useRawSection<any>("content", defaults);
  const esContentQ = useRawSection<any>("content_es", {});
  const enSeoQ = useRawSection<any>("seo", seoDefaults);
  const esSeoQ = useRawSection<any>("seo_es", {});
  const saveMutation = useSaveContent();

  const [editEnContent, setEditEnContent] = useState<any>({ ...defaults });
  const [editEsContent, setEditEsContent] = useState<any>({});
  const [editEnSeo, setEditEnSeo] = useState<any>({ ...seoDefaults });
  const [editEsSeo, setEditEsSeo] = useState<any>({});

  // ----- Find / filter / collapse state (Page Content tab) -----
  const [query, setQuery] = useState("");
  const [imagesOnly, setImagesOnly] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // ----- Live preview state -----
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLang, setPreviewLang] = useState<"en" | "es">("en");
  const [previewPath, setPreviewPath] = useState<string>("/");
  const [previewNonce, setPreviewNonce] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // ----- "Edit on page" state -----
  // When on, the preview iframe loads with ?__edit=1 and clicking editable text
  // in it opens the inline editor for that content path.
  const [editOnPage, setEditOnPage] = useState(false);
  const [inlinePath, setInlinePath] = useState<string | null>(null);

  // Hydrate from DB once loaded
  useEffect(() => {
    if (enContentQ.data) {
      // Merge defaults under DB row so newly added keys appear in the editor
      setEditEnContent(deepMergeForEdit(defaults, enContentQ.data));
    }
  }, [enContentQ.data]);
  useEffect(() => {
    if (esContentQ.data) setEditEsContent(JSON.parse(JSON.stringify(esContentQ.data)));
  }, [esContentQ.data]);
  useEffect(() => {
    if (enSeoQ.data) setEditEnSeo(deepMergeForEdit(seoDefaults, enSeoQ.data));
  }, [enSeoQ.data]);
  useEffect(() => {
    if (esSeoQ.data) setEditEsSeo(JSON.parse(JSON.stringify(esSeoQ.data)));
  }, [esSeoQ.data]);

  const handleSave = async () => {
    try {
      await Promise.all([
        saveMutation.mutateAsync({ key: "content", value: editEnContent }),
        saveMutation.mutateAsync({ key: "content_es", value: pruneEmpty(editEsContent) }),
        saveMutation.mutateAsync({ key: "seo", value: editEnSeo }),
        saveMutation.mutateAsync({ key: "seo_es", value: pruneEmpty(editEsSeo) }),
      ]);
      queryClient.invalidateQueries({ queryKey: ["site-content-raw"] });
      toast.success("Content saved successfully (EN + ES)");
    } catch (e) {
      console.error(e);
      toast.error("Failed to save content");
    }
  };

  const handleReset = () => {
    setEditEnContent(JSON.parse(JSON.stringify(defaults)));
    setEditEsContent({});
    setEditEnSeo(JSON.parse(JSON.stringify(seoDefaults)));
    setEditEsSeo({});
    toast.info("Reset to default values (click Save to persist)");
  };

  const handleAutofillEs = () => {
    const r1 = fillEsFromEn(editEnContent, editEsContent);
    const r2 = fillEsFromEn(editEnSeo, editEsSeo);
    setEditEsContent(r1.next);
    setEditEsSeo(r2.next);
    const total = r1.filled + r2.filled;
    if (total === 0) {
      toast.info("No empty Spanish fields to fill — everything already has a value.");
    } else {
      toast.success(`Filled ${total} empty Spanish field${total === 1 ? "" : "s"} from English. Click Save to persist.`);
    }
  };

  const handleClearEs = () => {
    if (!confirm("Clear ALL Spanish overrides? Spanish content will fall back to English everywhere until you save.")) {
      return;
    }
    setEditEsContent({});
    setEditEsSeo({});
    toast.info("All Spanish overrides cleared. Click Save to persist.");
  };

  /* ---------- Live preview ---------- */
  const writePreview = () => {
    setPreviewOverrides({
      content: editEnContent,
      content_es: pruneEmpty(editEsContent),
      seo: editEnSeo,
      seo_es: pruneEmpty(editEsSeo),
    });
  };

  const handleOpenPreview = () => {
    setEditOnPage(false);
    writePreview();
    setPreviewOpen(true);
  };

  const handleEditOnPage = () => {
    setEditOnPage(true);
    writePreview();
    setPreviewOpen(true);
  };

  // Push the current staged overrides into the edit-mode iframe so it re-renders
  // live (postMessage — the iframe applies them without a reload).
  const postOverridesToIframe = () => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        source: "cms",
        type: "set-overrides",
        overrides: {
          content: editEnContent,
          content_es: pruneEmpty(editEsContent),
          seo: editEnSeo,
          seo_es: pruneEmpty(editEsSeo),
        },
      },
      "*",
    );
  };

  // Listen for clicks relayed from the edit-mode iframe.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.source !== "cms") return;
      if (d.type === "ready") postOverridesToIframe();
      if (d.type === "edit" && typeof d.path === "string") setInlinePath(d.path);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editEnContent, editEsContent, editEnSeo, editEsSeo]);

  // Keep the edit-mode iframe in sync as fields change.
  useEffect(() => {
    if (editOnPage && previewOpen) postOverridesToIframe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editEnContent, editEsContent, editEnSeo, editEsSeo, editOnPage, previewOpen]);

  const handleRefreshPreview = () => {
    writePreview();
    setPreviewNonce((n) => n + 1);
  };

  // Keep overrides in sync with edits while the preview sheet is open
  useEffect(() => {
    if (!previewOpen) return;
    writePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editEnContent, editEsContent, editEnSeo, editEsSeo, previewOpen]);

  // Always clear staged preview overrides on unmount so the public site
  // doesn't keep rendering unsaved edits if the admin closes the tab.
  useEffect(() => {
    return () => setPreviewOverrides(null);
  }, []);

  const handleClosePreview = (open: boolean) => {
    setPreviewOpen(open);
    if (!open) {
      setPreviewOverrides(null);
      setInlinePath(null);
      setEditOnPage(false);
    }
  };

  const previewSrc = (() => {
    const base =
      previewLang === "es"
        ? previewPath === "/"
          ? "/es"
          : `/es${previewPath}`
        : previewPath;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}__preview=${previewNonce}${editOnPage ? "&__edit=1" : ""}`;
  })();

  const previewablePages: { label: string; path: string }[] = [
    { label: "🏠 Home", path: "/" },
    { label: "ℹ️ About", path: "/about" },
    { label: "💆 Treatments", path: "/services" },
    { label: "🌟 Signature", path: "/signature-treatments" },
    { label: "📅 Classes", path: "/classes" },
    { label: "🔒 Private Sessions", path: "/private-sessions" },
    { label: "📅 Booking", path: "/booking" },
    { label: "📚 Education", path: "/education" },
    { label: "🎁 Gift Cards", path: "/gift-cards" },
    { label: "🏝️ Retreats", path: "/retreats" },
    { label: "🌿 Wellness", path: "/wellness" },
    { label: "❓ FAQs", path: "/faqs" },
  ];


  const sectionLabels: Record<string, string> = {
    nav: "🧭 Navigation Menu",
    hero: "🏠 Hero Section",
    wellness: "🧘 Wellness Section",
    signatureExperiences: "✨ Signature Experiences (Homepage)",
    movement: "🏃 Movement & Classes",
    testimonials: "⭐ Testimonials",
    cta: "📢 Call to Action",
    footer: "🔗 Footer",
    about: "ℹ️ About Page (Team, Images & Bio)",
    services: "💆 Treatments Page",
    signatureTreatments: "🌟 Signature Treatments Page",
    classes: "📅 Classes Page",
    privateSessions: "🔒 Private Sessions Page",
    giftCards: "🎁 Gift Cards Page",
    education: "📚 Education Page",
    whatsapp: "💬 WhatsApp Button",
  };

  const seoLabels: Record<string, string> = {
    home: "🏠 Home",
    about: "ℹ️ About",
    treatments: "💆 Treatments",
    signatureTreatments: "✨ Signature",
    classes: "🧘 Classes",
    privateSessions: "🔒 Private Sessions",
    booking: "📅 Booking",
    education: "📚 Education",
    giftCards: "🎁 Gift Cards",
    retreats: "🏝️ Retreats",
    wellness: "🌿 Wellness",
  };

  const isLoading =
    enContentQ.isLoading || esContentQ.isLoading || enSeoQ.isLoading || esSeoQ.isLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground">Content Editor</h2>
          <p className="text-sm text-muted-foreground">
            Edit website text in English and Spanish side-by-side. Leave Spanish blank to fall back to English.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="default" size="sm" onClick={handleEditOnPage} title="Open the site and click text right on the page to edit it">
            <Pencil className="h-4 w-4 mr-1" /> Edit on Page
          </Button>
          <Button variant="outline" size="sm" onClick={handleOpenPreview} title="Open a live preview using your unsaved EN/ES edits">
            <Eye className="h-4 w-4 mr-1" /> Live Preview
          </Button>
          <Button variant="outline" size="sm" onClick={handleAutofillEs} title="Copy English values into any empty Spanish fields">
            <Copy className="h-4 w-4 mr-1" /> Auto-fill ES from EN
          </Button>
          <Button variant="outline" size="sm" onClick={handleClearEs} title="Remove all Spanish overrides — falls back to English">
            <Eraser className="h-4 w-4 mr-1" /> Clear ES
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-1" /> Reset Defaults
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : (<><Save className="h-4 w-4 mr-1" /> Save Changes</>)}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading content…</p>
      ) : (
        <Tabs defaultValue="content">
          <TabsList>
            <TabsTrigger value="content">Page Content</TabsTrigger>
            <TabsTrigger value="seo">SEO Metadata</TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="space-y-4 mt-4">
            {/* Find & filter toolbar */}
            <div className="flex flex-wrap items-center gap-2 sticky top-0 z-10 bg-background/95 backdrop-blur py-2 -mx-1 px-1 rounded-lg">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search any text, label or link…"
                  className="pl-8"
                />
              </div>
              <Button type="button" variant={imagesOnly ? "default" : "outline"} size="sm" onClick={() => setImagesOnly((v) => !v)}>
                <ImageIcon className="h-4 w-4 mr-1" /> Images only
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const all: Record<string, boolean> = {};
                  Object.keys(editEnContent).forEach((k) => (all[k] = true));
                  setExpanded(all);
                }}
              >
                Expand all
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setExpanded({})}>
                Collapse all
              </Button>
            </div>

            {(() => {
              const isFiltering = !!query.trim() || imagesOnly;
              const q = query.trim().toLowerCase();
              const entries = Object.entries(editEnContent).filter(([section, value]) => {
                const label = (sectionLabels[section] || section).toLowerCase();
                const nameMatch = !!q && (section.toLowerCase().includes(q) || label.includes(q));
                return nameMatch || subtreeVisible(section, value, query, imagesOnly);
              });
              if (entries.length === 0) {
                return <p className="text-sm text-muted-foreground py-10 text-center">No fields match your search.</p>;
              }
              return entries.map(([section, value]) => {
                const label = sectionLabels[section] || section;
                const nameMatch = !!q && (section.toLowerCase().includes(q) || label.toLowerCase().includes(q));
                const childQuery = nameMatch ? "" : query;
                const isOpen = isFiltering ? true : !!expanded[section];
                return (
                  <Card key={section}>
                    <CardHeader
                      className={isFiltering ? "" : "cursor-pointer select-none"}
                      onClick={() => { if (!isFiltering) setExpanded((e) => ({ ...e, [section]: !e[section] })); }}
                    >
                      <CardTitle className="text-lg flex items-center gap-2">
                        {!isFiltering && (isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />)}
                        {label}
                      </CardTitle>
                    </CardHeader>
                    {isOpen && (
                      <CardContent className="space-y-4">
                        <BilingualFields
                          enValue={value}
                          esValue={editEsContent?.[section] ?? {}}
                          path={[section]}
                          onEnChange={(p, v) => setEditEnContent((prev: any) => setNestedValue(prev, p, v))}
                          onEsChange={(p, v) => setEditEsContent((prev: any) => setNestedValue(prev, p, v))}
                          query={childQuery}
                          imagesOnly={imagesOnly}
                        />
                      </CardContent>
                    )}
                  </Card>
                );
              });
            })()}
          </TabsContent>

          <TabsContent value="seo" className="space-y-6 mt-4">
            {Object.entries(editEnSeo).map(([page, value]) => (
              <Card key={page}>
                <CardHeader>
                  <CardTitle className="text-lg">{seoLabels[page] || page}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <BilingualFields
                    enValue={value}
                    esValue={editEsSeo?.[page] ?? {}}
                    path={[page]}
                    onEnChange={(p, v) => setEditEnSeo((prev: any) => setNestedValue(prev, p, v))}
                    onEsChange={(p, v) => setEditEsSeo((prev: any) => setNestedValue(prev, p, v))}
                  />
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      )}

      {/* Live preview drawer */}
      <Sheet open={previewOpen} onOpenChange={handleClosePreview}>
        <SheetContent side="right" className="w-full sm:max-w-[min(96vw,1200px)] p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b space-y-2">
            <SheetTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4" /> Live Preview — unsaved edits
            </SheetTitle>
            <SheetDescription>
              Renders the selected page using your current draft. Nothing is saved until you click Save Changes.
            </SheetDescription>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <div className="inline-flex rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPreviewLang("en")}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    previewLang === "en" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewLang("es")}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-border ${
                    previewLang === "es" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
                  }`}
                >
                  ES
                </button>
              </div>

              <Select value={previewPath} onValueChange={setPreviewPath}>
                <SelectTrigger className="h-8 w-[220px] text-xs">
                  <SelectValue placeholder="Select page" />
                </SelectTrigger>
                <SelectContent>
                  {previewablePages.map((p) => (
                    <SelectItem key={p.path} value={p.path} className="text-xs">
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" onClick={handleRefreshPreview} className="h-8">
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => window.open(previewSrc, "_blank", "noopener")}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open in tab
              </Button>
              <span className="text-[11px] text-muted-foreground ml-auto truncate max-w-[40%]" title={previewSrc}>
                {previewSrc}
              </span>
            </div>
          </SheetHeader>
          <div className="flex-1 bg-muted/30">
            <iframe
              ref={iframeRef}
              key={`${previewLang}:${previewPath}:${previewNonce}`}
              src={previewSrc}
              title="Site preview"
              className="w-full h-full border-0 bg-background"
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Inline editor — opened by clicking text in the "Edit on Page" preview */}
      {inlinePath && (() => {
        const p = inlinePath.split(".");
        const enVal = getNestedValue(editEnContent, p);
        const esVal = getNestedValue(editEsContent, p);
        const enStr = typeof enVal === "string" ? enVal : enVal == null ? "" : String(enVal);
        const esStr = typeof esVal === "string" ? esVal : "";
        const label = p[p.length - 1].replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
        return (
          <div
            key={inlinePath}
            className="fixed bottom-4 left-4 z-[70] w-[380px] max-w-[92vw] rounded-xl border border-border bg-card shadow-2xl p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">Editing: {label}</p>
                <p className="text-[11px] text-muted-foreground font-mono truncate">{inlinePath}</p>
              </div>
              <button type="button" onClick={() => setInlinePath(null)} className="text-muted-foreground hover:text-foreground shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">English</span>
                <FormatBar fieldId="inline-en" value={enStr} onChange={(v) => setEditEnContent((prev: any) => setNestedValue(prev, p, v))} />
              </div>
              <Textarea
                id="inline-en"
                value={enStr}
                autoFocus
                onChange={(e) => setEditEnContent((prev: any) => setNestedValue(prev, p, e.target.value))}
                className="text-sm min-h-[84px]"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-primary flex items-center gap-1">
                <Languages className="h-3 w-3" /> Spanish
                <span className="text-muted-foreground font-normal normal-case ml-1">(blank = English)</span>
              </span>
              <Textarea
                value={esStr}
                placeholder={enStr}
                onChange={(e) => setEditEsContent((prev: any) => setNestedValue(prev, p, e.target.value))}
                className="text-sm min-h-[60px]"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Updates the preview live. Click <strong>Save Changes</strong> (top) to publish.
            </p>
          </div>
        );
      })()}
    </div>
  );
}

/* ============================================================
 * Helpers: deepMergeForEdit (defaults under DB row, so the editor
 * always shows the full set of fields even if DB is partial), and
 * pruneEmpty (drop empty strings/objects from ES before saving).
 * ============================================================ */
function deepMergeForEdit(base: any, overlay: any): any {
  if (overlay == null) return JSON.parse(JSON.stringify(base));
  if (typeof base !== "object" || base === null) return overlay ?? base;
  if (Array.isArray(base)) return Array.isArray(overlay) ? overlay : base;
  const out: any = { ...base };
  for (const k of Object.keys(overlay)) {
    if (k in base && typeof base[k] === "object" && base[k] !== null && !Array.isArray(base[k])) {
      out[k] = deepMergeForEdit(base[k], overlay[k]);
    } else {
      out[k] = overlay[k];
    }
  }
  return out;
}

function pruneEmpty(obj: any): any {
  if (obj == null) return obj;
  if (Array.isArray(obj)) {
    const arr = obj.map(pruneEmpty).filter((v) => !(v === "" || v == null));
    return arr;
  }
  if (typeof obj === "object") {
    const out: any = {};
    for (const k of Object.keys(obj)) {
      const v = pruneEmpty(obj[k]);
      if (v === "" || v == null) continue;
      if (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      out[k] = v;
    }
    return out;
  }
  return obj;
}

/**
 * Walk the EN tree and copy every translatable text leaf into the ES tree
 * IF the corresponding ES leaf is empty/missing. Skips images, URLs, links,
 * numbers, booleans, and any keys that don't look translatable. Returns the
 * new ES object plus the count of fields that were filled.
 */
function fillEsFromEn(en: any, es: any): { next: any; filled: number } {
  let filled = 0;

  function isTranslatableKey(k: string) {
    return TRANSLATABLE_KEY_HINT.test(k) && !isUrlOrLink(k);
  }

  function walk(enNode: any, esNode: any, parentKey: string): any {
    if (enNode == null) return esNode;

    if (typeof enNode === "string") {
      if (!isTranslatableKey(parentKey)) return esNode;
      if (isImageValue(parentKey, enNode)) return esNode;
      if (typeof esNode === "string" && esNode.trim() !== "") return esNode;
      filled++;
      return enNode;
    }

    if (Array.isArray(enNode)) {
      const esArr = Array.isArray(esNode) ? [...esNode] : [];
      const out = enNode.map((item, i) => walk(item, esArr[i], parentKey));
      return out;
    }

    if (typeof enNode === "object") {
      const base = esNode && typeof esNode === "object" && !Array.isArray(esNode) ? { ...esNode } : {};
      for (const k of Object.keys(enNode)) {
        base[k] = walk(enNode[k], base[k], k);
      }
      return base;
    }

    // numbers / booleans → never copied (English-only fields)
    return esNode;
  }

  const next = walk(en, es ?? {}, "");
  return { next, filled };
}
