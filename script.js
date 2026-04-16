/* ================================================================
   PRAYAS JEE 2.0 STUDY TRACKER — script.js
   Firebase v9+ Modular SDK | Firestore | Chart.js
   ================================================================

   ⚙️  SETUP INSTRUCTIONS:
   1. Go to https://console.firebase.google.com
   2. Create a project → Add a Web App → Copy your config below
   3. Enable Firestore Database (Start in Test Mode for now)
   4. Replace the placeholder values in FIREBASE_CONFIG

   📱 CROSS-DEVICE SYNC:
   For the same data on your Tab and Phone, set USER_ID to a
   fixed string (e.g., "my_jee_2026") instead of the auto-generated one.
   Both devices will then read/write the same Firestore document.
   ================================================================ */

import { initializeApp }        from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc, setDoc, getDoc, getDocs,
  collection
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ================================================================
   🔴 REPLACE THIS WITH YOUR FIREBASE CONFIG
   ================================================================ */
const FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

/* ================================================================
   👤 USER ID — change to a fixed string for cross-device sync
      e.g. const USER_ID = "prayas_jee_user_2026";
   ================================================================ */
let USER_ID = localStorage.getItem("pjUserId");
if (!USER_ID) {
  USER_ID = "pj_" + Math.random().toString(36).slice(2, 11);
  localStorage.setItem("pjUserId", USER_ID);
}

/* ================================================================
   FIREBASE INITIALISATION
   ================================================================ */
let db = null;
let firebaseOk = false;

try {
  if (!FIREBASE_CONFIG.apiKey.startsWith("YOUR")) {
    const app = initializeApp(FIREBASE_CONFIG);
    db = getFirestore(app);
    firebaseOk = true;
    const notice = document.getElementById("fbNotice");
    if (notice) notice.remove();
  }
} catch (err) {
  console.warn("Firebase init failed:", err);
}

/* ================================================================
   CONSTANTS
   ================================================================ */
// Start date: 17 April 2026 (midnight, local time)
const START_DATE      = new Date(2026, 3, 17, 0, 0, 0, 0); // Month is 0-indexed
const JEE_EXAM_DATE   = new Date(2027, 0, 19, 0, 0, 0, 0); // ~JEE Main 2027

/* ================================================================
   PRAYAS JEE 2.0 LECTURE SCHEDULE
   Each array maps Day-N → lecture content (cycles if longer)
   ================================================================ */
const PHY = [
  { full: "Basic Mathematics & Vector Algebra",          short: "Vectors & Maths" },
  { full: "Kinematics in 1D — Motion Equations",         short: "1D Kinematics" },
  { full: "Kinematics in 2D & Projectile Motion",        short: "Projectile Motion" },
  { full: "Newton's Laws of Motion",                     short: "Newton's Laws" },
  { full: "Friction — Static, Kinetic & Rolling",        short: "Friction" },
  { full: "Work, Energy & Power",                        short: "Work & Energy" },
  { full: "Centre of Mass & Linear Momentum",            short: "COM & Momentum" },
  { full: "Rotational Motion — Kinematics & Torque",     short: "Rotational Basics" },
  { full: "Rotational Motion — Moment of Inertia",       short: "MOI & Theorems" },
  { full: "Rolling Motion & Angular Momentum",           short: "Rolling & AM" },
  { full: "Gravitation — Newton's Law & Field",          short: "Gravitation 1" },
  { full: "Gravitation — Satellites & Escape Velocity",  short: "Satellites & KE" },
  { full: "Mechanical Properties of Solids",             short: "Elasticity" },
  { full: "Fluid Mechanics — Pressure & Pascal's Law",   short: "Fluid Pressure" },
  { full: "Fluid Mechanics — Bernoulli & Viscosity",     short: "Bernoulli's Theorem" },
  { full: "Surface Tension & Capillarity",               short: "Surface Tension" },
  { full: "Thermal Expansion — Solids & Liquids",        short: "Thermal Expansion" },
  { full: "Calorimetry & Modes of Heat Transfer",        short: "Calorimetry" },
  { full: "Thermodynamics — First Law",                  short: "First Law of Thermo" },
  { full: "Thermodynamics — Second Law & Heat Engines",  short: "Second Law of Thermo" },
  { full: "Kinetic Theory of Gases",                     short: "KTG & Gas Laws" },
  { full: "Simple Harmonic Motion — Basics",             short: "SHM Basics" },
  { full: "SHM — Energy, Damped & Forced Oscillations",  short: "SHM Advanced" },
  { full: "Waves — Transverse & Longitudinal",           short: "Wave Motion" },
  { full: "Sound Waves & Doppler Effect",                short: "Sound & Doppler" },
  { full: "Electrostatics — Coulomb's Law & E-Field",    short: "Electric Field" },
  { full: "Electrostatics — Potential & Gauss's Law",    short: "Gauss's Law" },
  { full: "Capacitors, Capacitance & Dielectrics",       short: "Capacitors" },
  { full: "Current Electricity — Ohm's Law & Drift",     short: "Ohm's Law" },
  { full: "Current Electricity — Kirchhoff's Laws",      short: "Kirchhoff's Laws" },
  { full: "Wheatstone Bridge & Potentiometer",           short: "Wheatstone Bridge" },
  { full: "Moving Charges — Biot-Savart Law",            short: "Biot-Savart Law" },
  { full: "Moving Charges — Ampere's Law & Force",       short: "Ampere's Law" },
  { full: "Magnetism & Matter — Dia, Para, Ferro",       short: "Magnetic Materials" },
  { full: "EMI — Faraday's & Lenz's Laws",               short: "Faraday & Lenz" },
  { full: "Inductance — Self & Mutual",                  short: "Inductance" },
  { full: "AC Circuits — LCR & Resonance",               short: "AC Circuits" },
  { full: "Electromagnetic Waves",                       short: "EM Waves" },
  { full: "Ray Optics — Reflection & Refraction",        short: "Ray Optics 1" },
  { full: "Ray Optics — Lenses, Prism & Instruments",    short: "Ray Optics 2" },
  { full: "Wave Optics — Huygens & Interference",        short: "Wave Optics 1" },
  { full: "Wave Optics — Diffraction & Polarisation",    short: "Wave Optics 2" },
  { full: "Dual Nature of Radiation & Matter",           short: "Photoelectric Effect" },
  { full: "Atomic Physics — Bohr Model & Spectra",       short: "Bohr's Model" },
  { full: "Nuclei — Radioactivity & Nuclear Reactions",  short: "Nuclear Physics" },
  { full: "Semiconductors — Diodes & Transistors",       short: "Semiconductors" },
  { full: "Logic Gates & Communication Systems",         short: "Logic Gates" },
  { full: "Revision — Mechanics (Units 1–10)",           short: "Revision: Mechanics" },
];

const MTH = [
  { full: "Sets, Relations & Functions",                 short: "Sets & Relations" },
  { full: "Inverse Trigonometric Functions",             short: "Inverse Trig" },
  { full: "Matrices — Operations & Types",               short: "Matrices" },
  { full: "Determinants & Applications",                 short: "Determinants" },
  { full: "Continuity & Differentiability",              short: "Continuity" },
  { full: "Differentiation — Rules & Methods",           short: "Differentiation" },
  { full: "Applications of Derivatives — Tangents",      short: "Tangents & Normals" },
  { full: "Applications of Derivatives — Maxima & Min.", short: "Maxima & Minima" },
  { full: "Indefinite Integration",                      short: "Indefinite Integ." },
  { full: "Definite Integration",                        short: "Definite Integ." },
  { full: "Integration by Parts & Special Integrals",    short: "Integration by Parts" },
  { full: "Area Under Curves & Between Curves",          short: "Area Under Curves" },
  { full: "Differential Equations — Formation & Types",  short: "Differential Eqns" },
  { full: "Vectors — Dot Product & Applications",        short: "Vectors 1" },
  { full: "Vectors — Cross Product & Triple Product",    short: "Vectors 2" },
  { full: "3D Geometry — Lines & Planes",                short: "3D Geometry" },
  { full: "Probability — Classical & Axiomatic",         short: "Probability 1" },
  { full: "Probability — Bayes' & Distributions",        short: "Probability 2" },
  { full: "Complex Numbers — Basics & Argand Plane",     short: "Complex Numbers 1" },
  { full: "Complex Numbers — Roots of Unity & Apps",     short: "Complex Numbers 2" },
  { full: "Quadratic Equations & Inequalities",          short: "Quadratic Equations" },
  { full: "Sequences & Series — AP, GP, HP",             short: "AP, GP, HP" },
  { full: "Sequences & Series — Special Sums",           short: "Special Sums" },
  { full: "Permutations & Combinations",                 short: "Permutations & Comb." },
  { full: "Binomial Theorem & Applications",             short: "Binomial Theorem" },
  { full: "Straight Lines — Equations & Angles",         short: "Straight Lines 1" },
  { full: "Straight Lines — Distance & Family",          short: "Straight Lines 2" },
  { full: "Circles — Standard Forms & Properties",       short: "Circles 1" },
  { full: "Circles — Chords, Tangents & Normals",        short: "Circles 2" },
  { full: "Parabola — Equation & Properties",            short: "Parabola" },
  { full: "Ellipse — Equation & Properties",             short: "Ellipse" },
  { full: "Hyperbola — Equation & Properties",           short: "Hyperbola" },
  { full: "Trigonometry — Ratios & Identities",          short: "Trig Identities" },
  { full: "Trigonometric Equations",                     short: "Trig Equations" },
  { full: "Properties of Triangles",                     short: "Triangle Properties" },
  { full: "Heights & Distances",                         short: "Heights & Distances" },
  { full: "Mathematical Reasoning",                      short: "Math Reasoning" },
  { full: "Statistics — Mean, Variance & SD",            short: "Statistics" },
  { full: "Limits — Standard Limits & L'Hôpital",        short: "Limits" },
  { full: "Logarithms, Exponentials & Surds",            short: "Logs & Exponentials" },
  { full: "Revision — Algebra (All Units)",              short: "Revision: Algebra" },
];

const CHM = [
  { full: "Mole Concept & Stoichiometry",                short: "Mole Concept" },
  { full: "Atomic Structure — Quantum Numbers",          short: "Atomic Structure" },
  { full: "Periodic Table & Periodic Properties",        short: "Periodic Properties" },
  { full: "Chemical Bonding — Ionic & Covalent Bonds",   short: "Chemical Bonding 1" },
  { full: "Chemical Bonding — VSEPR & Hybridisation",    short: "Hybridisation" },
  { full: "Molecular Orbital Theory",                    short: "MOT" },
  { full: "States of Matter — Gaseous State",            short: "Gaseous State" },
  { full: "Chemical Thermodynamics — Enthalpy",          short: "Thermodynamics 1" },
  { full: "Thermodynamics — Entropy & Gibb's Energy",    short: "Thermodynamics 2" },
  { full: "Chemical Equilibrium — Kp, Kc & Le Chatelier",short: "Chemical Equilibrium" },
  { full: "Ionic Equilibrium — pH, Buffer & Hydrolysis", short: "Ionic Equilibrium" },
  { full: "Redox Reactions — Balancing & Oxidation No.", short: "Redox Reactions" },
  { full: "Electrochemistry — Cells & EMF",              short: "Electrochemistry 1" },
  { full: "Electrochemistry — Electrolysis & Faraday",   short: "Electrochemistry 2" },
  { full: "Chemical Kinetics — Rate Laws & Order",       short: "Chemical Kinetics 1" },
  { full: "Chemical Kinetics — Arrhenius Equation",      short: "Chemical Kinetics 2" },
  { full: "Surface Chemistry — Adsorption & Colloids",   short: "Surface Chemistry" },
  { full: "p-Block Elements — Groups 13 & 14",           short: "p-Block 1" },
  { full: "p-Block Elements — Groups 15, 16 & 17",       short: "p-Block 2" },
  { full: "d & f Block Elements — Transition Metals",    short: "d-Block Elements" },
  { full: "Coordination Compounds — Nomenclature",       short: "Coordination Chem 1" },
  { full: "Coordination Compounds — Isomerism & Bonding",short: "Coordination Chem 2" },
  { full: "Metallurgy — Principles & Extraction",        short: "Metallurgy" },
  { full: "General Organic Chemistry — Basics & IUPAC",  short: "GOC Basics" },
  { full: "GOC — Isomerism & Reaction Mechanisms",       short: "GOC Mechanisms" },
  { full: "Hydrocarbons — Alkanes & Cycloalkanes",       short: "Alkanes" },
  { full: "Hydrocarbons — Alkenes & Alkynes",            short: "Alkenes & Alkynes" },
  { full: "Aromatic Hydrocarbons & EAS Reactions",       short: "Aromatic Compounds" },
  { full: "Haloalkanes & Haloarenes",                    short: "Haloalkanes" },
  { full: "Alcohols, Phenols & Ethers",                  short: "Alcohols & Phenols" },
  { full: "Aldehydes & Ketones — Reactions",             short: "Aldehydes & Ketones" },
  { full: "Carboxylic Acids & Derivatives",              short: "Carboxylic Acids" },
  { full: "Amines & Diazonium Salts",                    short: "Amines" },
  { full: "Biomolecules — Carbohydrates & Proteins",     short: "Biomolecules" },
  { full: "Polymers & Chemistry in Everyday Life",       short: "Polymers" },
  { full: "s-Block Elements — Alkali & Alkaline Earth",  short: "s-Block Elements" },
  { full: "Hydrogen & its Compounds — H2O2",             short: "Hydrogen Compounds" },
  { full: "Solid State — Crystal & Defects",             short: "Solid State" },
  { full: "Solutions — Raoult's Law & Colligative Props",short: "Solutions" },
  { full: "Environmental Chemistry & Noble Gases",       short: "Environmental Chem" },
  { full: "Revision — Physical Chemistry (All Units)",   short: "Revision: Phys Chem" },
];

/* ================================================================
   LOCAL STORAGE HELPERS (fallback when Firebase not configured)
   ================================================================ */
const LS = {
  get: (key) => {
    try { return JSON.parse(localStorage.getItem("pj_" + key)); }
    catch { return null; }
  },
  set: (key, val) => {
    try { localStorage.setItem("pj_" + key, JSON.stringify(val)); }
    catch { /* storage full */ }
  }
};

/* ================================================================
   STATE
   ================================================================ */
const state = {
  darkMode: false,
  dayNum: 1,
  today: "",
  dayData: {
    lectures:  { physics: false, maths: false, chemistry: false },
    revision:  false,
    practice:  false,
    questions: { physics: 0, maths: 0, chemistry: 0 }
  }
};

/* ================================================================
   UTILITY
   ================================================================ */
function dateStr(d) {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dy}`;
}

function calcDayNum(d = new Date()) {
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffMs = target - START_DATE;
  return Math.max(1, Math.floor(diffMs / 86400000) + 1);
}

function getLec(arr, dayN) {
  return arr[(dayN - 1) % arr.length];
}

function showToast(msg, ms = 2600) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), ms);
}

/* ================================================================
   FIRESTORE HELPERS
   ================================================================ */
async function fsGet(path) {
  if (!firebaseOk) return null;
  try {
    const snap = await getDoc(doc(db, ...path.split("/")));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn("Firestore read error:", e.message);
    return null;
  }
}

async function fsSet(path, data, merge = true) {
  if (!firebaseOk) return false;
  try {
    await setDoc(doc(db, ...path.split("/")), data, { merge });
    return true;
  } catch (e) {
    console.warn("Firestore write error:", e.message);
    return false;
  }
}

async function fsCollection(path) {
  if (!firebaseOk) return {};
  try {
    const snap = await getDocs(collection(db, ...path.split("/")));
    const result = {};
    snap.forEach(d => { result[d.id] = d.data(); });
    return result;
  } catch (e) {
    console.warn("Firestore collection error:", e.message);
    return {};
  }
}

/* ================================================================
   HEADER — DAY INFO & COUNTDOWN
   ================================================================ */
function initHeader() {
  const now = new Date();
  state.dayNum = calcDayNum(now);
  state.today  = dateStr(now);

  document.getElementById("dayNumber").textContent = state.dayNum;

  const opts = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
  document.getElementById("todayDate").textContent = now.toLocaleDateString("en-IN", opts);

  const daysLeft = Math.ceil((JEE_EXAM_DATE - now) / 86400000);
  document.getElementById("examCountdown").textContent =
    daysLeft > 0 ? `${daysLeft} days to JEE` : "JEE Day! 🎯";
}

/* ================================================================
   LECTURE PLANNER — POPULATE
   ================================================================ */
function populateLectures() {
  const n = state.dayNum;
  const ph = getLec(PHY, n);
  const mt = getLec(MTH, n);
  const ch = getLec(CHM, n);

  document.getElementById("physLecNum").textContent = `Physics Lec ${n}`;
  document.getElementById("mthLecNum").textContent  = `Maths Lec ${n}`;
  document.getElementById("chmLecNum").textContent  = `Chemistry Lec ${n}`;

  document.getElementById("physTopic").textContent  = ph.full;
  document.getElementById("mthTopic").textContent   = mt.full;
  document.getElementById("chmTopic").textContent   = ch.full;
}

/* ================================================================
   LECTURE PLANNER — UPCOMING (Next 2 days)
   ================================================================ */
function populateUpcoming() {
  const grid = document.getElementById("upcomingGrid");
  grid.innerHTML = "";

  for (let i = 1; i <= 2; i++) {
    const futureDay  = state.dayNum + i;
    const futureDate = new Date(START_DATE);
    futureDate.setDate(futureDate.getDate() + futureDay - 1);

    const dateLabel = futureDate.toLocaleDateString("en-IN",
      { weekday: "short", month: "short", day: "numeric" });

    const ph = getLec(PHY, futureDay);
    const mt = getLec(MTH, futureDay);
    const ch = getLec(CHM, futureDay);

    const card = document.createElement("div");
    card.className = "up-day";
    card.innerHTML = `
      <div class="up-day-header">
        <span class="up-day-date">${dateLabel}</span>
        <span class="up-day-num">Day ${futureDay}</span>
      </div>
      <div class="up-lec-row">
        <span class="up-tag tag-phy">PHY</span>
        <span>Lec ${futureDay} — ${ph.short}</span>
      </div>
      <div class="up-lec-row">
        <span class="up-tag tag-mth">MTH</span>
        <span>Lec ${futureDay} — ${mt.short}</span>
      </div>
      <div class="up-lec-row">
        <span class="up-tag tag-chm">CHM</span>
        <span>Lec ${futureDay} — ${ch.short}</span>
      </div>`;
    grid.appendChild(card);
  }
}

/* ================================================================
   SCORE — COMPUTE & RENDER
   ================================================================ */
function renderScore() {
  const { lectures, revision, practice } = state.dayData;
  let score = 0;
  if (lectures.physics)   score++;
  if (lectures.maths)     score++;
  if (lectures.chemistry) score++;
  if (revision)           score++;
  if (practice)           score++;

  // Badge + ring value
  document.getElementById("scoreBadge").textContent = `${score} / 5`;
  document.getElementById("ringVal").textContent    = score;

  // SVG ring: offset from full (301.6) down to 0 at score=5
  const offset = 301.6 * (1 - score / 5);
  document.getElementById("ringFill").style.strokeDashoffset = offset;

  // Score items
  const map = [
    { id: "si-phy",  active: lectures.physics   },
    { id: "si-mth",  active: lectures.maths     },
    { id: "si-chm",  active: lectures.chemistry },
    { id: "si-rev",  active: revision           },
    { id: "si-prac", active: practice           },
  ];

  map.forEach(({ id, active }) => {
    const el = document.getElementById(id);
    el.classList.toggle("active", active);
  });
}

/* ================================================================
   LECTURE PROGRESS BADGE
   ================================================================ */
function renderLectureProgress() {
  const { physics, maths, chemistry } = state.dayData.lectures;
  const count = [physics, maths, chemistry].filter(Boolean).length;
  document.getElementById("lectureProgress").textContent = `${count} / 3`;

  // Visual strikethrough / done class
  const map = { physics: "lecItemPhysics", maths: "lecItemMaths", chemistry: "lecItemChem" };
  Object.entries(map).forEach(([sub, id]) => {
    document.getElementById(id).classList.toggle("done", state.dayData.lectures[sub]);
  });
}

/* ================================================================
   TODAY'S QUESTION TOTAL
   ================================================================ */
function renderTodayQTotal() {
  const q = state.dayData.questions;
  const total = (q.physics || 0) + (q.maths || 0) + (q.chemistry || 0);
  document.getElementById("todayQTotal").textContent = total;
}

/* ================================================================
   LOAD TODAY'S DATA FROM FIRESTORE / LOCALSTORAGE
   ================================================================ */
async function loadTodayData() {
  let data = null;
  const path = `users/${USER_ID}/days/${state.today}`;

  if (firebaseOk) {
    data = await fsGet(path);
  } else {
    data = LS.get(`day_${state.today}`);
  }

  if (data) {
    state.dayData = {
      lectures:  data.lectures  || { physics: false, maths: false, chemistry: false },
      revision:  data.revision  || false,
      practice:  data.practice  || false,
      questions: data.questions || { physics: 0, maths: 0, chemistry: 0 }
    };
  }

  // Sync checkboxes
  document.getElementById("chkPhysics").checked = state.dayData.lectures.physics;
  document.getElementById("chkMaths").checked   = state.dayData.lectures.maths;
  document.getElementById("chkChem").checked     = state.dayData.lectures.chemistry;
  document.getElementById("chkRevision").checked = state.dayData.revision;
  document.getElementById("chkPractice").checked = state.dayData.practice;

  // Sync question inputs
  const q = state.dayData.questions;
  document.getElementById("qPhy").value = q.physics || "";
  document.getElementById("qMth").value = q.maths   || "";
  document.getElementById("qChm").value = q.chemistry || "";

  renderLectureProgress();
  renderScore();
  renderTodayQTotal();
}

/* ================================================================
   SAVE TODAY'S DATA (merge)
   ================================================================ */
async function saveTodayData(partial) {
  const path = `users/${USER_ID}/days/${state.today}`;

  const payload = {
    ...partial,
    date:      state.today,
    updatedAt: new Date().toISOString()
  };

  const ok = await fsSet(path, payload, true);

  if (!ok) {
    // Fallback: merge into localStorage
    const existing = LS.get(`day_${state.today}`) || {};
    LS.set(`day_${state.today}`, { ...existing, ...partial, date: state.today });
  }
}

/* ================================================================
   CHECKBOX HANDLERS — LECTURES
   ================================================================ */
function attachLectureCheckboxes() {
  const map = {
    chkPhysics:  "physics",
    chkMaths:    "maths",
    chkChem:     "chemistry"
  };

  Object.entries(map).forEach(([id, subject]) => {
    document.getElementById(id).addEventListener("change", async (e) => {
      state.dayData.lectures[subject] = e.target.checked;
      renderLectureProgress();
      renderScore();

      await saveTodayData({ lectures: state.dayData.lectures });

      const label = subject.charAt(0).toUpperCase() + subject.slice(1);
      showToast(e.target.checked
        ? `✅ ${label} lecture completed!`
        : `↩️ ${label} lecture unmarked`);
    });
  });
}

/* ================================================================
   CHECKBOX HANDLERS — REVISION & PRACTICE
   ================================================================ */
function attachRevisionPracticeCheckboxes() {
  document.getElementById("chkRevision").addEventListener("change", async (e) => {
    state.dayData.revision = e.target.checked;
    renderScore();
    await saveTodayData({ revision: e.target.checked });
    showToast(e.target.checked ? "📖 Revision session logged!" : "↩️ Revision unmarked");
  });

  document.getElementById("chkPractice").addEventListener("change", async (e) => {
    state.dayData.practice = e.target.checked;
    renderScore();
    await saveTodayData({ practice: e.target.checked });
    showToast(e.target.checked ? "💪 Practice session logged!" : "↩️ Practice unmarked");
  });
}

/* ================================================================
   QUESTION TRACKER — LOG BUTTON
   ================================================================ */
function attachQuestionLogger() {
  document.getElementById("btnLogQ").addEventListener("click", async () => {
    const phy = parseInt(document.getElementById("qPhy").value) || 0;
    const mth = parseInt(document.getElementById("qMth").value) || 0;
    const chm = parseInt(document.getElementById("qChm").value) || 0;

    state.dayData.questions = { physics: phy, maths: mth, chemistry: chm };
    renderTodayQTotal();

    await saveTodayData({ questions: state.dayData.questions });
    await loadAnalytics();

    const total = phy + mth + chm;
    showToast(`🎯 ${total} questions logged for today!`);
  });
}

/* ================================================================
   ANALYTICS — LOAD & RENDER
   ================================================================ */
let perfChart = null;

async function loadAnalytics() {
  // ── Fetch all days (Firestore or LS) ──
  let allData = {};

  if (firebaseOk) {
    allData = await fsCollection(`users/${USER_ID}/days`);
  } else {
    // Reconstruct from localStorage keys
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("pj_day_")) {
        const dateKey = key.replace("pj_day_", "");
        const d = LS.get(`day_${dateKey}`);
        if (d) allData[dateKey] = d;
      }
    }
  }

  // ── Last 7 days ──
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const last7 = [];
  const labels = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    last7.push(dateStr(d));
    labels.push(d.toLocaleDateString("en-IN", { weekday: "short" }));
  }

  const phyArr = [], mthArr = [], chmArr = [];

  last7.forEach(ds => {
    const row = allData[ds];
    phyArr.push(row?.questions?.physics  || 0);
    mthArr.push(row?.questions?.maths    || 0);
    chmArr.push(row?.questions?.chemistry || 0);
  });

  // ── Totals ──
  const sevenAgo  = new Date(today); sevenAgo.setDate(sevenAgo.getDate() - 7);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  let weekly = 0, monthly = 0, total = 0;

  Object.entries(allData).forEach(([ds, row]) => {
    const d = new Date(ds);
    const q = (row.questions?.physics || 0)
            + (row.questions?.maths   || 0)
            + (row.questions?.chemistry || 0);
    total += q;
    if (d >= sevenAgo)   weekly  += q;
    if (d >= monthStart) monthly += q;
  });

  document.getElementById("statWeekly").textContent  = weekly;
  document.getElementById("statMonthly").textContent = monthly;
  document.getElementById("statTotal").textContent   = total;

  // ── Chart ──
  renderChart(labels, phyArr, mthArr, chmArr);
}

/* ================================================================
   CHART.JS — RENDER / RE-RENDER
   ================================================================ */
function renderChart(labels, phyArr, mthArr, chmArr) {
  const dark = state.darkMode;

  const colors = dark
    ? { phy: "#00b4ff", mth: "#00e5a0", chm: "#ff6060",
        grid: "rgba(255,255,255,0.05)", tick: "#7aa3c0",
        tooltip_bg: "#091428", tooltip_title: "#dceeff", tooltip_body: "#7aa3c0" }
    : { phy: "#1a73e8", mth: "#1da462", chm: "#e53935",
        grid: "rgba(0,0,0,0.05)", tick: "#4d5568",
        tooltip_bg: "#ffffff", tooltip_title: "#1a1f36", tooltip_body: "#4d5568" };

  const ctx = document.getElementById("perfChart").getContext("2d");

  if (perfChart) { perfChart.destroy(); perfChart = null; }

  perfChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Physics",
          data: phyArr,
          backgroundColor: colors.phy + "55",
          borderColor: colors.phy,
          borderWidth: 2,
          borderRadius: 6,
          borderSkipped: false,
        },
        {
          label: "Maths",
          data: mthArr,
          backgroundColor: colors.mth + "55",
          borderColor: colors.mth,
          borderWidth: 2,
          borderRadius: 6,
          borderSkipped: false,
        },
        {
          label: "Chemistry",
          data: chmArr,
          backgroundColor: colors.chm + "55",
          borderColor: colors.chm,
          borderWidth: 2,
          borderRadius: 6,
          borderSkipped: false,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: colors.tooltip_bg,
          titleColor: colors.tooltip_title,
          bodyColor: colors.tooltip_body,
          borderColor: dark ? "rgba(0,180,255,0.25)" : "rgba(26,115,232,0.15)",
          borderWidth: 1,
          padding: 14,
          cornerRadius: 12,
          callbacks: {
            footer: (items) => {
              const sum = items.reduce((a, i) => a + i.raw, 0);
              return `Total: ${sum} questions`;
            }
          }
        }
      },
      scales: {
        x: {
          grid:   { color: colors.grid, drawBorder: false },
          ticks:  { color: colors.tick, font: { family: "'DM Sans'", size: 12 } },
          border: { display: false }
        },
        y: {
          beginAtZero: true,
          grid:   { color: colors.grid, drawBorder: false },
          ticks:  {
            color: colors.tick,
            font: { family: "'DM Sans'", size: 12 },
            precision: 0,
            stepSize: 5
          },
          border: { display: false }
        }
      },
      animation: {
        duration: 600,
        easing: "easeInOutQuart"
      }
    }
  });
}

/* ================================================================
   DARK MODE — TOGGLE & PERSIST
   ================================================================ */
async function loadDarkModePref() {
  let dark = false;

  if (firebaseOk) {
    const pref = await fsGet(`users/${USER_ID}/settings/preferences`);
    dark = pref?.darkMode ?? false;
  } else {
    dark = localStorage.getItem("pj_dark") === "true";
  }

  state.darkMode = dark;
  applyDarkMode(dark);
  document.getElementById("modeToggle").checked = dark;
}

function applyDarkMode(dark) {
  document.body.className = dark ? "dark-mode" : "light-mode";
  state.darkMode = dark;
  localStorage.setItem("pj_dark", dark);
}

function attachModeToggle() {
  document.getElementById("modeToggle").addEventListener("change", async (e) => {
    applyDarkMode(e.target.checked);

    // Re-render chart with new palette
    await loadAnalytics();

    // Persist
    const ok = await fsSet(`users/${USER_ID}/settings/preferences`,
      { darkMode: e.target.checked }, true);
    if (!ok) localStorage.setItem("pj_dark", e.target.checked);
  });
}

/* ================================================================
   INIT — BOOT SEQUENCE
   ================================================================ */
async function init() {
  // 1. Dark mode preference (before paint to avoid flash)
  await loadDarkModePref();

  // 2. Header dates
  initHeader();

  // 3. Lecture content
  populateLectures();
  populateUpcoming();

  // 4. Wire up event listeners
  attachLectureCheckboxes();
  attachRevisionPracticeCheckboxes();
  attachQuestionLogger();
  attachModeToggle();

  // 5. Load persisted day data
  await loadTodayData();

  // 6. Analytics + chart
  await loadAnalytics();

  console.log(
    `%c⚡ Prayas JEE 2.0 Tracker\n` +
    `%cDay ${state.dayNum} | User: ${USER_ID}\n` +
    `Firebase: ${firebaseOk ? "✅ Connected" : "⚠️ Not configured (using localStorage)"}`,
    "font-size:14px;font-weight:bold;color:#1a73e8",
    "font-size:11px;color:#888"
  );
}

init();
