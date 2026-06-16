const pptxgen = require("pptxgenjs");
const path = require("path");
const fs = require("fs");

// ═══════════════════════════════════════════════════════════════════
//  PREDICTRA THREAT MAP — PREMIUM WHITE THEME
//  Design: Clean white + soft shadows + vibrant accent palette
// ═══════════════════════════════════════════════════════════════════

const ASSETS = path.join(__dirname, "assets");
const REPORT_ASSETS = path.join(__dirname, "..", "rapport-pfe", "assets");
const SCREENSHOTS = path.join(REPORT_ASSETS, "screenshots");

// ─── DESIGN TOKENS (LIGHT PREMIUM) ──────────────────────────────
const C = {
  // BACKGROUNDS
  bg:         "FFFFFF",   // Pure white
  bgSoft:     "F8FAFC",   // Off-white whisper
  bgCard:     "FFFFFF",   // White card
  bgCardAlt:  "F1F5F9",   // Soft gray card
  bgFooter:   "0F172A",   // Dark navy footer bar
  
  // BORDERS
  border:     "E2E8F0",   // Light gray border
  borderMed:  "CBD5E1",   // Medium gray
  
  // ACCENT PALETTE
  primary:    "0F172A",   // Deep navy (titles)
  secondary:  "334155",   // Slate gray (subtitles)
  body:       "475569",   // Medium gray (body)
  muted:      "94A3B8",   // Muted text
  
  // VIBRANT ACCENTS
  blue:       "2563EB",   // Royal blue
  indigo:     "4F46E5",   // Indigo
  violet:     "7C3AED",   // Violet
  cyan:       "0891B2",   // Teal cyan
  emerald:    "059669",   // Emerald green
  amber:      "D97706",   // Amber
  rose:       "E11D48",   // Rose red
  sky:        "0284C7",   // Sky blue
  
  // DECORATIVE
  accentLine: "2563EB",   // Blue accent line
  tagBg:      "EFF6FF",   // Light blue tag bg
  tagText:    "1D4ED8",   // Blue tag text
  white:      "FFFFFF",
};

const FONT = "Segoe UI";

// ─── HELPER: Top accent bar (thin blue line) ────────────────────
function topBar(slide) {
  slide.addShape("rect", {
    x: 0, y: 0, w: "100%", h: 0.05,
    fill: { color: C.blue },
  });
}

// ─── HELPER: Geometric corners (subtle) ─────────────────────────
function corners(slide) {
  // Top-right
  slide.addShape("rect", { x: 12.0, y: 0.3, w: 1.0, h: 0.002, fill: { color: C.border } });
  slide.addShape("rect", { x: 12.98, y: 0.3, w: 0.002, h: 0.7, fill: { color: C.border } });
  // Bottom-left
  slide.addShape("rect", { x: 0.35, y: 7.15, w: 0.002, h: 0.3, fill: { color: C.border } });
  slide.addShape("rect", { x: 0.35, y: 7.15, w: 0.7, h: 0.002, fill: { color: C.border } });
}

// ─── HELPER: Slide header ───────────────────────────────────────
function header(slide, chapter, title) {
  topBar(slide);
  corners(slide);
  
  if (chapter) {
    slide.addText(chapter.toUpperCase(), {
      x: 0.8, y: 0.3, w: 11.5, h: 0.28,
      fontFace: FONT, fontSize: 9, bold: true,
      color: C.blue, letterSpacing: 4,
    });
  }
  
  slide.addText(title, {
    x: 0.8, y: chapter ? 0.6 : 0.35, w: 11.5, h: 0.55,
    fontFace: FONT, fontSize: 30, bold: true,
    color: C.primary,
  });
  
  // Blue accent line + faded extension
  slide.addShape("rect", {
    x: 0.8, y: chapter ? 1.22 : 1.0, w: 2.0, h: 0.035,
    fill: { color: C.blue },
  });
  slide.addShape("rect", {
    x: 2.9, y: chapter ? 1.23 : 1.01, w: 9.6, h: 0.012,
    fill: { color: C.border },
  });
}

// ─── HELPER: Premium card with soft shadow ──────────────────────
function card(s, x, y, w, h, title, body, opts = {}) {
  const accent = opts.accent || C.blue;
  
  // Soft shadow card
  s.addShape("roundRect", {
    x, y, w, h,
    fill: { color: C.bgCard },
    line: { color: opts.borderColor || C.border, width: 0.7 },
    rectRadius: 0.12,
    shadow: { type: "outer", blur: 12, offset: 3, angle: 200, color: "94A3B8", opacity: 0.25 },
  });
  
  // Colored top stripe
  if (opts.stripe !== false) {
    s.addShape("rect", {
      x: x + 0.12, y: y + 0.02, w: w - 0.24, h: 0.04,
      fill: { color: accent },
    });
  }
  
  // Left vertical accent bar
  if (opts.leftBar) {
    s.addShape("rect", {
      x: x + 0.03, y: y + 0.25, w: 0.045, h: h * 0.45,
      fill: { color: accent },
    });
  }
  
  const tx = x + (opts.leftBar ? 0.25 : 0.22);
  const tw = w - (opts.leftBar ? 0.47 : 0.44);
  
  if (title) {
    s.addText(title, {
      x: tx, y: y + 0.18, w: tw, h: 0.4,
      fontFace: FONT, fontSize: opts.titleSize || 14, bold: true,
      color: C.primary,
    });
  }
  
  if (body && body.length > 0) {
    s.addText(body.join("\n"), {
      x: tx, y: y + (title ? 0.62 : 0.18),
      w: tw, h: h - (title ? 0.85 : 0.35),
      fontFace: FONT, fontSize: opts.bodySize || 10.5,
      color: opts.bodyColor || C.body,
      lineSpacingMultiple: opts.ls || 1.35,
      valign: "top",
    });
  }
}

// ─── HELPER: Number badge ───────────────────────────────────────
function badge(s, x, y, num, color) {
  s.addShape("ellipse", {
    x, y, w: 0.42, h: 0.42,
    fill: { color: color, transparency: 90 },
    line: { color: color, width: 1.5 },
  });
  s.addText(String(num), {
    x, y, w: 0.42, h: 0.42,
    fontFace: FONT, fontSize: 15, bold: true,
    color: color, align: "center", valign: "middle",
  });
}

// ─── HELPER: Tag pill ───────────────────────────────────────────
function tag(s, x, y, text, color) {
  const tw = text.length * 0.065 + 0.3;
  s.addShape("roundRect", {
    x, y, w: tw, h: 0.28,
    fill: { color: color, transparency: 90 },
    line: { color: color, width: 0.5 },
    rectRadius: 0.05,
  });
  s.addText(text, {
    x, y, w: tw, h: 0.28,
    fontFace: FONT, fontSize: 7, bold: true,
    color: color, align: "center", valign: "middle", letterSpacing: 1,
  });
}

// ─── HELPER: Safe image ─────────────────────────────────────────
function img(s, imgPath, opts) {
  if (fs.existsSync(imgPath)) {
    s.addImage({ path: imgPath, ...opts });
    return true;
  }
  s.addShape("roundRect", {
    x: opts.x, y: opts.y, w: opts.w, h: opts.h,
    fill: { color: C.bgCardAlt },
    line: { color: C.border, width: 0.5, dashType: "dash" },
    rectRadius: 0.1,
  });
  return false;
}

// ═══════════════════════════════════════════════════════════════════
const prs = new pptxgen();
prs.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
prs.layout = "WIDE";
prs.author = "Brahim JABALLI & Chiheb AMRI";
prs.company = "Predictra Cybersecurity";
prs.title = "Predictra Threat Map — Graduation Defense 2025/2026";


// ════════════════════════════════════════════════════════════════
//  SLIDE 1 — TITLE
// ════════════════════════════════════════════════════════════════
(() => {
  const s = prs.addSlide({ bkgd: C.bg });
  s.transition = { type: "fade", speed: 1.5 };
  
  // Top accent bar
  s.addShape("rect", { x: 0, y: 0, w: "100%", h: 0.06, fill: { color: C.blue } });
  
  // Decorative circles (very subtle)
  s.addShape("ellipse", {
    x: -1.0, y: -0.5, w: 4, h: 4,
    fill: { color: C.blue, transparency: 96 },
    line: { color: C.blue, width: 0.3, transparency: 90 },
  });
  s.addShape("ellipse", {
    x: 11.0, y: 5.0, w: 3.5, h: 3.5,
    fill: { color: C.indigo, transparency: 97 },
    line: { color: C.indigo, width: 0.3, transparency: 92 },
  });
  corners(s);
  
  // Title
  s.addText("PREDICTRA", {
    x: 0, y: 1.0, w: "100%", h: 1.1,
    fontFace: FONT, fontSize: 62, bold: true,
    color: C.primary, align: "center", letterSpacing: 14,
  });
  s.addText("THREAT MAP", {
    x: 0, y: 2.0, w: "100%", h: 0.9,
    fontFace: FONT, fontSize: 48, bold: true,
    color: C.blue, align: "center", letterSpacing: 16,
  });
  
  // Divider
  s.addShape("rect", {
    x: 4.0, y: 3.0, w: 5.33, h: 0.035,
    fill: { color: C.blue },
  });
  
  s.addText("Design & Development of a Real-Time Spatialized\nThreat Intelligence Visualization Platform", {
    x: 1.5, y: 3.15, w: 10.33, h: 0.7,
    fontFace: FONT, fontSize: 14, color: C.secondary,
    align: "center", lineSpacingMultiple: 1.5,
  });

  // Authors Card
  s.addShape("roundRect", {
    x: 1.0, y: 4.15, w: 5.2, h: 2.2,
    fill: { color: C.bgCard },
    line: { color: C.border, width: 0.8 },
    rectRadius: 0.15,
    shadow: { type: "outer", blur: 14, offset: 3, angle: 200, color: "94A3B8", opacity: 0.2 },
  });
  s.addShape("rect", { x: 1.15, y: 4.17, w: 4.9, h: 0.04, fill: { color: C.blue } });
  s.addText([
    { text: "AUTHORS\n", options: { fontSize: 8, bold: true, color: C.blue, letterSpacing: 4 } },
    { text: "Brahim JABALLI  &  Chiheb AMRI\n\n", options: { fontSize: 16, bold: true, color: C.primary } },
    { text: "SUPERVISOR\n", options: { fontSize: 8, bold: true, color: C.blue, letterSpacing: 4 } },
    { text: "Mr. Anis DHAHRI — ISET Gafsa", options: { fontSize: 13, color: C.secondary } },
  ], { x: 1.25, y: 4.35, w: 4.7, h: 1.8, valign: "top" });

  // Institution Card
  s.addShape("roundRect", {
    x: 7.13, y: 4.15, w: 5.2, h: 2.2,
    fill: { color: C.bgCard },
    line: { color: C.border, width: 0.8 },
    rectRadius: 0.15,
    shadow: { type: "outer", blur: 14, offset: 3, angle: 200, color: "94A3B8", opacity: 0.2 },
  });
  s.addShape("rect", { x: 7.28, y: 4.17, w: 4.9, h: 0.04, fill: { color: C.indigo } });
  s.addText([
    { text: "HOST ORGANIZATION\n", options: { fontSize: 8, bold: true, color: C.indigo, letterSpacing: 4 } },
    { text: "Predictra Cybersecurity\n\n", options: { fontSize: 16, bold: true, color: C.primary } },
    { text: "ACADEMIC YEAR\n", options: { fontSize: 8, bold: true, color: C.indigo, letterSpacing: 4 } },
    { text: "2025 / 2026  ·  Computer System Development", options: { fontSize: 12, color: C.secondary } },
  ], { x: 7.38, y: 4.35, w: 4.7, h: 1.8, valign: "top" });

  // Jury
  s.addText("Jury:  Ms. Hadhami ISSAOUI (President)   ·   Mr. Walid HAMMEMI (Reporter)", {
    x: 0, y: 6.65, w: "100%", h: 0.45,
    fontFace: FONT, fontSize: 10, italic: true, color: C.muted, align: "center",
  });

  // Bottom bar
  s.addShape("rect", { x: 0, y: 7.44, w: "100%", h: 0.06, fill: { color: C.blue } });

  s.addNotes(
    "Brahim: Good morning, ladies and gentlemen of the jury. Welcome to our graduation defense for our " +
    "Bachelor's Degree in Information Technology. My name is Brahim Jaballi, and alongside my colleague " +
    "Chiheb Amri, we are proud to present our final year project: the 'Predictra Threat Map'. This project, " +
    "conducted under the supervision of Mr. Anis Dhahri at ISET Gafsa, and in collaboration with host company " +
    "Predictra Cybersecurity, focuses on the design and development of a real-time spatialized threat " +
    "intelligence visualization platform. We would also like to thank Ms. Hadhami Issaoui and Mr. Walid Hammemi " +
    "for presiding and reporting on our defense today."
  );
})();


// ════════════════════════════════════════════════════════════════
//  SLIDE 2 — OUTLINE
// ════════════════════════════════════════════════════════════════
(() => {
  const s = prs.addSlide({ bkgd: C.bg });
  s.transition = { type: "fade", speed: 1.5 };
  header(s, "AGENDA", "Presentation Outline");

  const chapters = [
    { n: "01", t: "Introduction", items: ["Global threat landscape", "Expanding attack surface", "Strategic threat intel"], c: C.blue },
    { n: "02", t: "Pre-Study", items: ["Host company profile", "The critical problematic", "Proposed 4-layer solution", "Agile Scrum model"], c: C.indigo },
    { n: "03", t: "Conceptual Study", items: ["System actors & boundaries", "Functional requirements", "Use Case & Class models", "Technology stack", "System architecture"], c: C.violet },
    { n: "04", t: "Realization", items: ["9 threat feed scrapers", "5-layer enrichment engine", "SSE streaming pipeline", "STIX & MITRE mapping", "Performance guardrails"], c: C.rose },
    { n: "05", t: "Conclusion", items: ["Achievement summary", "Sprint retrospective", "Kafka & ML roadmap"], c: C.emerald },
  ];

  const cw = 2.25, gap = 0.2, sx = 0.55;
  chapters.forEach((ch, i) => {
    const x = sx + i * (cw + gap);
    
    s.addShape("roundRect", {
      x, y: 1.6, w: cw, h: 5.2,
      fill: { color: C.bgCard },
      line: { color: C.border, width: 0.6 },
      rectRadius: 0.12,
      shadow: { type: "outer", blur: 10, offset: 3, angle: 200, color: "94A3B8", opacity: 0.2 },
    });
    
    s.addShape("rect", { x: x + 0.1, y: y = 1.62, w: cw - 0.2, h: 0.04, fill: { color: ch.c } });
    
    s.addText(ch.n, {
      x: x + 0.15, y: 1.85, w: 0.8, h: 0.6,
      fontFace: FONT, fontSize: 26, bold: true, color: ch.c,
    });
    s.addText(ch.t, {
      x: x + 0.15, y: 2.45, w: cw - 0.3, h: 0.4,
      fontFace: FONT, fontSize: 14, bold: true, color: C.primary,
    });
    s.addShape("rect", { x: x + 0.15, y: 2.95, w: cw - 0.3, h: 0.012, fill: { color: ch.c, transparency: 70 } });
    
    s.addText(ch.items.map(i => "▸  " + i).join("\n\n"), {
      x: x + 0.15, y: 3.15, w: cw - 0.3, h: 3.4,
      fontFace: FONT, fontSize: 9.5, color: C.body, lineSpacingMultiple: 1.2, valign: "top",
    });
  });

  s.addNotes(
    "Brahim: To guide you through our presentation, we have structured our defense into five key chapters. " +
    "I will begin with the Introduction and the Pre-Study, outlining the cybersecurity landscape, our problematic, " +
    "and the Agile Scrum methodology. Next, we will present our Conceptual Study, including system actors, " +
    "requirements, use cases, and architecture. We will then dive into the Realization phase, detailing " +
    "our 9 threat feed scrapers, enrichment engine, and streaming pipeline. Finally, we will conclude with a retrospective " +
    "and future perspectives."
  );
})();


// ════════════════════════════════════════════════════════════════
//  SLIDE 3 — GENERAL INTRODUCTION
// ════════════════════════════════════════════════════════════════
(() => {
  const s = prs.addSlide({ bkgd: C.bg });
  s.transition = { type: "fade", speed: 1.5 };
  header(s, "CHAPTER 1 — INTRODUCTION", "General Introduction");

  // Left: Quote card
  s.addShape("roundRect", {
    x: 0.75, y: 1.55, w: 5.4, h: 5.35,
    fill: { color: C.bgCard },
    line: { color: C.blue, width: 0.8 },
    rectRadius: 0.15,
    shadow: { type: "outer", blur: 14, offset: 3, angle: 200, color: "94A3B8", opacity: 0.22 },
  });
  s.addShape("rect", { x: 0.9, y: 1.57, w: 5.1, h: 0.04, fill: { color: C.blue } });
  
  s.addText([
    { text: "THE STRATEGIC SHIFT TO\nPROACTIVE DEFENSE\n\n", options: { fontSize: 15, bold: true, color: C.primary, lineSpacingMultiple: 1.2 } },
    { text: "\"If you know the enemy and know yourself, you need not fear the result of a hundred battles.\"\n\n", options: { fontSize: 12, italic: true, color: C.blue, lineSpacingMultiple: 1.3 } },
    { text: "— Sun Tzu, The Art of War\n\n", options: { fontSize: 9, color: C.muted } },
    { text: "Defenders must pivot from reactive, perimeter-based alerts (Firewalls & antivirus) to proactive external visibility. By collecting, normalizing, and spatializing threat feeds, we anticipate campaigns before they penetrate our perimeter.", options: { fontSize: 10.5, color: C.body, lineSpacingMultiple: 1.4 } },
  ], { x: 1.0, y: 1.8, w: 4.9, h: 4.8, valign: "top" });

  // Right: Two insight cards
  card(s, 6.5, 1.55, 6.1, 2.55, "Expanded Attack Surface", [
    "Hyper-connectivity, cloud infrastructure, and distributed microservices have multiplied threat exposure points, making manual tracking impossible.",
    "", "▸ 4.7B internet users  ·  IoT devices exceed 15B globally",
  ], { accent: C.sky });

  card(s, 6.5, 4.35, 6.1, 2.55, "Evolved Adversaries", [
    "Attackers are no longer lone hackers but structured cartels, nation-states, and automated botnets operating rapid campaigns at scale.",
    "", "▸ Average cost of a data breach: $4.45M (IBM 2023)",
  ], { accent: C.rose });

  s.addNotes(
    "Brahim: Let us start with the introduction. Today, corporate networks and cloud platforms are faced " +
    "with an expanded attack surface. Highly coordinated threat groups launch disruptive operations globally. " +
    "As Sun Tzu wrote in The Art of War: 'If you know the enemy and know yourself, you need not fear the " +
    "result of a hundred battles.' In cybersecurity, this means shifting from a reactive posture to a " +
    "proactive threat intelligence model."
  );
})();


// ════════════════════════════════════════════════════════════════
//  SLIDE 4 — PROJECT CONTEXT
// ════════════════════════════════════════════════════════════════
(() => {
  const s = prs.addSlide({ bkgd: C.bg });
  s.transition = { type: "fade", speed: 1.5 };
  header(s, "CHAPTER 1 — PRE-STUDY", "Project Context & Host Organization");

  card(s, 0.75, 1.55, 5.4, 2.55, "Host: Predictra Cybersecurity", [
    "An AI-driven Cyber Threat Intelligence (CTI) firm that focuses on democratizing raw threat datasets into immediate, visually actionable insights for enterprise SOCs.",
  ], { accent: C.blue });

  card(s, 0.75, 4.35, 5.4, 2.55, "The Dwell Time Target", [
    "The global average dwell time for compromise detection exceeds 200 days.",
    "", "▸ Our mission: Shrink this window from months to real-time seconds with spatialized visualization.",
  ], { accent: C.amber });

  // Org chart
  s.addShape("roundRect", {
    x: 6.5, y: 1.55, w: 6.1, h: 5.35,
    fill: { color: C.bgCard },
    line: { color: C.border, width: 0.6 },
    rectRadius: 0.15,
    shadow: { type: "outer", blur: 12, offset: 3, angle: 200, color: "94A3B8", opacity: 0.2 },
  });
  s.addText("CORPORATE STRUCTURE", {
    x: 6.7, y: 1.7, w: 5.7, h: 0.3,
    fontFace: FONT, fontSize: 8, bold: true, color: C.blue, letterSpacing: 3,
  });
  img(s, path.join(ASSETS, "slide_4_shape_4.png"), { x: 6.7, y: 2.1, w: 5.7, h: 4.55 });

  s.addNotes(
    "Brahim: Our host organization, Predictra Cybersecurity, is an AI-driven Cyber Threat Intelligence " +
    "firm. Their goal is to democratize threat intelligence, transforming raw feeds into actionable visual " +
    "insights. A critical industry metric is the compromise dwell time, which globally averages over 200 days. " +
    "Our Threat Map aims to shrink this window from months to seconds by providing immediate, real-time visibility."
  );
})();


// ════════════════════════════════════════════════════════════════
//  SLIDE 5 — THE PROBLEM
// ════════════════════════════════════════════════════════════════
(() => {
  const s = prs.addSlide({ bkgd: C.bg });
  s.transition = { type: "fade", speed: 1.5 };
  header(s, "CHAPTER 1 — PRE-STUDY", "The Critical Problematic");

  const problems = [
    { t: "Spreadsheet Overload", b: ["SOC analysts are overwhelmed by raw, static text logs.", "", "Staring at thousands of text rows causes fatigue and delays detection of critical anomalies."], c: C.rose },
    { t: "Lack of Spatial Context", b: ["Traditional grids omit geography.", "", "Security teams cannot visualize where attacks originate, which sectors are targeted, or global campaign vectors."], c: C.amber },
    { t: "Data Heterogeneity", b: ["Threat feeds are scattered across separate APIs, WebSocket channels, and raw CSV files.", "", "Formats, schemas, and protocols are incompatible, blocking immediate analysis."], c: C.violet },
  ];

  const cw = 3.75, gap = 0.25;
  problems.forEach((p, i) => {
    const x = 0.75 + i * (cw + gap);
    s.addShape("roundRect", {
      x, y: 1.55, w: cw, h: 5.35,
      fill: { color: C.bgCard },
      line: { color: C.border, width: 0.6 },
      rectRadius: 0.12,
      shadow: { type: "outer", blur: 12, offset: 3, angle: 200, color: "94A3B8", opacity: 0.2 },
    });
    s.addShape("rect", { x: x + 0.1, y: 1.57, w: cw - 0.2, h: 0.04, fill: { color: p.c } });
    badge(s, x + 0.2, 1.85, i + 1, p.c);
    s.addText(p.t, {
      x: x + 0.72, y: 1.85, w: cw - 0.95, h: 0.45,
      fontFace: FONT, fontSize: 15, bold: true, color: C.primary, valign: "middle",
    });
    s.addShape("rect", { x: x + 0.2, y: 2.5, w: cw - 0.4, h: 0.012, fill: { color: p.c, transparency: 65 } });
    s.addText(p.b.join("\n"), {
      x: x + 0.2, y: 2.75, w: cw - 0.4, h: 3.8,
      fontFace: FONT, fontSize: 11, color: C.body, lineSpacingMultiple: 1.4, valign: "top",
    });
  });

  s.addNotes(
    "Brahim: The core problem we address is threefold. First, spreadsheet overload — SOC analysts suffer " +
    "from visual fatigue reading thousands of static logs. Second, lack of spatial context — traditional " +
    "dashboards fail to show attack origins geographically. Third, data heterogeneity — threat feeds are " +
    "scattered across multiple vendors in incompatible formats."
  );
})();


// ════════════════════════════════════════════════════════════════
//  SLIDE 6 — PROPOSED SOLUTION
// ════════════════════════════════════════════════════════════════
(() => {
  const s = prs.addSlide({ bkgd: C.bg });
  s.transition = { type: "fade", speed: 1.5 };
  header(s, "CHAPTER 1 — PRE-STUDY", "The Proposed Solution: 4-Layer Architecture");

  const layers = [
    { n: "1", t: "Ingestion Layer", b: "9 asynchronous, non-blocking scrapers harvest threat data from Checkpoint SSE, Bitdefender WebSocket, FortiGuard REST, URLhaus, AlienVault OTX, Kaspersky, RansomWatch, C2 Tracker, and MISP Galaxy.", c: C.blue },
    { n: "2", t: "Enrichment Layer", b: "5-layer classification engine: keyword matching, RDAP organization lookup, port-based inference, MISP Galaxy sectors, and feed-source defaults — tagging targets into 9 critical industries.", c: C.indigo },
    { n: "3", t: "Streaming Layer", b: "Server-Sent Events (SSE) broadcasting queue with 300ms batch flush and 500-event staging cap. Bulk MongoDB inserts every 25 documents.", c: C.violet },
    { n: "4", t: "Visualization Layer", b: "Interactive 3D WebGL Earth at 60fps with curved attack arcs, D3 force graph for STIX relationships, and MITRE ATT&CK kill chain grid.", c: C.emerald },
  ];

  const cw = 2.85, gap = 0.2;
  layers.forEach((l, i) => {
    const x = 0.65 + i * (cw + gap);
    s.addShape("roundRect", {
      x, y: 1.55, w: cw, h: 5.35,
      fill: { color: C.bgCard },
      line: { color: C.border, width: 0.6 },
      rectRadius: 0.12,
      shadow: { type: "outer", blur: 12, offset: 3, angle: 200, color: "94A3B8", opacity: 0.2 },
    });
    s.addShape("rect", { x: x + 0.1, y: 1.57, w: cw - 0.2, h: 0.04, fill: { color: l.c } });
    
    s.addText(l.n, { x: x + 0.15, y: 1.85, w: 0.6, h: 0.7, fontFace: FONT, fontSize: 32, bold: true, color: l.c });
    s.addText(l.t, { x: x + 0.15, y: 2.6, w: cw - 0.3, h: 0.5, fontFace: FONT, fontSize: 14, bold: true, color: C.primary });
    s.addShape("rect", { x: x + 0.15, y: 3.15, w: cw - 0.3, h: 0.012, fill: { color: l.c, transparency: 60 } });
    s.addText(l.b, { x: x + 0.15, y: 3.35, w: cw - 0.3, h: 3.3, fontFace: FONT, fontSize: 10.5, color: C.body, lineSpacingMultiple: 1.4, valign: "top" });
    
    if (i < layers.length - 1) {
      s.addText("▶", { x: x + cw + 0.01, y: 4.0, w: 0.2, h: 0.4, fontFace: FONT, fontSize: 12, color: l.c, align: "center" });
    }
  });

  s.addNotes(
    "Brahim: To solve this, we propose the Predictra Threat Map built on four layers. The Ingestion Layer harvests " +
    "data from 9 different threat feeds using multiple protocols — SSE for Checkpoint, WebSocket for Bitdefender, " +
    "REST polling for FortiGuard and others. The Enrichment Layer uses a 5-layer classification engine including " +
    "keyword matching, RDAP lookups, and port-based inference. The Streaming Layer batches events every 300ms via SSE. " +
    "The Visualization Layer renders the data on a 3D globe with STIX and MITRE mapping."
  );
})();


// ════════════════════════════════════════════════════════════════
//  SLIDE 7 — AGILE SCRUM
// ════════════════════════════════════════════════════════════════
(() => {
  const s = prs.addSlide({ bkgd: C.bg });
  s.transition = { type: "fade", speed: 1.5 };
  header(s, "CHAPTER 1 — PRE-STUDY", "Agile Scrum Methodology");

  card(s, 0.75, 1.55, 5.7, 5.35, "4 Sprints & Agile Rituals", [
    "We ran a 12-week development cycle with clear team velocity metrics (25-30 SP/sprint).",
    "", "Twice-Weekly Rituals:",
    "▸ Thursdays: Code integrations, feed scraper testing, performance checks.",
    "▸ Sundays: Architectural consolidations, LaTeX report reviews.",
    "", "Result: 48+ collaborative sessions delivering a fully testable, production-ready release increment at each review.",
  ], { accent: C.blue });

  const sprints = [
    { t: "Sprint 1: Ingestion Infrastructure", d: "9 feed scrapers (Checkpoint SSE, Bitdefender WS, FortiGuard REST, URLhaus, AlienVault, Kaspersky, RansomWatch, C2 Tracker, MISP Galaxy), MongoDB schema, BSON compression.", c: C.blue },
    { t: "Sprint 2: Streaming & Visualization", d: "SSE /api/feed endpoint, 300ms batch flush, Zustand state store, 3D Globe with attack arcs.", c: C.indigo },
    { t: "Sprint 3: STIX Intelligence Workspace", d: "Client-side STIX 2.1 parser, D3 relationship force graph, MITRE ATT&CK matrix.", c: C.violet },
    { t: "Sprint 4: Analytics & Guardrails", d: "Paginated log browser, Target My IP, Excel export, Adaptive FPS sampling, 500MB quota guard.", c: C.emerald },
  ];

  sprints.forEach((sp, i) => {
    const y = 1.55 + i * 1.35;
    s.addShape("roundRect", {
      x: 6.8, y, w: 5.8, h: 1.15,
      fill: { color: C.bgCard },
      line: { color: C.border, width: 0.5 },
      rectRadius: 0.1,
      shadow: { type: "outer", blur: 10, offset: 2, angle: 200, color: "94A3B8", opacity: 0.18 },
    });
    s.addShape("rect", { x: 6.82, y: y + 0.12, w: 0.05, h: 0.9, fill: { color: sp.c } });
    s.addText(sp.t, { x: 7.05, y: y + 0.08, w: 5.3, h: 0.35, fontFace: FONT, fontSize: 12, bold: true, color: C.primary });
    s.addText(sp.d, { x: 7.05, y: y + 0.45, w: 5.3, h: 0.6, fontFace: FONT, fontSize: 9, color: C.body, lineSpacingMultiple: 1.2 });
  });

  s.addNotes(
    "Brahim: We adopted the Agile Scrum methodology over 4 sprints and 12 weeks. Sprint 1 was the heaviest — " +
    "building all 9 feed scrapers: Checkpoint via Server-Sent Events, Bitdefender via socket.io WebSocket, " +
    "FortiGuard via REST polling every 4 seconds, URLhaus via REST polling every 90 seconds, AlienVault OTX, " +
    "Kaspersky, RansomWatch for ransomware leak tracking, C2 Tracker for command-and-control servers, and " +
    "MISP Galaxy for APT actor intelligence. Sprint 2 built the streaming pipeline and globe. Sprint 3 added " +
    "STIX parsing. Sprint 4 added analytics and performance guardrails."
  );
})();


// ════════════════════════════════════════════════════════════════
//  SLIDE 8 — GLOBAL USE CASE
// ════════════════════════════════════════════════════════════════
(() => {
  const s = prs.addSlide({ bkgd: C.bg });
  s.transition = { type: "fade", speed: 1.5 };
  header(s, "CHAPTER 2 — CONCEPTUAL STUDY", "System Boundaries & Global Use Case");

  card(s, 0.75, 1.55, 5.0, 5.35, "Actors & Use Case Boundaries", [
    "This model structures system actors and boundaries:",
    "", "▸ System Actor: External Threat Feeds",
    "9 parallel scrapers continuously push Indicators of Compromise (IOCs) into the ingestion pipeline.",
    "", "▸ Human Actor: Security Analyst",
    "Interacts with the Web UI to monitor live feeds, search history, upload STIX bundles, and export reports.",
  ], { accent: C.blue });

  s.addShape("roundRect", {
    x: 6.1, y: 1.55, w: 6.5, h: 5.35,
    fill: { color: C.bgCard },
    line: { color: C.border, width: 0.6 },
    rectRadius: 0.15,
    shadow: { type: "outer", blur: 12, offset: 3, angle: 200, color: "94A3B8", opacity: 0.2 },
  });
  s.addText("GLOBAL USE CASE DIAGRAM", { x: 6.3, y: 1.7, w: 6.1, h: 0.3, fontFace: FONT, fontSize: 8, bold: true, color: C.blue, letterSpacing: 3 });
  img(s, path.join(REPORT_ASSETS, "global_usecase.png"), { x: 7.5, y: 2.1, w: 3.8, h: 4.55 });

  s.addNotes(
    "Brahim: This is our Global Use Case diagram. The primary system actor is the set of 9 External Threat Feed " +
    "scrapers that automatically trigger backend ingestion. The human actor is the Security Analyst who monitors " +
    "the dashboard, filters threat logs, uploads STIX bundles, and exports reports."
  );
})();


// ════════════════════════════════════════════════════════════════
//  SLIDE 9 — SYSTEM REQUIREMENTS
// ════════════════════════════════════════════════════════════════
(() => {
  const s = prs.addSlide({ bkgd: C.bg });
  s.transition = { type: "fade", speed: 1.5 };
  header(s, "CHAPTER 2 — CONCEPTUAL STUDY", "System Requirements");

  card(s, 0.75, 1.55, 5.7, 5.35, "Functional Requirements (RF-1 to RF-9)", [
    "▸ RF-1: Ingest from 9+ feeds asynchronously (SSE, WebSocket, REST).",
    "▸ RF-2: Resolve IP geolocation via geoip-lite dictionary.",
    "▸ RF-3: Classify victim sectors using 5-layer enrichment engine.",
    "▸ RF-4: Stream events via SSE with 300ms batch flush.",
    "▸ RF-5: Render interactive 3D Globe with attack arcs.",
    "▸ RF-6: Client-side STIX 2.1 parsing & MITRE ATT&CK map.",
    "▸ RF-7: Searchable log browser with pagination & filters.",
    "▸ RF-8: \"Target My IP\" geolocation feature.",
    "▸ RF-9: Excel export for threat data.",
  ], { accent: C.blue });

  card(s, 6.85, 1.55, 5.75, 5.35, "Non-Functional Requirements (RNF-1 to RNF-5)", [
    "▸ RNF-1 (Fluidity): Maintain 60fps rendering.",
    "▸ RNF-2 (Memory): 10,000-event circular RingBuffer.",
    "▸ RNF-3 (Database): MongoDB 30-day TTL auto-expire.",
    "▸ RNF-4 (Limit Guard): Switch to in-memory streaming if MongoDB exceeds 500MB.",
    "▸ RNF-5 (Design): Premium glassmorphism interface to prevent analyst strain.",
  ], { accent: C.violet });

  s.addNotes(
    "Brahim: We defined 9 functional requirements. These include multi-feed ingestion using SSE, WebSocket, and REST " +
    "protocols, IP geolocation via geoip-lite dictionary, sector classification using our 5-layer enrichment engine, " +
    "real-time SSE streaming with 300ms batch flush, 3D globe rendering, STIX parsing, MITRE mapping, log search, " +
    "Target My IP, and Excel export. Non-functional requirements cover 60fps fluidity, circular memory buffer, " +
    "30-day database TTL, a 500MB quota guard, and a premium dark glassmorphism layout."
  );
})();


// ════════════════════════════════════════════════════════════════
//  SLIDE 10 — GLOBAL CLASS DIAGRAM
// ════════════════════════════════════════════════════════════════
(() => {
  const s = prs.addSlide({ bkgd: C.bg });
  s.transition = { type: "fade", speed: 1.5 };
  header(s, "CHAPTER 2 — CONCEPTUAL STUDY", "Structural Modeling: Global Class Diagram");

  card(s, 0.75, 1.55, 5.0, 5.35, "System Object Architecture", [
    "The static structure has three tiers:",
    "", "1. Ingestion & Service Tier (Backend):",
    "ExpressServer orchestrates 9 ScraperService subclasses. Each scraper maps vendor-specific formats to a unified ThreatEvent BSON schema. EnrichmentService resolves sectors.",
    "", "2. State Store Tier (Frontend):",
    "Zustand useStreamStore with circular RingBuffer and perfTelemetry loop.",
    "", "3. React Views Layer:",
    "Dashboard, STIXWorkspace, AnalyticsPage subscribe to store slices.",
  ], { accent: C.violet });

  s.addShape("roundRect", {
    x: 6.1, y: 1.55, w: 6.5, h: 5.35,
    fill: { color: C.bgCard },
    line: { color: C.border, width: 0.6 },
    rectRadius: 0.15,
    shadow: { type: "outer", blur: 12, offset: 3, angle: 200, color: "94A3B8", opacity: 0.2 },
  });
  s.addText("GLOBAL CLASS DIAGRAM", { x: 6.3, y: 1.7, w: 6.1, h: 0.3, fontFace: FONT, fontSize: 8, bold: true, color: C.violet, letterSpacing: 3 });
  img(s, path.join(REPORT_ASSETS, "global_class_diagram.png"), { x: 6.3, y: 2.1, w: 6.1, h: 4.55 });

  s.addNotes(
    "Chiheb: This is our Global Class Diagram. In the Backend tier, the Express Server orchestrates 9 " +
    "Scraper Service subclasses — each one handling a different vendor protocol (SSE, WebSocket, REST). " +
    "They all map to a unified ThreatEvent BSON schema. The Enrichment Service resolves sectors using " +
    "keyword matching, RDAP lookups, port inference, and MISP Galaxy data. The frontend uses Zustand for " +
    "reactive state management with a circular RingBuffer."
  );
})();


// ════════════════════════════════════════════════════════════════
//  SLIDE 11 — TECHNOLOGY STACK
// ════════════════════════════════════════════════════════════════
(() => {
  const s = prs.addSlide({ bkgd: C.bg });
  s.transition = { type: "fade", speed: 1.5 };
  header(s, "CHAPTER 2 — CONCEPTUAL STUDY", "Technology Stack Comparative Analysis");

  const rows = [
    { layer: "Backend Runtime", sel: "Node.js / Express 5", alt: "Java Spring Boot", reason: "Async event loop; native SSE/WS concurrency", c: C.blue },
    { layer: "State Management", sel: "Zustand 5", alt: "Redux Toolkit", reason: "Reactive store outside React render loop", c: C.indigo },
    { layer: "3D Graphics", sel: "Three.js / R3F", alt: "Vanilla Canvas", reason: "GPU acceleration, custom GLSL shaders", c: C.violet },
    { layer: "Database", sel: "MongoDB Atlas", alt: "PostgreSQL", reason: "Flexible schemaless BSON for raw feeds", c: C.emerald },
    { layer: "Deployment", sel: "Vercel + Cloud VM", alt: "AWS EC2 + S3", reason: "CDN edge, zero-config CI/CD", c: C.amber },
  ];

  const cx = [0.75, 3.15, 5.8, 8.25];
  const cw = [2.2, 2.45, 2.25, 4.35];
  const hdrs = ["LAYER", "SELECTED STACK", "ALTERNATIVE", "ARCHITECTURAL RATIONALE"];

  hdrs.forEach((h, i) => {
    s.addShape("roundRect", {
      x: cx[i], y: 1.55, w: cw[i], h: 0.55,
      fill: { color: C.blue, transparency: 92 },
      line: { color: C.blue, width: 0.6 },
      rectRadius: 0.06,
    });
    s.addText(h, { x: cx[i], y: 1.55, w: cw[i], h: 0.55, fontFace: FONT, fontSize: 8, bold: true, color: C.blue, align: "center", valign: "middle", letterSpacing: 2 });
  });

  rows.forEach((row, i) => {
    const y = 2.25 + i * 0.98;
    const vals = [row.layer, row.sel, row.alt, row.reason];
    vals.forEach((val, j) => {
      s.addShape("roundRect", {
        x: cx[j], y, w: cw[j], h: 0.82,
        fill: { color: i % 2 === 0 ? C.bgCard : C.bgCardAlt },
        line: { color: C.border, width: 0.4 },
        rectRadius: 0.06,
      });
      s.addText(val, {
        x: cx[j] + 0.12, y, w: cw[j] - 0.24, h: 0.82,
        fontFace: FONT, fontSize: j === 0 ? 10 : 9.5,
        bold: j <= 1, color: j === 0 ? row.c : (j === 1 ? C.primary : C.body),
        valign: "middle",
      });
    });
    s.addShape("rect", { x: cx[0] + 0.03, y: y + 0.12, w: 0.045, h: 0.58, fill: { color: row.c } });
  });

  s.addNotes(
    "Chiheb: We selected Node.js and Express 5 for the backend because its non-blocking event loop natively supports " +
    "SSE and WebSocket concurrency — critical for our 9 simultaneous scraper connections. Zustand 5 for frontend state " +
    "gives us reactive updates outside the React render loop. Three.js for the globe, MongoDB Atlas for schemaless BSON, " +
    "and Vercel for zero-config deployment."
  );
})();


// ════════════════════════════════════════════════════════════════
//  SLIDE 12 — SYSTEM ARCHITECTURE
// ════════════════════════════════════════════════════════════════
(() => {
  const s = prs.addSlide({ bkgd: C.bg });
  s.transition = { type: "fade", speed: 1.5 };
  header(s, "CHAPTER 2 — CONCEPTUAL STUDY", "System Architecture");

  const tiers = [
    { t: "Frontend (Vercel CDN)", items: ["▸ React SPA served via global Edge networks.", "▸ Zustand state-store for real-time reactivity.", "▸ Vercel proxy routing to prevent CORS blocks."], c: C.blue },
    { t: "Backend (Cloud VM)", items: ["▸ Express REST APIs + SSE event broadcast.", "▸ PM2 Clustering across CPU cores.", "▸ 9 parallel ingestion scrapers."], c: C.indigo },
    { t: "Database (MongoDB)", items: ["▸ Cloud-hosted replicated BSON cluster.", "▸ Automated 30-day TTL storage pruning.", "▸ 500MB quota guard for in-memory fallback."], c: C.violet },
  ];

  tiers.forEach((tier, i) => {
    const x = 0.75 + i * 4.1;
    s.addShape("roundRect", {
      x, y: 1.55, w: 3.85, h: 5.35,
      fill: { color: C.bgCard },
      line: { color: C.border, width: 0.6 },
      rectRadius: 0.15,
      shadow: { type: "outer", blur: 12, offset: 3, angle: 200, color: "94A3B8", opacity: 0.2 },
    });
    s.addShape("rect", { x: x + 0.1, y: 1.57, w: 3.65, h: 0.04, fill: { color: tier.c } });
    s.addText(tier.t, { x: x + 0.2, y: 1.85, w: 3.45, h: 0.5, fontFace: FONT, fontSize: 15, bold: true, color: C.primary });
    s.addShape("rect", { x: x + 0.2, y: 2.45, w: 3.45, h: 0.012, fill: { color: tier.c, transparency: 60 } });
    s.addText(tier.items.join("\n\n"), { x: x + 0.2, y: 2.7, w: 3.45, h: 3.8, fontFace: FONT, fontSize: 11, color: C.body, lineSpacingMultiple: 1.4, valign: "top" });
    if (i < 2) s.addText("▶", { x: x + 3.85 + 0.03, y: 4.0, w: 0.25, h: 0.4, fontFace: FONT, fontSize: 14, color: tier.c, align: "center" });
  });

  s.addNotes(
    "Chiheb: Our system architecture has three tiers. The Frontend React SPA is served via Vercel CDN with " +
    "proxy routing to eliminate CORS issues. The Backend runs on a Cloud VM with PM2 clustering and 9 parallel " +
    "ingestion scrapers. The Database tier uses MongoDB Atlas with 30-day TTL pruning and a 500MB quota guard."
  );
})();


// ════════════════════════════════════════════════════════════════
//  SLIDE 13 — 9 THREAT FEED SCRAPERS (NEW — SCRAPER-FOCUSED)
// ════════════════════════════════════════════════════════════════
(() => {
  const s = prs.addSlide({ bkgd: C.bg });
  s.transition = { type: "fade", speed: 1.5 };
  header(s, "CHAPTER 3 — SPRINT 1", "Threat Feed Scrapers: 9 Parallel Sources");

  const feeds = [
    { name: "Checkpoint", protocol: "SSE", interval: "Real-time", desc: "Server-Sent Events stream from threatmap-api.checkpoint.com. Parses attack type, source/dest coords, country codes.", c: C.blue },
    { name: "Bitdefender", protocol: "WebSocket", interval: "Real-time", desc: "Socket.io client subscribes to 13 channels (botnet, portscan, telnet, SSH, RDP, VNC, MySQL, HTTP, IoT, spam).", c: C.indigo },
    { name: "FortiGuard", protocol: "REST", interval: "4s poll", desc: "Polls /api/threatmap/live/outbreak endpoint with outbreak_id tracking. Extracts time-sliced attack events with severity.", c: C.violet },
    { name: "URLhaus", protocol: "REST", interval: "90s poll", desc: "Fetches active malicious URLs from abuse.ch API. Resolves host IPs via geoip-lite for source coordinates.", c: C.rose },
    { name: "AlienVault", protocol: "REST", interval: "60s poll", desc: "Queries OTX API for latest IoC pulses. Maps pulse indicators to geographic attack events.", c: C.sky },
    { name: "Kaspersky", protocol: "REST", interval: "60s poll", desc: "Scrapes Kaspersky cybermap data feed. Extracts malware detections with country-level coordinates.", c: C.emerald },
    { name: "RansomWatch", protocol: "REST", interval: "5min poll", desc: "Monitors ransomware gang leak sites. Tracks victim organizations and maps to Finance/Business sector.", c: C.amber },
    { name: "C2 Tracker", protocol: "REST", interval: "5min poll", desc: "Tracks active Command & Control server IPs. Geolocates C2 infrastructure for IT sector mapping.", c: C.rose },
    { name: "MISP Galaxy", protocol: "REST", interval: "Boot + 6h", desc: "Loads APT actor profiles with target sectors, motivation, and attributed TTPs from MISP Galaxy clusters.", c: C.blue },
  ];

  // 3x3 grid
  feeds.forEach((f, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 0.65 + col * 4.1;
    const y = 1.5 + row * 2.0;
    const w = 3.9, h = 1.85;

    s.addShape("roundRect", {
      x, y, w, h,
      fill: { color: C.bgCard },
      line: { color: C.border, width: 0.5 },
      rectRadius: 0.1,
      shadow: { type: "outer", blur: 8, offset: 2, angle: 200, color: "94A3B8", opacity: 0.15 },
    });
    s.addShape("rect", { x: x + 0.08, y: y + 0.02, w: w - 0.16, h: 0.03, fill: { color: f.c } });
    
    // Name + protocol tag
    s.addText(f.name, { x: x + 0.15, y: y + 0.12, w: 1.8, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: C.primary });
    
    // Protocol tag
    tag(s, x + 2.0, y + 0.15, f.protocol, f.c);
    
    // Interval tag
    tag(s, x + 2.0 + (f.protocol.length * 0.065 + 0.35), y + 0.15, f.interval, C.muted);
    
    // Description
    s.addText(f.desc, { x: x + 0.15, y: y + 0.5, w: w - 0.3, h: 1.2, fontFace: FONT, fontSize: 8.5, color: C.body, lineSpacingMultiple: 1.3, valign: "top" });
  });

  s.addNotes(
    "Brahim: Our ingestion layer consists of 9 parallel scrapers, each using a different protocol. Checkpoint " +
    "connects via Server-Sent Events for real-time streaming. Bitdefender uses a socket.io WebSocket client " +
    "subscribing to 13 attack channels including botnet, SSH, RDP, VNC, MySQL, HTTP, IoT, and spam. FortiGuard " +
    "polls a REST endpoint every 4 seconds tracking active outbreak IDs. URLhaus polls abuse.ch every 90 seconds " +
    "for active malicious URLs. AlienVault queries OTX pulses. Kaspersky scrapes cybermap data. RansomWatch " +
    "monitors ransomware leak sites. C2 Tracker tracks command-and-control infrastructure. MISP Galaxy loads " +
    "APT actor profiles at boot and refreshes every 6 hours."
  );
})();


// ════════════════════════════════════════════════════════════════
//  SLIDE 14 — ENRICHMENT ENGINE (NEW — SCRAPER-FOCUSED)
// ════════════════════════════════════════════════════════════════
(() => {
  const s = prs.addSlide({ bkgd: C.bg });
  s.transition = { type: "fade", speed: 1.5 };
  header(s, "CHAPTER 3 — SPRINT 1", "5-Layer Sector Enrichment Engine");

  const layers = [
    { n: "1", t: "Keyword Matching (Victim Name)", d: "Regex word-boundary search on victim hostname against 9 sector keyword dictionaries (healthcare, finance, government, education, energy, technology, manufacturing, retail, telecom).", c: C.blue },
    { n: "2", t: "Keyword Matching (Combined Text)", d: "Broadens search to concatenated attack name + malware family + threat type. Falls back to this if victim-name match fails.", c: C.indigo },
    { n: "3", t: "Port-Based Inference", d: "Maps network ports to sectors: HTTP/HTTPS → Web Services, MySQL/PostgreSQL/MongoDB → Database, SSH/DNS → IT, SMB/RDP → Enterprise, SMTP/POP → Email.", c: C.violet },
    { n: "4", t: "MISP Galaxy Sector Tags", d: "Reads target_sectors from MISP Galaxy APT actor metadata. Maps tags like 'government', 'private sector', 'health', 'energy' to enriched sector labels.", c: C.rose },
    { n: "5", t: "Source-API Fallback", d: "Final fallback using the scraper source identifier: ransomwatch → Finance, c2tracker → IT Infrastructure, urlhaus → Web Services, others → General.", c: C.emerald },
  ];

  layers.forEach((l, i) => {
    const y = 1.5 + i * 1.15;
    
    s.addShape("roundRect", {
      x: 0.75, y, w: 11.83, h: 1.0,
      fill: { color: i % 2 === 0 ? C.bgCard : C.bgCardAlt },
      line: { color: C.border, width: 0.5 },
      rectRadius: 0.08,
      shadow: { type: "outer", blur: 8, offset: 2, angle: 200, color: "94A3B8", opacity: 0.15 },
    });
    
    // Left accent bar
    s.addShape("rect", { x: 0.77, y: y + 0.12, w: 0.05, h: 0.76, fill: { color: l.c } });
    
    // Layer number
    badge(s, 1.0, y + 0.28, l.n, l.c);
    
    // Title
    s.addText(l.t, { x: 1.6, y: y + 0.08, w: 3.5, h: 0.4, fontFace: FONT, fontSize: 12, bold: true, color: C.primary, valign: "middle" });
    
    // Priority tag
    tag(s, 1.6, y + 0.55, i === 0 ? "HIGHEST" : i === 4 ? "LOWEST" : "LAYER " + l.n, l.c);
    
    // Description
    s.addText(l.d, { x: 5.2, y: y + 0.08, w: 7.1, h: 0.85, fontFace: FONT, fontSize: 9.5, color: C.body, lineSpacingMultiple: 1.3, valign: "middle" });
  });

  // RDAP note at bottom
  s.addShape("roundRect", {
    x: 0.75, y: 7.0, w: 11.83, h: 0.4,
    fill: { color: C.blue, transparency: 94 },
    line: { color: C.blue, width: 0.4 },
    rectRadius: 0.06,
  });
  s.addText("+ RDAP Organization Lookup: Async IP owner query via rdap.org → ARIN/RIPE registries with 3-second timeout cache", {
    x: 1.0, y: 7.0, w: 11.33, h: 0.4,
    fontFace: FONT, fontSize: 9, color: C.blue, valign: "middle",
  });

  s.addNotes(
    "Brahim: Our enrichment engine uses a 5-layer priority cascade to classify every attack into one of 9 " +
    "industry sectors. Layer 1 performs regex keyword matching on the victim hostname — if it contains 'hospital', " +
    "'bank', 'university', etc., we get a high-confidence match. Layer 2 broadens the search to combined text. " +
    "Layer 3 uses port-based inference — MySQL port 3306 maps to Database Services, SSH port 22 to IT Infrastructure. " +
    "Layer 4 reads MISP Galaxy APT actor target sectors. Layer 5 is a source-API fallback. We also have an async " +
    "RDAP organization lookup with a 3-second timeout cache."
  );
})();


// ════════════════════════════════════════════════════════════════
//  SLIDE 15 — STREAMING & BATCHING (NEW — SCRAPER-FOCUSED)
// ════════════════════════════════════════════════════════════════
(() => {
  const s = prs.addSlide({ bkgd: C.bg });
  s.transition = { type: "fade", speed: 1.5 };
  header(s, "CHAPTER 3 — SPRINT 2", "SSE Streaming Pipeline & Batch Engine");

  card(s, 0.75, 1.55, 5.7, 5.35, "Batching Infrastructure", [
    "Instead of writing one SSE message per event (causing browser processing storms), we queue all incoming attacks and flush them as a single JSON array every 300ms.",
    "",
    "▸ BATCH_INTERVAL_MS = 300ms — flush interval",
    "▸ MAX_PENDING = 500 — hard cap with oldest-drop",
    "▸ BATCH_DB_INSERT = 25 — bulk MongoDB inserts",
    "",
    "This cuts SSE writes and frontend Zustand updates by ~50×, preventing rendering storms while maintaining real-time feel.",
    "",
    "Database quota guard: if MongoDB exceeds 500MB, the system stops DB writes and streams events in-memory only.",
  ], { accent: C.blue });

  card(s, 6.85, 1.55, 5.75, 2.5, "BSON Schema Compression", [
    "Compact field names shrink each threat document from 200 bytes to 80 bytes (60% reduction):",
    "",
    "▸ a_c (attack count) · a_n (attack name) · a_t (attack type)",
    "▸ s_ip / s_co / s_la / s_lo (source fields)",
    "▸ d_ip / d_co / d_la / d_lo (destination fields)",
    "▸ meta {} (scraper-specific metadata)",
  ], { accent: C.indigo });

  card(s, 6.85, 4.3, 5.75, 2.6, "Unified Event Schema", [
    "All 9 scrapers map vendor-specific formats to a single ThreatEvent model. Each scraper handles protocol-specific parsing (SSE JSON, WebSocket payloads, REST responses) and normalizes to unified coordinates + attack metadata.",
    "",
    "▸ Country code normalization (RF → RU)",
    "▸ Same-region jitter for overlapping coordinates",
    "▸ 30-day MongoDB TTL index auto-expiry",
  ], { accent: C.violet });

  s.addNotes(
    "Chiheb: Our streaming pipeline uses a 300ms batch flush instead of per-event SSE writes. This cuts " +
    "frontend Zustand updates by 50×. We use a 500-event staging queue with oldest-drop, and bulk MongoDB " +
    "inserts every 25 documents. The BSON schema uses compact field names — a_c for attack count, s_ip for " +
    "source IP — shrinking each document from 200 bytes to 80 bytes. All 9 scrapers normalize to a unified " +
    "ThreatEvent schema with country code normalization and coordinate jitter."
  );
})();


// ════════════════════════════════════════════════════════════════
//  SLIDE 16 — SPRINT 3 & 4
// ════════════════════════════════════════════════════════════════
(() => {
  const s = prs.addSlide({ bkgd: C.bg });
  s.transition = { type: "fade", speed: 1.5 };
  header(s, "CHAPTER 4 — SPRINTS 3 & 4", "STIX Intelligence, MITRE Mapping & Performance");

  const items = [
    { t: "STIX 2.1 Workspace", b: ["▸ Client-side JSON parser processes files in browser (zero server upload ensures analyst privacy).", "", "▸ Interactive D3 Force-Directed Graph visualizes object relationships using Verlet integration physics."], c: C.blue },
    { t: "MITRE ATT&CK Matrix", b: ["▸ Maps parsed STIX indicators to 12 ATT&CK kill chain phases.", "", "▸ Real-time aggregations highlight critical adversary tactics and techniques."], c: C.indigo },
    { t: "Performance Guardrails", b: ["▸ Circular RingBuffer manages memory in O(1) time with 10,000-event cap.", "", "▸ Adaptive Event Sampling: FPS < 55 → drop 50%; FPS < 30 → drop 75% for smoothness."], c: C.emerald },
  ];

  items.forEach((it, i) => {
    const x = 0.75 + i * 4.1;
    s.addShape("roundRect", {
      x, y: 1.55, w: 3.85, h: 5.35,
      fill: { color: C.bgCard },
      line: { color: C.border, width: 0.6 },
      rectRadius: 0.12,
      shadow: { type: "outer", blur: 12, offset: 3, angle: 200, color: "94A3B8", opacity: 0.2 },
    });
    s.addShape("rect", { x: x + 0.1, y: 1.57, w: 3.65, h: 0.04, fill: { color: it.c } });
    s.addText(it.t, { x: x + 0.2, y: 1.85, w: 3.45, h: 0.5, fontFace: FONT, fontSize: 14, bold: true, color: C.primary });
    s.addShape("rect", { x: x + 0.2, y: 2.45, w: 3.45, h: 0.012, fill: { color: it.c, transparency: 60 } });
    s.addText(it.b.join("\n"), { x: x + 0.2, y: 2.7, w: 3.45, h: 3.8, fontFace: FONT, fontSize: 10.5, color: C.body, lineSpacingMultiple: 1.4, valign: "top" });
  });

  s.addNotes(
    "Chiheb: Sprints 3 and 4 introduced STIX parsing, MITRE mapping, and performance guards. The STIX 2.1 " +
    "parser runs completely in the browser for privacy, mapping techniques to 12 MITRE phases. To maintain " +
    "60fps, we built a circular RingBuffer and Adaptive Event Sampling that drops up to 75% of visual events " +
    "under heavy CPU load."
  );
})();


// ════════════════════════════════════════════════════════════════
//  SLIDE 17 — INTERFACE OVERVIEW
// ════════════════════════════════════════════════════════════════
(() => {
  const s = prs.addSlide({ bkgd: C.bg });
  s.transition = { type: "fade", speed: 1.5 };
  header(s, "CHAPTER 4 — REALIZATION", "Application Interfaces Overview");

  const ifaces = [
    { t: "3D Live Threat Map", d: "Interactive WebGL Earth showing real-time attack arcs from all 9 scrapers.", im: path.join(SCREENSHOTS, "live_map.png"), c: C.blue },
    { t: "System Dashboard", d: "Tactical command center with volume sparklines, 2D flat map, and country statistics.", im: path.join(SCREENSHOTS, "dashboard.png"), c: C.indigo },
    { t: "STIX Workspace", d: "JSON bundle ingestion, relationship force graphs, and MITRE technique mapping.", im: path.join(SCREENSHOTS, "stix.png"), c: C.violet },
    { t: "Analytics Dashboard", d: "Aggregation analytics: sector metrics, threat actor trends, and country matrices.", im: path.join(SCREENSHOTS, "analytics.png"), c: C.rose },
  ];

  ifaces.forEach((iface, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.75 + col * 6.15;
    const y = 1.55 + row * 2.8;

    s.addShape("roundRect", {
      x, y, w: 5.9, h: 2.6,
      fill: { color: C.bgCard },
      line: { color: C.border, width: 0.6 },
      rectRadius: 0.1,
      shadow: { type: "outer", blur: 10, offset: 3, angle: 200, color: "94A3B8", opacity: 0.18 },
    });
    s.addShape("rect", { x: x + 0.08, y: y + 0.02, w: 5.74, h: 0.03, fill: { color: iface.c } });
    s.addText(iface.t, { x: x + 0.2, y: y + 0.18, w: 3.0, h: 0.4, fontFace: FONT, fontSize: 13, bold: true, color: iface.c });
    s.addText(iface.d, { x: x + 0.2, y: y + 0.6, w: 3.0, h: 1.7, fontFace: FONT, fontSize: 9.5, color: C.body, lineSpacingMultiple: 1.3, valign: "top" });
    img(s, iface.im, { x: x + 3.3, y: y + 0.15, w: 2.4, h: 2.3 });
  });

  s.addNotes(
    "Brahim: Here is an overview of our four main interfaces. The 3D Threat Map displays attack arcs from " +
    "all 9 scrapers on a globe. The System Dashboard provides real-time metrics and country statistics. " +
    "The STIX Workspace has the D3 force graph and MITRE grid. The Analytics Dashboard aggregates sector " +
    "distributions and threat actor trends."
  );
})();


// ════════════════════════════════════════════════════════════════
//  SLIDE 18 — TECHNICAL CHALLENGES
// ════════════════════════════════════════════════════════════════
(() => {
  const s = prs.addSlide({ bkgd: C.bg });
  s.transition = { type: "fade", speed: 1.5 };
  header(s, "CHAPTER 4 — REALIZATION", "Technical Challenges Resolved");

  const challenges = [
    { t: "Browser Rendering Storms", cause: "9 scrapers pushing >500 events/sec caused browser canvas bottleneck.", fix: "300ms batch flush queue, 150-arc cap, adaptive FPS sampling engine.", c: C.rose },
    { t: "Database Quota Limits", cause: "MongoDB Atlas free tier exhausted by continuous multi-feed ingestion.", fix: "BSON field compression (60%), 30-day TTL indexes, 500MB quota guard with in-memory fallback.", c: C.amber },
    { t: "CORS Deployment Blocks", cause: "Browser security prevents React on Vercel from reading Cloud VM API.", fix: "Vercel reverse-proxy rules in vercel.json routing /api/* through internal paths.", c: C.emerald },
  ];

  challenges.forEach((ch, i) => {
    const x = 0.75 + i * 4.1;
    s.addShape("roundRect", {
      x, y: 1.55, w: 3.85, h: 5.35,
      fill: { color: C.bgCard },
      line: { color: C.border, width: 0.6 },
      rectRadius: 0.12,
      shadow: { type: "outer", blur: 12, offset: 3, angle: 200, color: "94A3B8", opacity: 0.2 },
    });
    s.addShape("rect", { x: x + 0.1, y: 1.57, w: 3.65, h: 0.04, fill: { color: ch.c } });
    
    tag(s, x + 2.8, y = 1.8, "RESOLVED", C.emerald);
    s.addText(ch.t, { x: x + 0.2, y: 1.8, w: 2.5, h: 0.45, fontFace: FONT, fontSize: 15, bold: true, color: C.primary });
    
    s.addText("CAUSE", { x: x + 0.2, y: 2.5, w: 3.45, h: 0.25, fontFace: FONT, fontSize: 7, bold: true, color: ch.c, letterSpacing: 3 });
    s.addShape("rect", { x: x + 0.2, y: 2.75, w: 3.45, h: 0.01, fill: { color: ch.c, transparency: 65 } });
    s.addText(ch.cause, { x: x + 0.2, y: 2.85, w: 3.45, h: 1.3, fontFace: FONT, fontSize: 10.5, color: C.body, lineSpacingMultiple: 1.35 });
    
    s.addText("RESOLUTION", { x: x + 0.2, y: 4.2, w: 3.45, h: 0.25, fontFace: FONT, fontSize: 7, bold: true, color: C.emerald, letterSpacing: 3 });
    s.addShape("rect", { x: x + 0.2, y: 4.45, w: 3.45, h: 0.01, fill: { color: C.emerald, transparency: 65 } });
    s.addText(ch.fix, { x: x + 0.2, y: 4.55, w: 3.45, h: 2.0, fontFace: FONT, fontSize: 10.5, color: C.body, lineSpacingMultiple: 1.35 });
  });

  s.addNotes(
    "Brahim: We resolved three major challenges. First, rendering storms from 9 concurrent scrapers were fixed " +
    "with 300ms batching and adaptive FPS sampling. Second, MongoDB quota limits were addressed with BSON " +
    "compression reducing documents by 60%, plus TTL indexes and a 500MB write guard. Third, CORS blocks " +
    "were eliminated with Vercel reverse-proxy configuration."
  );
})();


// ════════════════════════════════════════════════════════════════
//  SLIDE 19 — FUTURE ROADMAP
// ════════════════════════════════════════════════════════════════
(() => {
  const s = prs.addSlide({ bkgd: C.bg });
  s.transition = { type: "fade", speed: 1.5 };
  header(s, "CHAPTER 5 — CONCLUSION & PERSPECTIVES", "Future Perspectives & Roadmap");

  const phases = [
    { p: "PHASE 1", t: "Kafka Distributed Ingestion", b: "Decouple scrapers from the server process. Each scraper publishes events to Apache Kafka topics. The Express runtime consumes from Kafka — preventing crashes when scraper volume spikes.", c: C.blue },
    { p: "PHASE 2", t: "Predictive ML Extensions", b: "Train LSTM/time-series models on historical threat databases to forecast attack spikes and sector-targeted waves. Overlay predictions as visual heatmaps.", c: C.violet },
    { p: "PHASE 3", t: "Sharded Database Clustering", b: "Partition MongoDB clusters geographically by country code. Regional queries route to corresponding shards, minimizing latency at scale.", c: C.emerald },
  ];

  phases.forEach((p, i) => {
    const x = 0.75 + i * 4.1;
    s.addShape("roundRect", {
      x, y: 1.55, w: 3.85, h: 5.35,
      fill: { color: C.bgCard },
      line: { color: C.border, width: 0.6 },
      rectRadius: 0.12,
      shadow: { type: "outer", blur: 12, offset: 3, angle: 200, color: "94A3B8", opacity: 0.2 },
    });
    s.addShape("rect", { x: x + 0.1, y: 1.57, w: 3.65, h: 0.04, fill: { color: p.c } });
    tag(s, x + 0.18, y = 1.8, p.p, p.c);
    s.addText(p.t, { x: x + 0.18, y: 2.2, w: 3.5, h: 0.5, fontFace: FONT, fontSize: 15, bold: true, color: C.primary });
    s.addShape("rect", { x: x + 0.18, y: 2.8, w: 3.5, h: 0.012, fill: { color: p.c, transparency: 60 } });
    s.addText(p.b, { x: x + 0.18, y: 3.0, w: 3.5, h: 3.5, fontFace: FONT, fontSize: 11, color: C.body, lineSpacingMultiple: 1.4, valign: "top" });
    if (i < 2) s.addText("▶", { x: x + 3.85 + 0.03, y: 4.0, w: 0.25, h: 0.4, fontFace: FONT, fontSize: 14, color: p.c, align: "center" });
  });

  s.addNotes(
    "Chiheb: Our roadmap has three phases. Phase 1: Kafka Distributed Ingestion to decouple our 9 scrapers " +
    "from the server process, preventing crashes during traffic spikes. Phase 2: ML models to forecast attack " +
    "patterns. Phase 3: Sharded MongoDB clustering by country code for geographic query optimization."
  );
})();


// ════════════════════════════════════════════════════════════════
//  SLIDE 20 — CONCLUSION
// ════════════════════════════════════════════════════════════════
(() => {
  const s = prs.addSlide({ bkgd: C.bg });
  s.transition = { type: "fade", speed: 1.5 };
  header(s, "CHAPTER 5 — CONCLUSION & PERSPECTIVES", "General Conclusion");

  card(s, 0.75, 1.55, 5.7, 4.5, "Technical & Operational Impact", [
    "▸ Multi-Feed Ingestion:",
    "9 parallel scrapers (SSE, WebSocket, REST) unified into a single BSON schema with 60% compression.",
    "", "▸ 5-Layer Enrichment:",
    "Keyword matching, RDAP lookups, port inference, MISP Galaxy sectors, and source-API fallback classify every attack.",
    "", "▸ SOC Analyst Efficiency:",
    "Reduces compromise dwell time from 200+ days to seconds by replacing spreadsheets with spatial visualization.",
  ], { accent: C.blue });

  card(s, 6.85, 1.55, 5.75, 4.5, "Academic & Professional Growth", [
    "▸ Agile Scrum Application:",
    "Twice-weekly rituals, code merges, story points, and demonstrable increments.",
    "", "▸ Systems Engineering:",
    "Rigorous architectural structures, state store abstractions, database optimization strategies.",
    "", "▸ Cybersecurity Focus:",
    "Deep study of IOC types, STIX 2.1 schemas, and MITRE ATT&CK kill chain matrices.",
  ], { accent: C.violet });

  // Thank You Banner
  s.addShape("roundRect", {
    x: 0.75, y: 6.3, w: 11.83, h: 0.7,
    fill: { color: C.blue },
    rectRadius: 0.1,
    shadow: { type: "outer", blur: 14, offset: 3, angle: 200, color: "2563EB", opacity: 0.3 },
  });
  s.addText("Thank You for Your Attention  —  Questions Welcome", {
    x: 0.75, y: 6.3, w: 11.83, h: 0.7,
    fontFace: FONT, fontSize: 16, bold: true,
    color: C.white, align: "center", valign: "middle",
  });

  s.addShape("rect", { x: 0, y: 7.44, w: "100%", h: 0.06, fill: { color: C.blue } });

  s.addNotes(
    "Chiheb: In conclusion, the Predictra Threat Map successfully bridges the visibility gap in cyber defense. " +
    "We built 9 parallel scrapers using SSE, WebSocket, and REST protocols, unified them into a compressed BSON " +
    "schema, and enriched every event with a 5-layer sector classification engine. The platform reduces dwell " +
    "time from months to seconds. Thank you for your time, and we welcome any questions."
  );
})();


// ═══════════════════════════════════════════════════════════════════
const outPath = path.join(__dirname, "Predictra-Threat-Map-Enhanced.pptx");
prs.writeFile({ fileName: outPath })
  .then(() => console.log("✅ Premium WHITE presentation saved:", outPath))
  .catch((err) => console.error("❌ Error:", err));
