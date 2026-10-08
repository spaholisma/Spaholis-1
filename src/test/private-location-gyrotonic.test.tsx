import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Three updates on the Teachers branch:
//  1. GYROTONIC® can be one of a teacher's private classes (Evelina), and the
//     Private Sessions card sends the request to her, at her price.
//  2. A private class request says where: the studio, the guest's place (with
//     the address) or the beach — the beach only with Evelina.
//  3. Every teacher's portfolio shows, also in a week with no class of hers.

const db = vi.hoisted(() => ({ rpc: {} as Record<string, unknown[]> }));
// The test browser has no IntersectionObserver (the page's reveal-on-scroll uses it).
if (!(globalThis as any).IntersectionObserver) {
  (globalThis as any).IntersectionObserver = class {
    observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
  };
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: async (name: string) => ({ data: db.rpc[name] ?? [], error: null }) },
}));
// The schedule: no class this week. The page chrome is not under test here.
vi.mock("@/hooks/useClasses", () => ({
  EVENT_CATEGORIES: new Set(["Special Event"]),
  useUpcomingEvents: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/Footer", () => ({ Footer: () => null }));
vi.mock("@/components/PassRequestDialog", () => ({ PassRequestDialog: () => null }));
vi.mock("@/components/PrivateClassDialog", () => ({ PrivateClassDialog: () => null }));

import { locationsFor, locationLine, beachAllowed, LOCATION_LABEL } from "@/lib/privateLocation";
import { privateClassIntake } from "@/lib/privateClassRequest";
import { gyrotonicOfferings, isGyrotonic, GYROTONIC_TITLE, type PrivateOffering } from "@/lib/privateOfferings";
import { TeacherPortfolios } from "@/components/TeacherPortfolios";
import TeacherProfile, { splitBio } from "@/pages/TeacherProfile";

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

describe("3. Every teacher's portfolio shows, and opens her page", () => {
  const renderIt = (ui: React.ReactElement, path = "/") =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
      </QueryClientProvider>,
    );

  db.rpc = {
    public_teachers: [
      { id: "t-eve", display_name: "Evelina", photo_url: null, bio: "Gyrotonic and CranioSacral." },
      { id: "t-zz", display_name: "Zoe Ñandú", photo_url: null, bio: null },
    ],
    public_private_offerings: [offering({})],
    public_teacher_portfolios: [{
      membership_id: "m1", teacher_name: "Evelina", membership_name: "5-Class Pass", price: 101,
      classes_included: 5, valid_days: 30, description: null, payment_link: null, payment_note: null,
      teacher_payment_instructions: null,
    }],
  };

  it("with no class on the schedule: each teacher's card, and it opens her portfolio", async () => {
    renderIt(<TeacherPortfolios sessions={[]} />);
    await waitFor(() => expect(screen.getByText("Evelina")).toBeTruthy());
    expect(screen.getByText("Zoe Ñandú")).toBeTruthy();
    expect(screen.getByText("Gyrotonic and CranioSacral.")).toBeTruthy();
    expect(screen.getAllByText("No group classes on the schedule right now.")).toHaveLength(2);
    const card = screen.getByRole("link", { name: /Evelina — classes, private classes and passes/ });
    expect(card.getAttribute("href")).toBe("/teachers/evelina");
    await waitFor(() => expect(screen.getByRole("link", { name: "Private classes" }).getAttribute("href")).toBe("/teachers/evelina#private"));
    expect(screen.getByRole("link", { name: "Passes" }).getAttribute("href")).toBe("/teachers/evelina#passes");
    // Nothing to book inside the card any more: it is all on her page.
    expect(screen.queryByText("Get it")).toBeNull();
    expect(screen.queryByText("See & request")).toBeNull();
    expect(screen.getByRole("link", { name: /Zoe Ñandú/ }).getAttribute("href")).toBe("/teachers/zoe-nandu");
  });

  it("on Private Sessions only the teachers — no card for a class nobody is named on", async () => {
    const soon = new Date(Date.now() + 86_400_000).toISOString();
    const orphan = {
      id: "s1", class_id: "c1", start_time: soon, spots_remaining: 5, instructor: null,
      classes: { id: "c1", title: "Hatha Yoga", instructor: null, image_url: null, description: null, location: null },
    } as any;
    const { unmount } = renderIt(<TeacherPortfolios sessions={[orphan]} teachersOnly />);
    await waitFor(() => expect(screen.getByText("Evelina")).toBeTruthy());
    expect(screen.queryByText("Hatha Yoga")).toBeNull();
    unmount();
    renderIt(<TeacherPortfolios sessions={[orphan]} />);
    await waitFor(() => expect(screen.getByText("Hatha Yoga")).toBeTruthy()); // the Classes page keeps it, with Reserve
    expect(screen.getByRole("link", { name: "Reserve" }).getAttribute("href")).toBe("/classes/c1");
    // The whole card opens the class too, with its description as plain words.
    expect(screen.getByRole("link", { name: /Hatha Yoga — see the class and its dates/ }).getAttribute("href")).toBe("/classes/c1");
  });

  it("her page: bio, classes, private classes with prices and the request, passes", async () => {
    renderIt(
      <Routes><Route path="/teachers/:slug" element={<TeacherProfile />} /></Routes>,
      "/teachers/evelina",
    );
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Evelina" })).toBeTruthy());
    expect(screen.getByText("Gyrotonic and CranioSacral.")).toBeTruthy();
    expect(screen.getByText(/No group classes on the schedule right now/)).toBeTruthy();
    expect(screen.getByText("Private classes with Evelina")).toBeTruthy();
    expect(screen.getByText("GYROTONIC®")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Request a private class/ }).length).toBeGreaterThan(0);
    expect(screen.getByText("Passes with Evelina")).toBeTruthy();
    expect(screen.getByText("5-Class Pass")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Get it" })).toBeTruthy();
    expect(document.getElementById("classes")).toBeTruthy();
    expect(document.getElementById("private")).toBeTruthy();
    expect(document.getElementById("passes")).toBeTruthy();
  });

  it("her bio is read as greeting, what she teaches, and her story", () => {
    const b = splitBio([
      "Meet Evelina Bolognini",
      "GYROKINESIS® · GYROTONIC® · Cardiovascular Breathwork Instructor",
      "",
      "With over 30 years…",
      "",
      "Originally from Italy…",
    ].join("\n"));
    expect(b.intro).toBe("Meet Evelina Bolognini");
    expect(b.specialties).toEqual(["GYROKINESIS®", "GYROTONIC®", "Cardiovascular Breathwork Instructor"]);
    expect(b.story).toEqual(["With over 30 years…", "Originally from Italy…"]);
    // One plain paragraph is all story; no bio, nothing.
    expect(splitBio("I teach yoga.")).toEqual({ intro: null, specialties: [], story: ["I teach yoga."] });
    expect(splitBio(null)).toEqual({ intro: null, specialties: [], story: [] });
  });

  it("a name that is not a teacher says so", async () => {
    renderIt(<Routes><Route path="/teachers/:slug" element={<TeacherProfile />} /></Routes>, "/teachers/nobody");
    await waitFor(() => expect(screen.getByText("Teacher not found")).toBeTruthy());
  });

  it("the Classes page shows the teachers also in a week with no class, and Private Sessions lists them", () => {
    const classes = read("src/pages/Classes.tsx");
    expect(classes).toMatch(/const showPortfolios = regularEvents\.length > 0 \|\| teachers\.length > 0;/);
    expect(classes).toMatch(/\{showPortfolios && \(/);
    expect(read("src/pages/PrivateClasses.tsx")).toMatch(/<TeacherPortfolios sessions=\{weekly\} teachersOnly \/>/);
    expect(read("src/App.tsx")).toMatch(/\{ path: "\/teachers\/:slug", element: <TeacherProfile \/> \}/);
  });
});

describe("4. A teacher's change shows on the website without refreshing", () => {
  it("the private classes are read again when a page opens — not kept from earlier", async () => {
    const { usePrivateOfferings } = await import("@/lib/privateOfferings");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Probe = () => {
      const { data = [] } = usePrivateOfferings();
      return <p>{data.map((o) => o.title).join(", ") || "none"}</p>;
    };
    db.rpc = { ...db.rpc, public_private_offerings: [] };
    const first = render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText("none")).toBeTruthy());
    first.unmount();
    // She adds one in her panel; the guest opens the request page a moment later.
    db.rpc = { ...db.rpc, public_private_offerings: [offering({ title: "Cardio Vascular Breathwork" })] };
    render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText("Cardio Vascular Breathwork")).toBeTruthy());
  });

  it("saving in her panel refreshes what the website shows, and the other teacher lists stay fresh", () => {
    const ed = read("src/components/teacher/TeacherPrivateOfferingsEditor.tsx");
    expect(ed).toMatch(/queryClient\.invalidateQueries\(\{ queryKey: \["public-private-offerings"\] \}\)/);
    expect(read("src/lib/privateOfferings.ts")).toMatch(/staleTime: 0,\s+refetchOnWindowFocus: true,/);
    expect(read("src/components/TeacherPortfolios.tsx").match(/staleTime: 0/g)).toHaveLength(2);
  });
});

describe("5. A class card's preview text", () => {
  it("keeps the words of links and emphasis, without the markup", async () => {
    const { richTextToPlain } = await import("@/components/ui/rich-text");
    expect(richTextToPlain("Bring a **mat** — see [our studio](https://www.spaholis.com/studio-rental), *gently*."))
      .toBe("Bring a mat — see our studio, gently.");
    expect(richTextToPlain(null)).toBe("");
  });
});
