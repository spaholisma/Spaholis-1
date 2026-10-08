import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Three updates on the Teachers branch:
//  1. GYROTONIC® can be one of a teacher's private classes (Evelina), and the
//     Private Sessions card sends the request to her, at her price.
//  2. A private class request says where: the studio, the guest's place (with
//     the address) or the beach — the beach only with Evelina.
//  3. Every teacher's portfolio shows, also in a week with no class of hers.

const db = vi.hoisted(() => ({ rpc: {} as Record<string, unknown[]> }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: async (name: string) => ({ data: db.rpc[name] ?? [], error: null }) },
}));

import { locationsFor, locationLine, beachAllowed, LOCATION_LABEL } from "@/lib/privateLocation";
import { privateClassIntake } from "@/lib/privateClassRequest";
import { gyrotonicOfferings, isGyrotonic, GYROTONIC_TITLE, type PrivateOffering } from "@/lib/privateOfferings";
import { TeacherPortfolios } from "@/components/TeacherPortfolios";

const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8").replace(/\r\n/g, "\n");

const offering = (o: Partial<PrivateOffering>): PrivateOffering => ({
  id: "o1", teacher_id: "t-eve", teacher_name: "Evelina", teacher_photo: null, class_id: null,
  title: GYROTONIC_TITLE, description: null, duration_minutes: 60,
  price_one: 90, price_two: null, price_group: null, price_extra: null, ...o,
});

describe("1. GYROTONIC with a teacher", () => {
  it("is recognised by name and offered for one person, cheapest first", () => {
    expect(isGyrotonic("GYROTONIC®")).toBe(true);
    expect(isGyrotonic("Private Gyrotonic session")).toBe(true);
    expect(isGyrotonic("Gyrokinesis®")).toBe(false); // a different method
    const list = gyrotonicOfferings([
      offering({ id: "a", price_one: 120, teacher_name: "Zoe" }),
      offering({ id: "b", price_one: 90 }),
      offering({ id: "c", price_one: null }), // not for one person
      offering({ id: "d", title: "Aerial Yoga" }),
    ]);
    expect(list.map((o) => o.id)).toEqual(["b", "a"]);
  });

  it("the teacher picks it in her panel; it is saved with no schedule class", () => {
    const ed = read("src/components/teacher/TeacherPrivateOfferingsEditor.tsx");
    expect(ed).toMatch(/<option value=\{GYRO\}>\{GYROTONIC_TITLE\} \(on the tower\)<\/option>/);
    expect(ed).toMatch(/class_id: draft\.class_id && draft\.class_id !== GYRO \? draft\.class_id : null/);
    // Editing it again shows it picked.
    expect(ed).toMatch(/class_id: r\.class_id \?\? \(isGyrotonic\(r\.title\) \? GYRO : ""\)/);
  });

  it("the Private Sessions card goes to her, at her price — and stays as before until a teacher lists it", () => {
    const page = read("src/pages/PrivateClasses.tsx");
    expect(page).toMatch(/const gyro = gyrotonicOfferings\(allPrivate\)\[0\] \?\? null;/);
    expect(page).toMatch(/privateRequestPath\(\{ kind: "oneOnOne", kindTitle: [^}]+, people: 1, offeringId: gyro\.id \}\)/);
    expect(page).toMatch(/formatCRCWithUsd\(gyro \? Number\(gyro\.price_one\) \* USD_RATE : price\)/);
    // The old link is still there for when nobody lists it.
    expect(page).toContain('cls.i18nKey !== "gyrotonic" ? `&private=${cls.i18nKey}&people=${count}` : ""');
  });
});

describe("2. Where the private class happens", () => {
  it("studio and the guest's place for everyone; the beach only with Evelina", () => {
    expect(locationsFor(null)).toEqual(["studio", "client"]);
    expect(locationsFor("Zhijian Chen")).toEqual(["studio", "client"]);
    expect(locationsFor("Evelina")).toEqual(["studio", "client", "beach"]);
    expect(locationsFor("  evelina ")).toEqual(["studio", "client", "beach"]);
    expect(beachAllowed("Evelina Bolognini")).toBe(false); // the exact teacher name, nobody else
  });

  it("GYROTONIC is only at the studio — it needs the tower", () => {
    expect(locationsFor("Evelina", "GYROTONIC®")).toEqual(["studio"]);
  });

  it("the line for notes and emails carries the address only for the guest's place", () => {
    expect(locationLine("client", " Villa Sol, Manuel Antonio ")).toBe("Client's location: Villa Sol, Manuel Antonio");
    expect(locationLine("beach", "ignored")).toBe("Beach");
    expect(locationLine("studio")).toBe(LOCATION_LABEL.studio);
  });

  it("is saved with the request; the address only for the guest's place", () => {
    const base = { kind: "oneOnOne" as const, kindTitle: "One-on-One", people: 1, choice: null, preferred: "" };
    expect(privateClassIntake({ ...base, location: { place: "client", label: "Client's location", address: " Casa Azul " } }).private_class)
      .toMatchObject({ location: "client", location_label: "Client's location", location_address: "Casa Azul" });
    expect(privateClassIntake({ ...base, location: { place: "beach", label: "Beach", address: "x" } }).private_class)
      .toMatchObject({ location: "beach", location_address: null });
  });

  it("the form asks for it, requires the address for the guest's place, and drops the beach for other teachers", () => {
    const form = read("src/components/booking/ConsultationForm.tsx");
    expect(form).toMatch(/const places = locationsFor\(classChoice\?\.teacherName, classChoice\?\.title\);/);
    expect(form).toMatch(/const where: PrivateLocation = places\.includes\(place\) \? place : "studio";/);
    expect(form).toMatch(/if \(privateKind && where === "client" && address\.trim\(\)\.length < 3\)/);
    expect(form).toMatch(/Location: \$\{locationLine\(where, address\)\}/);
  });

  it("the emails show it, checked again on the server", () => {
    const fn = read("supabase/functions/send-private-class-request/index.ts");
    expect(fn).toMatch(/const BEACH_TEACHERS = \["evelina"\];/);
    expect(fn).toMatch(/row\("Location", locationText\)/);
    expect(fn).toMatch(/place === "studio" \|\| studioOnly \? "Holis Wellness Studio"/);
    expect(fn).toMatch(/BEACH_TEACHERS\.includes\(norm\(teacherName\)\) \? "Beach"/);
    expect(fn).toMatch(/esc\(address\)/); // the guest's text is escaped
  });

  it("the teacher sees it in her requests", () => {
    const sql = read("supabase/migrations/20261008150000_private_class_location.sql");
    expect(sql).toMatch(/quoted_price numeric, location_label text, location_address text\)/);
    expect(sql).toMatch(/revoke all on function public\.teacher_private_class_requests\(\) from public, anon;/);
    expect(sql).toMatch(/grant execute on function public\.teacher_private_class_requests\(\) to authenticated;/);
    expect(read("src/components/teacher/TeacherPrivateClasses.tsx")).toMatch(/\{r\.location_label\}\{r\.location_address \? `: \$\{r\.location_address\}` : ""\}/);
  });
});

describe("3. Every teacher's portfolio shows", () => {
  const renderIt = (props: Parameters<typeof TeacherPortfolios>[0]) =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter><TeacherPortfolios {...props} /></MemoryRouter>
      </QueryClientProvider>,
    );

  db.rpc = {
    public_teachers: [
      { id: "t-eve", display_name: "Evelina", photo_url: null, bio: "Gyrotonic and CranioSacral." },
      { id: "t-zc", display_name: "Zhijian Chen", photo_url: null, bio: null },
    ],
    public_private_offerings: [offering({})],
    public_teacher_portfolios: [],
  };

  it("with no class on the schedule: each teacher, her bio and her private classes", async () => {
    renderIt({ sessions: [] });
    await waitFor(() => expect(screen.getByText("Evelina")).toBeTruthy());
    expect(screen.getByText("Zhijian Chen")).toBeTruthy();
    expect(screen.getByText("Gyrotonic and CranioSacral.")).toBeTruthy();
    expect(screen.getByText("1 private class")).toBeTruthy();
    expect(screen.getByText(/Private classes with Evelina/)).toBeTruthy();
    expect(screen.getAllByText("No group classes on the schedule right now.")).toHaveLength(2);
  });

  it("on Private Sessions only the teachers — no card for a class nobody is named on", async () => {
    const soon = new Date(Date.now() + 86_400_000).toISOString();
    const orphan = {
      id: "s1", class_id: "c1", start_time: soon, spots_remaining: 5, instructor: null,
      classes: { id: "c1", title: "Hatha Yoga", instructor: null, image_url: null, description: null, location: null },
    } as any;
    const { unmount } = renderIt({ sessions: [orphan], teachersOnly: true });
    await waitFor(() => expect(screen.getByText("Evelina")).toBeTruthy());
    expect(screen.queryByText("Hatha Yoga")).toBeNull();
    unmount();
    renderIt({ sessions: [orphan] });
    await waitFor(() => expect(screen.getByText("Hatha Yoga")).toBeTruthy()); // the Classes page keeps it
  });

  it("the Classes page shows the teachers also in a week with no class, and Private Sessions lists them", () => {
    const classes = read("src/pages/Classes.tsx");
    expect(classes).toMatch(/const showPortfolios = regularEvents\.length > 0 \|\| teachers\.length > 0;/);
    expect(classes).toMatch(/\{showPortfolios && \(/);
    expect(read("src/pages/PrivateClasses.tsx")).toMatch(/<TeacherPortfolios sessions=\{weekly\} teachersOnly \/>/);
  });
});
