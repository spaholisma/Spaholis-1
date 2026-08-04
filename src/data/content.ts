/**
 * ═══════════════════════════════════════════════════════════════
 *  CENTRALIZED CONTENT — SINGLE SOURCE OF TRUTH
 *  Edit ALL website text here. Components import from this file.
 *  Admin panel at /admin → Content lets you override these values.
 *
 *  NOTE: Contact details (phone, WhatsApp) live in src/data/contact.ts
 *  and are re-exported below so this file remains the single import
 *  surface for content while the number itself has one owner.
 * ═══════════════════════════════════════════════════════════════
 */
import { HOLIS_WHATSAPP_URL } from "./contact";
export { contact, HOLIS_PHONE_DISPLAY, HOLIS_PHONE_TEL_URL, HOLIS_WHATSAPP_NUMBER, HOLIS_WHATSAPP_URL } from "./contact";

/**
 * ═══ SEO METADATA — per-page titles & descriptions ═══
 */
export const seo = {
  home: {
    title: "Holis Wellness Center | Spa & Yoga, Manuel Antonio CR",
    description: "Holistic treatments, yoga, breathwork, GYROTONIC® and wellness experiences in Manuel Antonio, Costa Rica. Book your free consultation today.",
    canonical: "/",
  },
  about: {
    title: "About Us",
    description: "Meet the team behind Holis Wellness Center in Manuel Antonio, Costa Rica. Our holistic approach to wellness blends ancient traditions with modern techniques.",
    canonical: "/about",
  },
  treatments: {
    title: "Treatments & Therapies",
    description: "Browse holistic treatments, massages, bodywork, and therapeutic services at Holis Wellness Center in Manuel Antonio, Costa Rica.",
    canonical: "/treatments-therapies",
  },
  signatureTreatments: {
    title: "Signature Treatments",
    description: "Discover our signature holistic treatments — SomatoEmotional Release, HoliSynergie, Sacred Facial, and more at Holis Wellness Center.",
    canonical: "/signature-treatments",
  },
  classes: {
    title: "Classes & Events",
    description: "Join yoga, breathwork, meditation, and wellness classes at Holis Wellness Center in Manuel Antonio. View the schedule and book your spot.",
    canonical: "/classes",
  },
  privateSessions: {
    title: "Private Sessions",
    description: "Book private one-on-one, couples, group classes, or GYROTONIC® sessions at Holis Wellness Center. Personalized wellness in Manuel Antonio.",
    canonical: "/private-sessions",
  },
  booking: {
    title: "Book a Treatment",
    description: "Book your holistic treatment, massage, or free consultation at Holis Wellness Center in Manuel Antonio, Costa Rica.",
    canonical: "/book",
  },
  education: {
    title: "Education & Courses",
    description: "Explore educational programs, certifications, and wellness courses at Holis Wellness Center in Manuel Antonio, Costa Rica.",
    canonical: "/education",
  },
  giftCards: {
    title: "Gift Cards",
    description: "Give the gift of wellness. Purchase a Holis Wellness Center gift card for massages, treatments, classes, and more in Manuel Antonio.",
    canonical: "/gift-cards",
  },
  retreats: {
    title: "Retreats & Experiences",
    description: "Explore wellness retreats, packages, and Manuel Antonio experiences at Holis Wellness Center. Multi-day programs and single-day adventures.",
    canonical: "/retreats",
  },
  wellness: {
    title: "Wellness Experiences",
    description: "Explore curated wellness experiences at Holis — from relaxation and energy work to recovery and education. Find what your body needs.",
    canonical: "/wellness",
  },
} as const;

export const content = {
  // ── Navigation ──
  nav: {
    links: [
      { label: "Home", to: "/" },
      { label: "About", to: "/about" },
      { label: "Treatments & Therapies", to: "/treatments-therapies" },
      { label: "Retreats & Experiences", to: "/retreats" },
      { label: "Classes", to: "/classes" },
      { label: "Education", to: "/education" },
      { label: "Blog", to: "/blog" },
      { label: "Gift Cards", to: "/gift-cards" },
      { label: "Book Now", to: "/book" },
    ],
    myAccountLabel: "My Account",
    signInLabel: "Sign In",
    signOutLabel: "Sign Out",
  },

  // ── Homepage Hero ──
  hero: {
    title: "A space to reconnect with your body",
    subtitle: "Every experience is designed around you — your body, your energy, your moment.",
    primaryCta: { text: "Book Your Free Consultation", link: "/book?service=consultation" },
    secondaryCta: { text: "Explore Treatments", link: "/treatments-therapies" },
    tertiaryCta: { text: "Explore Classes", link: "/classes" },
    backgroundImage: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/1710017291666-GUTIMLDB1FIWKSMM99RF/spa-home.jpg",
    backgroundAlt: "Holis Wellness Center",
  },

  // ── Homepage Wellness Section ──
  wellness: {
    eyebrow: "How do you want to feel?",
    title: "Start With an Intention",
    subtitle: "Choose how you want to feel — and we'll show you the treatments, classes and therapies that match.",
    filterLabel: "I want to feel…",
    clearFilter: "Clear filter",
  },

  // ── Homepage Signature Experiences ──
  signatureExperiences: {
    eyebrow: "Crafted With Intention",
    title: "Our Signature Experiences",
    subtitle: "Designed to support how you want to feel",
    items: [
      { title: "Somato Awareness System Massage (90min)", benefit: "\nA gentle reset for your nervous system; Arrive as you are, leave renewed", category: "Massage Therapy", imageKey: "signatureSomato" as const },
      { title: "Holisynergie (90min)", benefit: "Our signature blend of techniques to dissolve tension and restore flow", category: "Massage Therapy", imageKey: "signatureHolisynergie" as const },
      { title: "Essenthya Deluxe\nFacial (75min)", benefit: "Nourishing organic care that lets your natural radiance shine through", category: "Organic Facials", imageKey: "signatureFacial" as const },
      { title: "CranioSacral Therapy (90min)", benefit: "Gentle therapy to restore balance and deep nervous system healing", category: "Holistic Therapy", imageKey: "signatureExpand" as const },
    ],
  },

  // ── Homepage Movement Section ──
  movement: {
    eyebrow: "Movement is Medicine",
    title: "Daily Yoga, Fitness & Movement Classes",
    description: [
      "Step into our serene, ocean-view studio — a light-filled, air-conditioned space designed for mindful movement and deep connection.",
      "Explore Yoga, Gyrokinesis®, Breathwork, Sound Baths, Mindfulness Circles, and more. Every class is guided by experienced teachers who adapt each session for all levels.",
    ],
    ctaText: "Explore Class Schedule",
    ctaLink: "/classes",
    image: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/de76866d-a534-4a54-a94c-21be6876fb3f/Holis+Yoga+Class.jpg",
    imageAlt: "Yoga class at Holis",
  },

  // ── Homepage Testimonials ──
  testimonials: {
    eyebrow: "Tripadvisor Reviews",
    title: "What Our Guests Say",
    rating: 4.9,
    totalReviews: 325,
    tripadvisorUrl: "https://www.tripadvisor.com/Attraction_Review-g309274-d1818898-Reviews-Holis_Wellness_Center_Spa-Manuel_Antonio_Quepos_Province_of_Puntarenas.html",
    readAllText: "Read all 325 reviews on Tripadvisor →",
  },

  // ── Homepage CTA ──
  cta: {
    title: "Not Sure Where to Start?",
    subtitle: "Begin with a complimentary holistic consultation — available as a call or in-person assessment — and discover what your body truly needs.",
    primaryCta: { text: "Book Your Free Consultation", link: "/book?service=consultation" },
    secondaryCta: { text: "Browse All Services", link: "/treatments-therapies" },
    note: "Available online or in person",
  },

  // ── Footer ──
  footer: {
    description: "Your sanctuary of harmony and healing in the heart of Manuel Antonio, Costa Rica. Reconnect with your body, mind, and true self.",
    copyright: "© 2026 Holis Wellness Center. All rights reserved.",
    quickLinksTitle: "Quick Links",
    quickLinks: [
      { label: "Treatments & Therapies", to: "/treatments-therapies" },
      { label: "Class Schedule", to: "/classes" },
      { label: "Book Now", to: "/book" },
      { label: "FAQs", to: "/faqs" },
      { label: "My Account", to: "/dashboard" },
    ],
    contactTitle: "Contact",
    contact: {
      address: ["Manuel Antonio, Quepos", "Costa Rica"],
      email: "spaholisma@gmail.com",
    },
  },

  // ── About Page ──
  about: {
    heroEyebrow: "Our Story",
    heroTitle: "Where Healing Meets Nature",
    heroImage: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/de76866d-a534-4a54-a94c-21be6876fb3f/Holis+Yoga+Class.jpg",
    heroImageAlt: "Yoga class at Holis Wellness Center",
    brandEyebrow: "Holis Wellness Center",
    brandTitle: "A sanctuary for body, mind & spirit in Manuel Antonio",
    brandParagraphs: [
      "Nestled in the lush tropical beauty of Manuel Antonio, Costa Rica, Holis Wellness Center was born from a deep belief that true healing happens when we reconnect with the biological wisdom of nature.",
      "Our multidisciplinary approach weaves together bodywork, movement, and holistic therapies — creating a space where ancient wisdom meets modern understanding. Every session, every class, every moment at Holis is designed to help you find your way back to balance.",
    ],
    founderEyebrow: "Meet Our Founder",
    founderName: "Evelina Bolognini",
    founderRole: "CranioSacral Therapist · Family Constellations Facilitator · Gyrokinesis® & Gyrotonic® Instructor",
    founderImage: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/1dce259e-49ef-4569-a529-ef7f02c70229/Eve-bio.jpg",
    founderImageAlt: "Evelina Bolognini, Founder of Holis Wellness Center",
    founderBio: [
      "Evelina is a second-generation bodyworker who has been curious about the body as a whole since childhood. Following in the footsteps of her father, she has studied a wide range of therapies in her native Italy, as well as in the US, Mexico, and Costa Rica.",
      "With over 30 years of personal experience, passionate study, research, and professional dedication, Evelina's therapeutic approach relies on CranioSacral Therapy (non-invasive osteopathy), Gyrokinesis® & Gyrotonic® modalities (mindful movement), and Family Constellations (systemic reorganization).",
    ],
    founderSections: [
      { title: "The Holistic Nature of Bodywork", text: "After two decades of studying and working as a massage therapist, in 2012 Evelina's professional world expanded when she began learning about how our body is shaped, performs, and functions based on the science of embryology. CranioSacral Therapy and Somato Emotional Release became the foundation of her work — a gentle yet profound approach that provides support without imposing." },
      { title: "The Healing Power of Movement", text: "In 2007, inspired by how Pilates helped her recover from a herniated disk, Evelina began teaching movement classes. By 2014, Holis expanded into a full wellness center with a dedicated movement studio. In 2015, she discovered Gyrokinesis® — falling in love with its efficient, gentle, yet powerful sequencing and breathwork." },
      { title: "Continuous Expansion", text: "Evelina collaborates with movement professionals internationally and has contributed to yoga teacher trainings through her own methodology of Holistic Anatomy. In 2023, she was honored to assist the Upledger Institute in training new CranioSacral Therapists for the Four Seasons Hotel in Costa Rica." },
    ],
    founderQuote: "It is considerably easier to focus on personal well-being when you are feeling nature's vibrations and inhaling the tropical ocean or mountain air. When exposed to the biological perfection of nature one can remember that we are ruled by the same principles — sustainable wellness, if you will.",
    founderQuoteAttribution: "Evelina Bolognini, Founder & Owner",
    therapistsEyebrow: "Our Experts",
    therapistsTitle: "Massage & Spa Therapists",
    therapists: [
      { name: "Jeffrey", role: "Massage Therapist", bio: "With a deep sense of intuition and a wealth of knowledge and skill, Jeffrey creates a safe, supportive space for every client. His unwavering commitment has earned him the trust and loyalty of many returning clients.", image: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/482c3496-fac3-41c6-8128-dbf346a34884/Jeffrey+certified+massage+therapist+at+Holis+Wellness+Center" },
      { name: "Ashley", role: "Massage Therapist & Yoga Instructor", bio: "Ashley's passion for bodywork rises from her longstanding yoga training and practice. Her capacity to integrate body work techniques and deep understanding of body mechanics make her sessions exceptional.", image: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/262fc549-f6a6-456c-8eb2-3d3bcbd3a47a/Ashley+certified+massage+therapist+at+Holis+Wellness+Center" },
      { name: "Jocelyne", role: "Massage Therapist", bio: "A dedicated therapist bringing care and expertise to every session.", image: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/7ac371a1-0959-4528-b827-613a9515ab6b/WhatsApp+Image+2026-02-17+at+14.37.56.jpeg" },
      { name: "Dilana", role: "Massage Therapist", bio: "Over 20 years at Holis — a record in Manuel Antonio. Her practice combines deep spirituality, great energy, and expertise in Deep Tissue, Swedish, Thai Massage, and Aromatouch Technique.", image: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/6462e701-32c4-48ba-a6c8-9ff4f3529c29/Dilana+certified+massage+therapist+at+Holis+Wellness+Center" },
      { name: "Jenny", role: "Massage Therapist", bio: "Bringing healing touch and dedicated care to every client experience.", image: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/d25ab0e1-a2b7-4426-8f64-c6cd3e0b04aa/WhatsApp+Image+2026-02-17+at+14.37.55.jpeg" },
      { name: "Thiara", role: "Massage Therapist", bio: "A skilled therapist dedicated to creating restorative experiences.", image: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/06ec6388-2ec6-4fcd-878c-18916e3f93ac/Thiara.jpg" },
      { name: "Priscilla", role: "Massage Therapist & Yoga Teacher", bio: "Since age 19, Priscilla has built a rich practice spanning Thai massage, Reiki, and a 200-hour yoga teacher training — bringing deep knowledge of body biomechanics to every session.", image: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/0e872735-f4a0-4462-8c85-707615b96abb/Priscilla+certified+massage+therapist+at+Holis+Wellness+Center" },
      { name: "Susana", role: "Massage Therapist", bio: "Since 2009, Susana has enriched her practice with Reiki, Thai massage, CranioSacral therapy, crystal healing, and traditional Chinese medicine including cupping and reflexology.", image: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/12c3c539-3861-4731-8c6a-97c6b0db8a7b/Susana+certified+massage+therapist+at+Holis+Wellness+Center" },
      { name: "Betsabé", role: "Massage Therapist & Yoga Instructor", bio: "Betza discovered yoga in 2013 and fell in love with the practice. Now certified in Vinyasa Flow and children's yoga methodology, she brings both therapeutic touch and mindful movement to her work.", image: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/dc47f406-43ed-4bbb-acf7-fce9347e9ae3/WhatsApp+Image+2026-02-18+at+08.28.49.jpeg" },
      { name: "Christofer", role: "Massage Therapist", bio: "Passionate about bodywork from the start, Christofer trained in Thai massage and expanded into sports massage, deep tissue, and reflexology. One of the most requested therapists, especially for Thai massage.", image: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/f066b53e-0323-4f37-a30e-c8705ebb2b27/Christofer+certified+massage+therapist+at+Holis+Wellness+Center" },
    ],
    instructorsEyebrow: "Movement & Mindfulness",
    instructorsTitle: "Yoga & Movement Instructors",
    instructors: [
      { name: "Ashley", role: "Yoga Instructor", bio: "Yoga changed Ashley's life in 2008 during her recovery from Hodgkin's Lymphoma. Certified since 2014, she now teaches Hatha, Vinyasa, aerial yoga, Barre, Pilates, and fitness classes in Costa Rica.", image: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/a915143f-ed6c-4667-bbba-53819a200ee5/Ashley+Certified+Yoga+Instructor+at+Holis+Wellness+Center" },
      { name: "Melanie", role: "Yoga Instructor", bio: "After moving from New York City over 13 years ago, Melanie now calls Costa Rica home. A Registered Yoga Teacher (RYT), she teaches vinyasa flow, hatha, and aerial yoga with a focus on alignment and strengthening.", image: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/887c4eb1-7025-497d-9942-7bae5b893343/Melanie+Certified+Yoga+Instructor+at+Holis+Wellness+Center" },
      { name: "Mike", role: "Yoga & Breathwork Instructor", bio: "Originally from England, Mike is a Yoga Alliance certified instructor, DDP Yoga instructor, meditation teacher, life coach, and Level 3 Breathwork & Cold Exposure Master trained under a direct student of Wim Hof.", image: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/54c281e1-dc00-4189-8070-df800b809b0e/Mike+Certified+Yoga+Instructor+at+Holis+Wellness+Center" },
      { name: "Betsabé", role: "Yoga Instructor", bio: "Betza began practicing yoga in 2013 and became certified in Vinyasa Flow and applied yoga methodology for children. She brings deep consciousness and joy to every class.", image: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/3ab0d9e9-c261-494f-88b9-e8e65c57e31c/Betzabe+Certified+Yoga+Instructor+at+Holis+Wellness+Center" },
    ],
    managementEyebrow: "Your Welcome Team",
    managementTitle: "Management & Reception",
    management: [
      { name: "Siany", role: "Reception & Retreat Coordinator", bio: "Coordinating retreats and welcoming guests with warmth and care.", image: "" },
      { name: "Francesca", role: "Reception", bio: "Creating a warm first impression for every visitor.", image: "" },
      { name: "Alejandra", role: "Reception", bio: "Ensuring every guest feels welcomed and supported.", image: "" },
    ],
  },

  // ── Services / Treatments Page ──
  services: {
    eyebrow: "Treatments & Therapies",
    title: "Treatments & Therapies",
    subtitle: "Our massage therapy treatments are designed to relieve muscle tension, reduce stress, and support overall wellness. Using techniques such as deep tissue, Swedish, and therapeutic massage, each session is tailored to your body’s needs to improve circulation, ease pain, and promote deep relaxation.",
    selectPlaceholder: "Select a category",
    bookButtonText: "Book",
  },

  // ── Signature Treatments Page ──
  signatureTreatments: {
    heroImage: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/79cd6afb-c5bb-4990-86c6-b10a22defda3/Screenshot+2025-01-12+at+7.58.39%E2%80%AFAM.png",
    heroImageAlt: "Holis Signature Experiences",
    heroEyebrow: "Exclusive Experiences",
    heroTitle: "Signature Treatments",
    heroSubtitle: "Wellness journeys designed for balance, healing, and transformation.",
    introEyebrow: "Our Philosophy",
    introTitle: "Activate your wellness journey with us",
    introText: "At Holis, we believe that true well-being emerges when the body, mind, and spirit work in harmony. Our signature treatments are carefully crafted experiences — each one a unique pathway toward self-discovery, deep healing, and lasting balance. Whether you seek a single transformative session or an extended wellness journey, every experience is personalized to meet you exactly where you are.",
    ctaTitle: "Ready to Begin?",
    ctaText: "Every journey starts with a single step. Explore our signature experiences and find the treatment that resonates with your path to wellness.",
    ctaButtonText: "Request Booking",
    treatments: [
      {
        title: "Somato Awareness System Massage (90min)",
        description: "A deeply transformative full-body experience that guides you into profound connection with your body's own intelligence. Through intentional touch and presence, this treatment invites deep release, recalibrates the nervous system, and cultivates a heightened sense of body awareness.",
        benefits: ["Deep muscular and emotional tension release", "Nervous system reset and regulation", "Enhanced body-mind awareness", "Restored energetic flow and balance"],
        image: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/1733151575626-1H40BRUPSKAXDESWYE0U/unsplash-image-0MoF-Fe0w0A.jpg",
        imageAlt: "Somato Awareness Massage at Holis",
        bookingLink: "/book",
        comingSoon: false,
      },
      {
        title: "Holis Jump Start",
        description: "An invigorating reset designed to reawaken your system and ignite inner vitality. This energizing treatment combines targeted techniques to rebalance your body's natural rhythms, making it the perfect catalyst for your wellness journey.",
        benefits: ["Full-system energy activation", "Metabolic and circulatory boost", "Mental clarity and focus", "Foundation for ongoing wellness"],
        image: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/1733151383170-WHX3TKIDKZTKZPB7RCD1/image-asset.jpeg",
        imageAlt: "Holis Jump Start treatment",
        bookingLink: "/book",
        comingSoon: false,
      },
      {
        title: "Wellness Packages",
        description: "Thoughtfully curated multi-session journeys that weave together movement, bodywork, and holistic therapies. Each package offers a progressive pathway — building session by session toward deeper healing, greater awareness, and lasting transformation.",
        benefits: ["Progressive, multi-treatment healing arcs", "Integrated movement and bodywork", "Personalized wellness milestones", "Deeper results through continuity", "Best value for committed wellness"],
        image: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/1733151717240-ZYA0HM24HQ7SS949DZ8I/unsplash-image-9BjH8jl7Uj0.jpg",
        imageAlt: "Wellness Packages at Holis",
        bookingLink: "/book",
        comingSoon: false,
      },
      {
        title: "Essenthya Deluxe Facial",
        description: "A luxurious, results-driven facial ritual that deeply nourishes and revitalizes your skin. Using premium botanical essences, this treatment restores your complexion's natural luminosity while providing a profoundly relaxing sensory experience.",
        benefits: ["Deep skin nourishment and hydration", "Visible radiance and glow", "Fine line and tension reduction", "Complete sensory rejuvenation"],
        image: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/1733151281607-QT5PXOJR1O8Z8LTIIR2N/unsplash-image-HXsYayB33a8.jpg",
        imageAlt: "Essenthya Deluxe Facial",
        bookingLink: "/book",
        comingSoon: false,
      },
      {
        title: "Structural Balance Class",
        description: "A movement-based alignment session rooted in holistic body mechanics. Through guided exercises and breath awareness, this class strengthens postural integrity, improves functional movement, and cultivates lasting harmony between body and mind.",
        benefits: ["Improved posture and alignment", "Core strength and stability", "Greater range of motion", "Body-mind integration through movement"],
        image: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/1733151216283-Z4YHQODOZBVVH892ABP1/unsplash-image-rBLTWS3WsQ8.jpg",
        imageAlt: "Structural Balance Class",
        bookingLink: "/private-classes",
        comingSoon: false,
      },
      {
        title: "Holis Reflexology",
        description: "A precision pressure-point therapy targeting the feet's reflex zones to restore balance throughout the entire body. This ancient healing art stimulates circulation, eases tension, and activates the body's innate self-healing mechanisms.",
        benefits: ["Enhanced circulation and lymphatic flow", "Whole-body tension relief", "Natural healing activation", "Deep relaxation and stress reduction"],
        image: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/1733151132437-7N7HV23I2FBJA8YJQ6NJ/image-asset.jpeg",
        imageAlt: "Holis Reflexology treatment",
        bookingLink: "/book",
        comingSoon: true,
      },
    ],
  },

  // ── Classes Page ──
  classes: {
    banner: "Info for all of our upcoming events & classes",
    title: "Upcoming Events",
    calendarLink: "View all events in calendar format",
    privateLink: "Book a Private Class",
    emptyTitle: "No Upcoming Events",
    emptyDescription: "We're planning something wonderful. Check back soon for new classes, workshops, and events.",
    workshopsEyebrow: "Self Care and Wellbeing with Evelina",
    workshopsTitle: "Workshops",
    workshopsSubtitle: "Immersive workshops designed to deepen your self-care practice and holistic wellbeing.",
  },

  // ── Private Classes Page ──
  privateSessions: {
    eyebrow: "One-on-One & Group Sessions",
    title: "Private Classes",
    subtitle: "Personalized sessions designed to meet your specific goals, pace, and needs.",
    pricingTitle: "Pricing",
    offeringsTitle: "Our Private Offerings",
    benefits: [
      "Personalized attention",
      "Faster progress",
      "Customized programs",
      "Flexible scheduling",
    ],
    // Per-class cover images. Override per class id via the Admin Content Editor
    // (site_content "content" → privateSessions.images.<classId>) without touching code.
    images: {
      "one-on-one-private-class": "",
      "couples-private-class": "",
      "private-group-class": "",
      "gyrotonic-expansion-system": "/images/gyrotonic.jpg",
    } as Record<string, string>,
  },

  // ── Gift Cards Page ──
  giftCards: {
    eyebrow: "The Perfect Gift",
    title: "Gift Cards",
    subtitle: "Give the gift of wellness. Our gift cards can be redeemed for any treatment, class, or experience at Holis Wellness Center.",
    chooseAmountTitle: "Choose an Amount",
    successTitle: "Gift Card Purchased!",
    successButtonText: "Purchase Another",
  },

  // ── Education Page ──
  education: {
    heroTitle: "Educational Programs",
    heroByline: "by Holis Wellness Founder Evelina Bolognini",
    heroDescription: "Our educational offerings create a warm, inclusive environment where participants can deepen self-awareness, strengthen relationships, and develop sustainable wellness habits that nurture long-term health and harmony.",
    // ── Main images ──
    heroImage: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/e8d3d8e8-aeb6-4bf8-bd54-7accc0ec5b31/1.webp",
    somatoImage: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/ea8a0bdc-2ef9-4308-b8a1-5020bdbfa905/holis+page+massage+therapy+%281%29.jpg",
    couplesImage: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/654ba82a-0efe-4483-9d74-b2bd4bf4c38d/EvolveJan16-scaled+%281%29.webp",
    // ── Somato Awareness System section ──
    sasHeading: "Somato Awareness System™",
    sasSubheading: "Professional Training for Conscious Therapeutic Massage",
    createdBy: "Created by Evelina Bolognini",
    sasIntro1: "The Somato Awareness System™ (SAS) is an advanced training method that integrates somatic awareness, holistic anatomy, and therapeutic massage into a powerful and intelligent treatment approach.",
    sasIntro2: "Rather than simply learning techniques, therapists learn how to understand the body, assess each client, and design personalized treatments.",
    sasIntro3: "The system transforms massage into a precise therapeutic dialogue between therapist and body, creating deeper and longer-lasting results.",
    sasIntro4: "The program is structured in three progressive levels, guiding therapists from foundational awareness to advanced therapeutic mastery.",
    eachLevel: "Each level includes:",
    hoursDirect: "• 48 hours of direct training with the facilitator",
    hoursPractice: "• 12 hours of supervised and independent practice",
    totalLevel: "Total per level: 60 hours",
    practiceNote: "A minimum one-week practice period is required between training visits.",
    // ── FECOPROBE certification card ──
    fecoprobeEyebrow: "Official Certification",
    fecoprobeTitle: "FECOPROBE AEL-0964",
    fecoprobeDescription: "Academic Elementary Membership Certification for the Somato Awareness System™ educational program.",
    // ── Section labels ──
    whatLearn: "What You Will Learn",
    whatPractice: "What You Will Practice",
    resultLabel: "Result",
    investmentLabel: "Investment",
    perModule: "per module",
    byRequest: "By request",
    requestInfo: "Request Information",
    // ── Somato levels (accordion) ──
    sasLevels: [
      {
        title: "Somato Awareness System Level 1",
        subtitle: "Foundations of Somatic Awareness",
        intro: "SAS Level 1 establishes the essential foundations of the Somato Awareness System™. Participants develop body awareness, ergonomic working habits, and an understanding of the body's connective tissue system. Therapists begin learning how to listen to the body through touch and recognize how tissues adapt and respond.",
        learn: [
          "Therapist self-care and body conditioning",
          "Ergonomic and biodynamic table work",
          "Fundamentals of fascia and connective tissue",
          "Introduction to holistic anatomy",
          "Developing conscious therapeutic touch",
        ],
        practice: [
          "Develop daily self-care routines including self-massage, conscious movement, and breathing practices.",
          "Learn efficient posture and biomechanics for safe and sustainable table work.",
          "Explore the connective tissue network and its role in structural balance.",
          "Practice massage techniques that cultivate somatic awareness and therapeutic intention.",
        ],
        result: "By the end of SAS 1, therapists work with greater body awareness, improved ergonomics, and a deeper understanding of connective tissue.",
      },
      {
        title: "Somato Awareness System Level 2",
        subtitle: "Assessment & Personalized Treatment",
        intro: "SAS Level 2 introduces kinesiological testing and myofascial integration, allowing therapists to develop more precise and personalized treatments. Therapists learn how to read the body's responses, identify functional patterns, and adapt treatments in real time.",
        learn: [
          "Non-muscular kinesiological testing (MRT arm reflex)",
          "Wilhelm Reich's body segments",
          "Myofascial lines and structural connections",
          "Therapeutic aromatherapy integration",
          "Treatment evaluation and progress tracking",
        ],
        practice: [
          "Learn to perform kinesiological testing to guide treatment decisions.",
          "Identify tension patterns within body segments.",
          "Work along myofascial lines to integrate distant areas of the body.",
          "Apply aromatherapy as a therapeutic support tool.",
        ],
        result: "At the end of SAS 2, therapists are able to assess the body more accurately and design treatments tailored to each client's needs.",
      },
      {
        title: "Somato Awareness System Level 3",
        subtitle: "Advanced Integration & Therapeutic Mastery",
        intro: "SAS Level 3 integrates all elements of the system into a complete and advanced therapeutic approach. Therapists learn to combine holistic anatomy, nervous system awareness, and manual techniques to create highly effective treatments.",
        learn: [
          "Embryological relationships within the body",
          "Transverse tissue release (diaphragms)",
          "The principle of biotensegrity",
          "Introduction to polyvagal theory",
          "Craniosacral anatomical relationships",
        ],
        practice: [
          "Apply advanced tissue release techniques along myofascial pathways.",
          "Work with the body's diaphragms and structural planes.",
          "Integrate nervous system awareness into therapeutic touch.",
          "Design and perform a complete Somato Awareness System™ treatment session.",
        ],
        result: "By the end of SAS 3, therapists are able to deliver a full SAS therapeutic treatment, combining assessment, testing, and advanced manual work. Participants receive the Somato Awareness System™ Certificate of Training upon successful completion.",
      },
    ],
    // ── Professional Modules (Kinesiology etc.) ──
    modulesEyebrow: "Continuing Education",
    modulesTitle: "Professional Modules",
    modulesSubtitle: "Open to everyone — therapists, yoga teachers, bodyworkers, and anyone curious about the body's intelligence. No prior background required. Request information to join the next module.",
    // ── Couple's & Connection Experience ──
    couplesHeading: "Couple's & Connection Experience",
    couplesIntro: "Our workshops explore therapeutic touch and couples massage techniques, self-care practices, aromatherapy basics, and mindful relaxation methods that support physical ease, emotional balance, and meaningful connection.",
    // ── Request information dialog ──
    dialogTitle: "Request information",
    dialogProgram: "Program",
    dialogSessions: "Sessions",
    dialogTotal: "Total",
    dialogFullName: "Full name",
    dialogIntro: "Leave your details and our team will contact you with all the information about this training.",
  },

  // ── WhatsApp Button ──
  // NOTE: `link` is derived from src/data/contact.ts — never hardcode a wa.me URL here.
  whatsapp: {
    text: "Chat on WhatsApp",
    link: HOLIS_WHATSAPP_URL,
    enabled: true,
  },
} as const;
