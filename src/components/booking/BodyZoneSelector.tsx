import { useState } from "react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import bodyMassage from "@/assets/body-zones-massage.png";
import bodyFacial from "@/assets/body-zones-facial.png";
import bodyCupping from "@/assets/body-zones-cupping.png";
import bodyWraps from "@/assets/body-zones-wraps.png";
import bodyHolistic from "@/assets/body-zones-holistic.png";

type BodyZoneConfig = {
  image: string;
  title: string;
  zones: { id: number; label: string }[];
  extraQuestions?: { id: string; label: string }[];
};

const ZONE_CONFIGS: Record<string, BodyZoneConfig> = {
  "Massage Therapy": {
    image: "",
    title: "Mark areas of discomfort or focus",
    zones: [
      { id: 1, label: "Head / Scalp" },
      { id: 2, label: "Neck" },
      { id: 3, label: "Shoulders" },
      { id: 4, label: "Upper Back" },
      { id: 5, label: "Mid Back" },
      { id: 6, label: "Lower Back" },
      { id: 7, label: "Arms" },
      { id: 8, label: "Forearms" },
      { id: 9, label: "Hands" },
      { id: 10, label: "Hips" },
      { id: 11, label: "Glutes" },
      { id: 12, label: "IT Band" },
      { id: 13, label: "Hamstrings" },
      { id: 14, label: "Calves" },
      { id: 15, label: "Feet" },
    ],
  },
  "Organic Facials": {
    image: bodyFacial,
    title: "Mark areas of concern",
    zones: [
      { id: 1, label: "Forehead" },
      { id: 2, label: "Temples" },
      { id: 3, label: "Under Eyes" },
      { id: 4, label: "Cheeks" },
      { id: 5, label: "Nose" },
      { id: 6, label: "Jawline" },
      { id: 7, label: "Chin" },
      { id: 8, label: "Neck" },
      { id: 9, label: "Décolleté" },
    ],
  },
  cupping: {
    image: bodyCupping,
    title: "Mark areas for cupping treatment",
    zones: [
      { id: 1, label: "Upper Trapezius" },
      { id: 2, label: "Mid Back" },
      { id: 3, label: "Lower Back" },
      { id: 4, label: "Shoulders" },
      { id: 5, label: "Shoulder Blades" },
      { id: 6, label: "Spine Area" },
      { id: 7, label: "Upper Glutes" },
      { id: 8, label: "Back of Legs" },
    ],
  },
  "Body Treatments": {
    image: bodyWraps,
    title: "Mark areas for wrap treatment",
    zones: [
      { id: 1, label: "Arms" },
      { id: 2, label: "Torso" },
      { id: 3, label: "Abdomen" },
      { id: 4, label: "Hips / Thighs" },
      { id: 5, label: "Upper Legs" },
      { id: 6, label: "Lower Legs" },
    ],
    extraQuestions: [
      { id: "claustrophobic", label: "Do you experience claustrophobia or discomfort when fully wrapped?" },
    ],
  },
  "Holistic Therapy": {
    image: bodyHolistic,
    title: "Mark energy centers or areas to focus on",
    zones: [
      { id: 1, label: "Crown (top of head)" },
      { id: 2, label: "Third Eye (forehead)" },
      { id: 3, label: "Throat" },
      { id: 4, label: "Heart Center" },
      { id: 5, label: "Solar Plexus" },
      { id: 6, label: "Sacral (lower abdomen)" },
      { id: 7, label: "Root (base of spine)" },
      { id: 8, label: "Hands / Energy Points" },
      { id: 9, label: "Feet / Grounding Points" },
    ],
  },
};

// Check if a service title suggests cupping
function getCategoryKey(category: string, serviceTitle?: string): string | null {
  if (serviceTitle?.toLowerCase().includes("cupping")) return "cupping";
  if (ZONE_CONFIGS[category]) return category;
  return null;
}

/** Translate stored body-zone ids into their human labels for a service. */
export function bodyZoneNames(
  category: string | null | undefined,
  serviceTitle: string | null | undefined,
  zoneIds: number[] | null | undefined,
): string[] {
  if (!Array.isArray(zoneIds) || zoneIds.length === 0) return [];
  const key = getCategoryKey(category ?? "", serviceTitle ?? undefined);
  const config = key ? ZONE_CONFIGS[key] : null;
  return zoneIds.map((id) => config?.zones.find((z) => z.id === id)?.label ?? `Area #${id}`);
}

/** The label for an extra intake question (e.g. claustrophobia) in a service. */
export function bodyZoneExtraLabel(
  category: string | null | undefined,
  serviceTitle: string | null | undefined,
  extraId: string,
): string {
  const key = getCategoryKey(category ?? "", serviceTitle ?? undefined);
  const config = key ? ZONE_CONFIGS[key] : null;
  return config?.extraQuestions?.find((q) => q.id === extraId)?.label ?? extraId;
}

interface BodyZoneSelectorProps {
  category: string;
  serviceTitle?: string;
  selectedZones: number[];
  onZonesChange: (zones: number[]) => void;
  extraAnswers: Record<string, boolean>;
  onExtraChange: (answers: Record<string, boolean>) => void;
}

export function BodyZoneSelector({
  category,
  serviceTitle,
  selectedZones,
  onZonesChange,
  extraAnswers,
  onExtraChange,
}: BodyZoneSelectorProps) {
  const key = getCategoryKey(category, serviceTitle);
  if (!key) return null;

  const config = ZONE_CONFIGS[key];
  if (!config) return null;

  const toggleZone = (zoneId: number) => {
    if (selectedZones.includes(zoneId)) {
      onZonesChange(selectedZones.filter((z) => z !== zoneId));
    } else {
      onZonesChange([...selectedZones, zoneId]);
    }
  };

  return (
    <div className="space-y-4">
      <p className="font-body text-sm font-medium text-foreground">{config.title}</p>
      <p className="font-body text-xs text-muted-foreground">Tap the numbered zones on the diagram that apply to you</p>

      {/* Body diagram (only if image exists) */}
      {config.image && (
        <div className="bg-card rounded-2xl border border-border p-4 flex justify-center">
          <img
            src={config.image}
            alt={`${config.title} body diagram`}
            className="max-h-[350px] w-auto object-contain"
            loading="lazy"
          />
        </div>
      )}

      {/* Zone selection grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {config.zones.map((zone) => {
          const isSelected = selectedZones.includes(zone.id);
          return (
            <button
              key={zone.id}
              onClick={() => toggleZone(zone.id)}
              className={cn(
                "flex items-center gap-2 py-2.5 px-3 rounded-xl text-sm font-body font-medium transition-all border text-left",
                isSelected
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card text-foreground border-border hover:border-muted-foreground/50"
              )}
            >
              <span className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                isSelected ? "bg-background text-foreground" : "bg-muted text-muted-foreground"
              )}>
                {zone.id}
              </span>
              <span className="truncate">{zone.label}</span>
            </button>
          );
        })}
      </div>

      {/* Extra questions (e.g., claustrophobia for wraps) */}
      {config.extraQuestions && config.extraQuestions.length > 0 && (
        <div className="border-t border-border pt-4 space-y-3">
          {config.extraQuestions.map((q) => (
            <div key={q.id} className="flex items-start space-x-3">
              <Checkbox
                id={q.id}
                checked={extraAnswers[q.id] || false}
                onCheckedChange={(checked) => onExtraChange({ ...extraAnswers, [q.id]: !!checked })}
              />
              <label htmlFor={q.id} className="font-body text-sm text-foreground">{q.label}</label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
