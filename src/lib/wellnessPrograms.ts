// Wellness Programs (services.category = "Wellness Programs", type "program").
//
// Their descriptions follow one pattern, written by the team:
//   "AWAKEN … INTEGRATE … MANIFEST … Includes 45-min X + 45-min Y."
// The /wellness-programs page splits that into the three phases and the
// "what's included" list. Anything that doesn't follow the pattern is shown
// as plain text, so editing a description can never break the page.

export const WELLNESS_PROGRAMS_CATEGORY = "Wellness Programs";
export const WELLNESS_PROGRAMS_PATH = "/wellness-programs";

export type PhaseKey = "awaken" | "integrate" | "manifest";

export interface ProgramPhase {
  key: PhaseKey;
  label: string;
  text: string;
}

export interface ProgramParts {
  summary: string;
  phases: ProgramPhase[];
  includes: string[];
}

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function parseProgramDescription(description: string | null | undefined): ProgramParts {
  const text = (description ?? "").trim();
  let body = text;
  let includes: string[] = [];

  const inc = text.match(/\bIncludes:?\s+([\s\S]+)$/i);
  if (inc && inc.index !== undefined) {
    body = text.slice(0, inc.index).trim();
    includes = inc[1]
      .replace(/\.\s*$/, "")
      .split(/\s*\+\s*/)
      .map((s) => capitalize(s.trim()))
      .filter(Boolean);
  }

  const marks = [...body.matchAll(/\b(AWAKEN|INTEGRATE|MANIFEST)\b/g)];
  if (marks.length === 0) return { summary: body, phases: [], includes };

  const phases = marks.map((m, i) => {
    const start = m.index ?? 0;
    const end = i + 1 < marks.length ? marks[i + 1].index ?? body.length : body.length;
    const word = m[1];
    const label = word.charAt(0) + word.slice(1).toLowerCase();
    return {
      key: word.toLowerCase() as PhaseKey,
      label,
      text: `${label}${body.slice(start + word.length, end)}`.trim(),
    };
  });

  return { summary: body.slice(0, marks[0].index ?? 0).trim(), phases, includes };
}

export function programDuration(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h${m ? ` ${m}min` : ""}`;
  }
  return `${minutes} min`;
}
