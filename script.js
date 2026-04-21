/* ══════════════════════════════════════════════════════
   JEE CBT PLATFORM — script.js
   Full application logic: PDF→API→CBT interface
══════════════════════════════════════════════════════ */

// ── PDF.js worker setup ──────────────────────────────
if (typeof pdfjsLib !== 'undefined') {
  // Use CDN worker — same version as the main library
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ═══════════════════════════════════════════════════════
//   APP STATE
// ═══════════════════════════════════════════════════════
const App = {
  questions:    [],      // Array of question objects
  answers:      {},      // { qIndex: selectedOption }
  qStates:      {},      // { qIndex: 'not_visited'|'not_answered'|'answered'|'marked'|'answered_marked' }
  diagrams:     {},      // { qIndex: dataURL }
  currentQ:     0,
  currentSection:'All',
  timerInterval: null,
  timerSeconds:  10800, // 180 minutes
  totalSeconds:  10800,
  paletteOpen:  false,
  reviewMode:   false,
  isSubmitted:  false,
  selectedFile: null,
};

const SECTIONS = ['Physics', 'Chemistry', 'Maths'];
const STORAGE_KEY = 'jee_cbt_v3';

// ═══════════════════════════════════════════════════════
//   ✦ GEMINI API INTEGRATION — PLUG YOUR KEY HERE ✦
// ═══════════════════════════════════════════════════════
/**
 * processPaper(pdfText) — Main entry point for AI processing.
 * Replace API_KEY with your actual Gemini API key, or pass it
 * via the UI input. Returns array of question objects.
 */
async function processPaper(pdfText) {
  const apiKey = document.getElementById('apiKeyInput').value.trim();
  if (!apiKey) throw new Error('NO_API_KEY');
  return await callGeminiAPI(pdfText, apiKey);
}

/**
 * callGeminiAPI(extractedText, apiKey)
 * Sends the extracted PDF text to Gemini 1.5 Flash and receives
 * a structured JSON array of 75 JEE questions.
 *
 * ── HOW TO PLUG YOUR KEY ──
 * 1. Get a free Gemini API key at: https://aistudio.google.com/
 * 2. Enter it in the "API Key" input on the upload screen.
 *    OR hardcode it below (not recommended for shared code):
 *    const API_KEY = 'YOUR_GEMINI_API_KEY_HERE';
 */
async function callGeminiAPI(extractedText, apiKey) {
  const API_URL =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const prompt = `
You are an expert JEE exam parser. Extract ALL questions from the provided PDF text and return them as a strict JSON array.

RULES:
1. Return ONLY a valid JSON array — no markdown, no explanation, no code fences.
2. Each object must have: id (1-75), subject ("Physics"|"Chemistry"|"Maths"), question (string with LaTeX if needed), options (array of 4 strings), correct ("A"|"B"|"C"|"D"), type ("single").
3. Preserve ALL mathematical expressions in LaTeX format. Wrap inline math with $...$ and display math with $$...$$
4. If fewer than 75 questions are found, generate plausible JEE-style placeholders to fill to 75.
5. Distribute: Physics Q1-25, Chemistry Q26-50, Maths Q51-75.

PDF TEXT:
${extractedText.substring(0, 30000)}

Return the JSON array now:`;

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
      }
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API Error ${response.status}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Strip any markdown fences and parse JSON
  const clean = rawText.replace(/```json|```/gi, '').trim();
  const match = clean.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('API returned invalid JSON — no array found.');
  return JSON.parse(match[0]);
}

// ═══════════════════════════════════════════════════════
//   PDF TEXT EXTRACTION
// ═══════════════════════════════════════════════════════
async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  const total = pdf.numPages;

  for (let i = 1; i <= total; i++) {
    setProgress(10 + Math.floor((i / total) * 30), `Reading page ${i} of ${total}…`);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += pageText + '\n\n';
  }
  return fullText;
}

// ═══════════════════════════════════════════════════════
//   MAIN CONVERSION FLOW
// ═══════════════════════════════════════════════════════
async function startConversion() {
  if (!App.selectedFile) {
    showToast('⚠️ Please upload a PDF first, or try Demo Mode.');
    return;
  }

  showScreen('processingScreen');
  try {
    // Step 1: Extract PDF text
    activateStep(1);
    setProgress(5, 'Opening PDF…');
    const pdfText = await extractTextFromPDF(App.selectedFile);

    // Step 2: Call AI API
    activateStep(2);
    setProgress(45, 'Sending to Gemini AI…');

    let questions;
    const apiKey = document.getElementById('apiKeyInput').value.trim();
    if (!apiKey) {
      showToast('ℹ️ No API key — loading Demo questions instead.');
      questions = generateDemoQuestions();
    } else {
      questions = await processPaper(pdfText);
    }

    // Step 3: Parse & validate
    activateStep(3);
    setProgress(80, 'Validating questions…');
    questions = validateAndNormalize(questions);

    // Step 4: Build interface
    activateStep(4);
    setProgress(95, 'Building exam interface…');
    const duration = parseInt(document.getElementById('duration').value, 10);
    await new Promise(r => setTimeout(r, 600));
    setProgress(100, 'Ready!');

    initExam(questions, duration);

  } catch (err) {
    console.error('Conversion error:', err);
    showScreen('uploadScreen');

    // Show a clear, specific error message to the user
    if (err.message === 'NO_API_KEY') {
      showToast('⚠️ No API key entered. Try Demo Mode instead.');
    } else if (err.message.includes('API Error 400')) {
      showToast('❌ Invalid API Key. Check your Gemini key and try again.');
    } else if (err.message.includes('API Error 429')) {
      showToast('❌ Gemini quota exceeded. Wait a minute or use Demo Mode.');
    } else if (err.message.includes('invalid JSON')) {
      showToast('❌ AI returned unexpected response. Try again or use Demo Mode.');
    } else if (err.message.includes('API Error')) {
      showToast('❌ API Error: ' + err.message + '. Try Demo Mode.');
    } else {
      showToast('❌ Error: ' + err.message);
    }
  }
}

function loadDemoMode() {
  const duration = parseInt(document.getElementById('duration').value || '180', 10);
  showScreen('processingScreen');

  let p = 0;
  activateStep(1);
  const iv = setInterval(() => {
    p += 12;
    if (p <= 25)  { activateStep(1); setProgress(p, 'Generating demo questions…'); }
    if (p > 25)   { activateStep(2); setProgress(p, 'Loading sample papers…'); }
    if (p > 55)   { activateStep(3); setProgress(p, 'Parsing 75 questions…'); }
    if (p > 80)   { activateStep(4); setProgress(p, 'Building CBT interface…'); }
    if (p >= 100) {
      clearInterval(iv);
      const questions = generateDemoQuestions();
      initExam(questions, duration);
    }
  }, 250);
}

function validateAndNormalize(questions) {
  const valid = questions.filter(q =>
    q && q.question && Array.isArray(q.options) && q.options.length >= 2
  );
  // Assign correct ids + subjects if missing
  return valid.slice(0, 75).map((q, i) => ({
    id:       q.id || i + 1,
    subject:  q.subject || SECTIONS[Math.floor(i / 25)],
    question: q.question || 'Question text not available.',
    options:  q.options.slice(0, 4),
    correct:  q.correct || 'A',
    type:     q.type || 'single',
  }));
}

// ═══════════════════════════════════════════════════════
//   EXAM INITIALISATION
// ═══════════════════════════════════════════════════════
function initExam(questions, durationMinutes = 180) {
  App.questions = questions;
  App.timerSeconds = durationMinutes * 60;
  App.totalSeconds = App.timerSeconds;
  App.isSubmitted  = false;
  App.reviewMode   = false;
  App.currentQ     = 0;

  // Init states for all questions
  App.qStates  = {};
  App.answers  = {};
  App.diagrams = {};
  questions.forEach((_, i) => { App.qStates[i] = 'not_visited'; });

  // Check for saved progress
  const saved = loadFromStorage();
  if (saved && saved.questionCount === questions.length) {
    const resume = confirm('📋 Saved progress found! Resume where you left off?');
    if (resume) {
      App.answers      = saved.answers || {};
      App.qStates      = saved.qStates || App.qStates;
      App.diagrams     = saved.diagrams || {};
      App.timerSeconds = saved.timerSeconds || App.timerSeconds;
      App.currentQ     = saved.currentQ || 0;
    } else {
      clearStorage();
    }
  }

  buildPalette();
  showScreen('examScreen');
  renderQuestion(App.currentQ);
  startTimer();
  filterSection('Physics', document.querySelector('.sec-tab[data-sec="Physics"]'));
  autoSaveInterval();
}

// ═══════════════════════════════════════════════════════
//   RENDER QUESTION
// ═══════════════════════════════════════════════════════
function renderQuestion(index) {
  if (index < 0 || index >= App.questions.length) return;
  App.currentQ = index;
  const q = App.questions[index];

  // Mark as 'not_answered' if first visit
  if (App.qStates[index] === 'not_visited') {
    App.qStates[index] = 'not_answered';
  }

  // Header meta
  document.getElementById('qNumBadge').textContent  = `Q.${q.id || index + 1}`;
  document.getElementById('qSubjChip').textContent  = q.subject;
  document.getElementById('qTypeChip').textContent  = 'Single Correct';
  document.getElementById('topbarSubject').textContent = q.subject;

  // Subject colouring
  const subj = document.getElementById('qSubjChip');
  subj.style.background = '';
  subj.style.color = '';

  // Question text with LaTeX
  const qText = document.getElementById('qText');
  qText.innerHTML = q.question;
  renderKaTeX(qText);

  // Diagram
  const prevRow = document.getElementById('diagramPreviewRow');
  const upRow   = document.getElementById('diagramUploadRow');
  if (App.diagrams[index]) {
    document.getElementById('diagramImg').src = App.diagrams[index];
    prevRow.style.display = 'flex';
    upRow.style.display   = 'none';
  } else {
    prevRow.style.display = 'none';
    upRow.style.display   = 'flex';
  }

  // Options
  const optList = document.getElementById('optionsList');
  optList.innerHTML = '';
  const letters = ['A','B','C','D'];

  q.options.forEach((opt, oi) => {
    const letter = letters[oi];
    const div = document.createElement('div');
    div.className = 'option-item';
    div.dataset.letter = letter;

    const isSelected = App.answers[index] === letter;
    if (isSelected) div.classList.add('selected');

    // Review mode: show correct/wrong
    if (App.reviewMode) {
      if (letter === q.correct) div.classList.add('correct-ans');
      else if (isSelected && letter !== q.correct) div.classList.add('wrong-ans');
    }

    div.innerHTML = `
      <div class="option-letter">${letter}</div>
      <div class="option-text">${opt}</div>
    `;
    if (!App.reviewMode && !App.isSubmitted) {
      div.addEventListener('click', () => selectOption(letter));
    }
    optList.appendChild(div);
    renderKaTeX(div.querySelector('.option-text'));
  });

  // Mark button state
  const markBtn = document.getElementById('markReviewBtn');
  const state = App.qStates[index];
  if (state === 'marked' || state === 'answered_marked') {
    markBtn.classList.add('marked');
    markBtn.textContent = '🚩 Unmark';
  } else {
    markBtn.classList.remove('marked');
    markBtn.textContent = '🚩 Mark for Review';
  }

  // Update palette highlight
  updatePaletteHighlight();
  updateStats();
  scrollQuestionToTop();
}

function scrollQuestionToTop() {
  const sa = document.querySelector('.q-scroll-area');
  if (sa) sa.scrollTop = 0;
}

function renderKaTeX(el) {
  if (!el) return;
  // If KaTeX not yet loaded, retry after a short delay
  if (!window.renderMathInElement) {
    setTimeout(() => renderKaTeX(el), 200);
    return;
  }
  try {
    renderMathInElement(el, {
      delimiters: [
        { left: '$$', right: '$$', display: true  },
        { left: '$',  right: '$',  display: false },
        { left: '\\[', right: '\\]', display: true  },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
      errorColor: '#cc0000',
    });
  } catch (e) { /* silently ignore KaTeX errors */ }
}

// ═══════════════════════════════════════════════════════
//   ANSWER ACTIONS
// ═══════════════════════════════════════════════════════
function selectOption(letter) {
  if (App.isSubmitted) return;
  const i = App.currentQ;
  App.answers[i] = letter;

  // Update state
  if (App.qStates[i] === 'marked') {
    App.qStates[i] = 'answered_marked';
  } else {
    App.qStates[i] = 'answered';
  }

  // Re-render options visually
  document.querySelectorAll('.option-item').forEach(el => {
    el.classList.remove('selected');
    el.querySelector('.option-letter').style.background = '';
    el.querySelector('.option-letter').style.color = '';
    if (el.dataset.letter === letter) {
      el.classList.add('selected');
    }
  });

  updatePaletteHighlight();
  updateStats();
  saveToStorage();
}

function saveAndNext() {
  if (!App.isSubmitted && App.qStates[App.currentQ] === 'not_answered') {
    // Don't change to answered if no option selected
  }
  const next = findNextQuestion(App.currentQ + 1, 'forward');
  if (next !== -1) {
    renderQuestion(next);
  } else {
    showToast('✅ You\'re on the last question!');
  }
  closePaletteIfMobile();
}

function clearResponse() {
  if (App.isSubmitted) return;
  const i = App.currentQ;
  delete App.answers[i];

  // Revert state
  if (App.qStates[i] === 'answered_marked') {
    App.qStates[i] = 'marked';
  } else {
    App.qStates[i] = 'not_answered';
  }

  document.querySelectorAll('.option-item').forEach(el => el.classList.remove('selected'));
  updatePaletteHighlight();
  updateStats();
  saveToStorage();
  showToast('🗑 Response cleared');
}

function markForReview() {
  if (App.isSubmitted) return;
  const i = App.currentQ;

  if (App.qStates[i] === 'marked') {
    // Unmark
    App.qStates[i] = App.answers[i] ? 'answered' : 'not_answered';
  } else if (App.qStates[i] === 'answered_marked') {
    App.qStates[i] = 'answered';
  } else if (App.qStates[i] === 'answered') {
    App.qStates[i] = 'answered_marked';
  } else {
    App.qStates[i] = 'marked';
  }

  // Update mark button
  const markBtn = document.getElementById('markReviewBtn');
  const state = App.qStates[i];
  if (state === 'marked' || state === 'answered_marked') {
    markBtn.classList.add('marked');
    markBtn.textContent = '🚩 Unmark';
    showToast('🚩 Marked for review');
  } else {
    markBtn.classList.remove('marked');
    markBtn.textContent = '🚩 Mark for Review';
    showToast('✓ Mark removed');
  }

  updatePaletteHighlight();
  updateStats();
  saveToStorage();
}

function navigateQuestion(dir) {
  const next = dir === 'back'
    ? findNextQuestion(App.currentQ - 1, 'back')
    : findNextQuestion(App.currentQ + 1, 'forward');

  if (next !== -1) {
    renderQuestion(next);
  } else {
    showToast(dir === 'back' ? '⚠️ Already at first question' : '⚠️ Last question');
  }
}

// Find next question in current section filter
function findNextQuestion(from, direction) {
  const len = App.questions.length;
  const step = direction === 'forward' ? 1 : -1;

  for (let i = from; i >= 0 && i < len; i += step) {
    const q = App.questions[i];
    if (App.currentSection === 'All') return i;
    if (q.subject === App.currentSection) return i;
  }
  return -1;
}

// ═══════════════════════════════════════════════════════
//   PALETTE
// ═══════════════════════════════════════════════════════
function buildPalette() {
  const grids = {
    Physics:   document.getElementById('palGridPhysics'),
    Chemistry: document.getElementById('palGridChemistry'),
    Maths:     document.getElementById('palGridMaths'),
  };
  Object.values(grids).forEach(g => { if (g) g.innerHTML = ''; });

  App.questions.forEach((q, i) => {
    const btn = document.createElement('button');
    btn.className = 'pal-btn not-visited';
    btn.id = `pal-${i}`;
    btn.textContent = i + 1;
    btn.addEventListener('click', () => {
      renderQuestion(i);
      closePaletteIfMobile();
    });

    const grid = grids[q.subject] || grids['Maths'];
    if (grid) grid.appendChild(btn);
  });
}

function updatePaletteHighlight() {
  App.questions.forEach((_, i) => {
    const btn = document.getElementById(`pal-${i}`);
    if (!btn) return;
    btn.className = 'pal-btn ' + (App.qStates[i] || 'not-visited').replace('_','-');
    if (i === App.currentQ) btn.classList.add('current');
  });
}

function updateStats() {
  const counts = { answered: 0, not_answered: 0, marked: 0, answered_marked: 0, not_visited: 0 };
  Object.values(App.qStates).forEach(s => { counts[s] = (counts[s] || 0) + 1; });

  const totalMarked = counts.marked + counts.answered_marked;
  document.getElementById('psAnswered').textContent   = counts.answered + counts.answered_marked;
  document.getElementById('psNotAns').textContent     = counts.not_answered;
  document.getElementById('psMarked').textContent     = totalMarked;
  document.getElementById('psNotVis').textContent     = counts.not_visited;
}

// ═══════════════════════════════════════════════════════
//   SECTION FILTER
// ═══════════════════════════════════════════════════════
function filterSection(section, el) {
  App.currentSection = section;

  document.querySelectorAll('.sec-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');

  // Navigate to first question in that section
  const firstIdx = section === 'All'
    ? 0
    : App.questions.findIndex(q => q.subject === section);

  if (firstIdx >= 0) renderQuestion(firstIdx);
}

// ═══════════════════════════════════════════════════════
//   DIAGRAM / IMAGE ATTACH
// ═══════════════════════════════════════════════════════
function attachDiagram(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    App.diagrams[App.currentQ] = e.target.result;
    document.getElementById('diagramImg').src = e.target.result;
    document.getElementById('diagramPreviewRow').style.display = 'flex';
    document.getElementById('diagramUploadRow').style.display  = 'none';
    saveToStorage();
    showToast('🖼️ Diagram attached!');
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function removeDiagram() {
  delete App.diagrams[App.currentQ];
  document.getElementById('diagramPreviewRow').style.display = 'none';
  document.getElementById('diagramUploadRow').style.display  = 'flex';
  document.getElementById('diagramImg').src = '';
  saveToStorage();
  showToast('🗑 Diagram removed');
}

// ═══════════════════════════════════════════════════════
//   TIMER
// ═══════════════════════════════════════════════════════
function startTimer() {
  clearInterval(App.timerInterval);
  renderTimer();

  App.timerInterval = setInterval(() => {
    App.timerSeconds--;
    renderTimer();
    if (App.timerSeconds <= 0) {
      clearInterval(App.timerInterval);
      showToast('⏰ Time\'s up! Auto-submitting…');
      setTimeout(submitTest, 1500);
    }
    // Save every 30s
    if (App.timerSeconds % 30 === 0) saveToStorage();
  }, 1000);
}

function renderTimer() {
  const h  = Math.floor(App.timerSeconds / 3600);
  const m  = Math.floor((App.timerSeconds % 3600) / 60);
  const s  = App.timerSeconds % 60;
  const formatted = `${pad(h)}:${pad(m)}:${pad(s)}`;
  document.getElementById('timerDisplay').textContent = formatted;

  // Arc
  const pct = App.timerSeconds / App.totalSeconds;
  const arc = document.getElementById('timerArc');
  if (arc) arc.style.strokeDashoffset = ((1 - pct) * 100).toString();

  // Warning colours
  const widget = document.getElementById('timerWidget');
  if (widget) {
    widget.classList.remove('warning', 'danger');
    if (App.timerSeconds < 600)       widget.classList.add('danger');
    else if (App.timerSeconds < 1800) widget.classList.add('warning');
  }
}
function pad(n) { return String(n).padStart(2, '0'); }

// ═══════════════════════════════════════════════════════
//   SUMMARY & SUBMIT
// ═══════════════════════════════════════════════════════
function showSummary() {
  const counts = getSummaryCounts();
  const body = document.getElementById('summaryBody');
  body.innerHTML = `
    <div class="summary-section">
      <h4>Overall</h4>
      <div class="summary-row"><span>Answered</span>         <span class="s-val s-answered">${counts.answered}</span></div>
      <div class="summary-row"><span>Not Answered</span>     <span class="s-val s-not-answered">${counts.not_answered}</span></div>
      <div class="summary-row"><span>Marked for Review</span><span class="s-val s-marked">${counts.marked}</span></div>
      <div class="summary-row"><span>Not Visited</span>      <span class="s-val s-not-visited">${counts.not_visited}</span></div>
    </div>
    <div class="summary-section">
      <h4>By Section</h4>
      ${SECTIONS.map(sec => {
        const qs = App.questions.filter(q => q.subject === sec);
        const ans = qs.filter((_, i) => App.answers[App.questions.indexOf(qs[0]) + i] !== undefined).length;
        return `<div class="summary-row"><span>${sec}</span><span class="s-val">${ans}/${qs.length} answered</span></div>`;
      }).join('')}
    </div>
  `;
  document.getElementById('summaryModal').style.display = 'flex';
}

function closeSummary() {
  document.getElementById('summaryModal').style.display = 'none';
}
function closeSummaryModal(e) {
  if (e.target === document.getElementById('summaryModal')) closeSummary();
}

function confirmSubmit() {
  closeSummary();
  const counts = getSummaryCounts();
  const preview = document.getElementById('submitPreview');
  preview.innerHTML = `
    <div class="sp-chip" style="background:var(--green-bg);color:var(--green)">
      <span>${counts.answered}</span><span>Answered</span>
    </div>
    <div class="sp-chip" style="background:var(--red-bg);color:var(--red)">
      <span>${counts.not_answered}</span><span>Not Answered</span>
    </div>
    <div class="sp-chip" style="background:var(--purple-bg);color:var(--purple)">
      <span>${counts.marked}</span><span>Marked</span>
    </div>
    <div class="sp-chip" style="background:var(--gray-bg);color:var(--gray)">
      <span>${counts.not_visited}</span><span>Not Visited</span>
    </div>
  `;
  document.getElementById('submitModal').style.display = 'flex';
}
function closeSubmitModal(e) {
  if (e.target === document.getElementById('submitModal'))
    document.getElementById('submitModal').style.display = 'none';
}

function getSummaryCounts() {
  const counts = { answered: 0, not_answered: 0, marked: 0, not_visited: 0 };
  Object.values(App.qStates).forEach(s => {
    if (s === 'answered' || s === 'answered_marked') counts.answered++;
    else if (s === 'not_answered') counts.not_answered++;
    else if (s === 'marked')       counts.marked++;
    else counts.not_visited++;
  });
  return counts;
}

function submitTest() {
  clearInterval(App.timerInterval);
  App.isSubmitted = true;
  document.getElementById('submitModal').style.display = 'none';
  clearStorage();
  showResults();
}

// ═══════════════════════════════════════════════════════
//   RESULTS
// ═══════════════════════════════════════════════════════
function showResults() {
  let totalScore = 0, totalMax = 0;
  const subjectData = {};
  SECTIONS.forEach(s => { subjectData[s] = { score: 0, max: 0, correct: 0, wrong: 0, unattempted: 0 }; });

  App.questions.forEach((q, i) => {
    const sd = subjectData[q.subject] || subjectData['Maths'];
    sd.max += 4; totalMax += 4;
    const ans = App.answers[i];
    if (!ans) { sd.unattempted++; }
    else if (ans === q.correct) {
      sd.score += 4; totalScore += 4;
      sd.correct++;
    } else {
      sd.score -= 1; totalScore -= 1;
      sd.wrong++;
    }
  });

  document.getElementById('resultScore').textContent = totalScore;
  document.getElementById('resultTotal').textContent = `/${totalMax}`;

  // Animate score arc (SVG)
  const pct = Math.max(0, totalScore / totalMax);
  const circumference = 2 * Math.PI * 82;
  const arc = document.getElementById('scoreArcEl');
  setTimeout(() => {
    if (arc) {
      arc.style.transition = 'stroke-dashoffset 1.5s ease';
      arc.style.strokeDashoffset = circumference * (1 - pct);
    }
  }, 300);

  // Subject breakdown
  const bd = document.getElementById('resultBreakdown');
  bd.innerHTML = SECTIONS.map(s => {
    const d = subjectData[s];
    return `
      <div class="rb-card">
        <span class="rb-subject">${s}</span>
        <span class="rb-score">${d.score}</span>
        <span class="rb-detail">✅ ${d.correct} · ❌ ${d.wrong} · ○ ${d.unattempted}</span>
      </div>`;
  }).join('');

  const pctNum = Math.round(pct * 100);
  document.getElementById('resultSubtitle').textContent =
    pct >= 0.75 ? `🎉 Excellent! You scored ${pctNum}%` :
    pct >= 0.5  ? `👍 Good job! You scored ${pctNum}%` :
                  `📚 Keep practicing! You scored ${pctNum}%`;

  showScreen('resultScreen');
}

function reviewMode() {
  App.reviewMode = true;
  showScreen('examScreen');
  renderQuestion(App.currentQ);
  // Disable nav actions
  showToast('📖 Review Mode — answers shown in colour');
}

// ═══════════════════════════════════════════════════════
//   PALETTE DRAWER (mobile)
// ═══════════════════════════════════════════════════════
function togglePaletteDrawer() {
  if (window.innerWidth >= 901) return; // Desktop: always visible
  App.paletteOpen = !App.paletteOpen;
  const panel    = document.getElementById('palettePanel');
  const backdrop = document.getElementById('paletteBackdrop');
  panel.classList.toggle('open', App.paletteOpen);
  backdrop.classList.toggle('active', App.paletteOpen);
  document.body.style.overflow = App.paletteOpen ? 'hidden' : '';
}

function closePaletteIfMobile() {
  if (window.innerWidth < 901 && App.paletteOpen) togglePaletteDrawer();
}

// ═══════════════════════════════════════════════════════
//   LOCAL STORAGE
// ═══════════════════════════════════════════════════════
function saveToStorage() {
  try {
    const data = {
      questionCount: App.questions.length,
      questions:     App.questions,
      answers:       App.answers,
      qStates:       App.qStates,
      diagrams:      App.diagrams,
      timerSeconds:  App.timerSeconds,
      currentQ:      App.currentQ,
      savedAt:       Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) { /* storage full or disabled */ }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Only restore if saved within 24 hours
    if (Date.now() - (data.savedAt || 0) > 86400000) {
      clearStorage();
      return null;
    }
    return data;
  } catch (e) { return null; }
}

function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
}

function autoSaveInterval() {
  setInterval(saveToStorage, 60000); // Save every 60 seconds
}

// ═══════════════════════════════════════════════════════
//   THEME
// ═══════════════════════════════════════════════════════
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  const icon = isDark ? '🌙' : '☀️';
  document.getElementById('themeIcon').textContent     = icon;
  const examIcon = document.getElementById('themeIconExam');
  if (examIcon) examIcon.textContent = icon;
  localStorage.setItem('jee_theme', isDark ? 'light' : 'dark');
}

// ═══════════════════════════════════════════════════════
//   FILE UPLOAD UI
// ═══════════════════════════════════════════════════════
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) setSelectedFile(file);
}
function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.add('drag-over');
}
function handleDragLeave() {
  document.getElementById('uploadZone').classList.remove('drag-over');
}
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') setSelectedFile(file);
  else showToast('⚠️ Please drop a valid PDF file');
}

function setSelectedFile(file) {
  App.selectedFile = file;
  document.getElementById('fileName').textContent = file.name;
  document.getElementById('fileSize').textContent = formatBytes(file.size);
  document.getElementById('fileInfoBar').style.display = 'flex';
  document.getElementById('uploadZone').style.borderStyle = 'solid';
}

function removeFile() {
  App.selectedFile = null;
  document.getElementById('fileInfoBar').style.display = 'none';
  document.getElementById('pdfInput').value = '';
  document.getElementById('uploadZone').style.borderStyle = 'dashed';
}

function toggleKeyVisibility() {
  const inp = document.getElementById('apiKeyInput');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// ═══════════════════════════════════════════════════════
//   SCREEN MANAGEMENT
// ═══════════════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ═══════════════════════════════════════════════════════
//   PROCESSING UI HELPERS
// ═══════════════════════════════════════════════════════
function setProgress(pct, subtitle) {
  document.getElementById('procBar').style.width = pct + '%';
  if (subtitle) document.getElementById('procSubtitle').textContent = subtitle;
}

function activateStep(n) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`pStep${i}`);
    if (!el) continue;
    el.classList.remove('active', 'done');
    if (i < n) el.classList.add('done');
    if (i === n) el.classList.add('active');
  }
}

// ═══════════════════════════════════════════════════════
//   TOAST
// ═══════════════════════════════════════════════════════
let _toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ═══════════════════════════════════════════════════════
//   RESET
// ═══════════════════════════════════════════════════════
function resetApp() {
  clearInterval(App.timerInterval);
  clearStorage();
  Object.assign(App, {
    questions: [], answers: {}, qStates: {}, diagrams: {},
    currentQ: 0, currentSection: 'All',
    timerInterval: null, timerSeconds: 10800, totalSeconds: 10800,
    paletteOpen: false, reviewMode: false, isSubmitted: false, selectedFile: null,
  });
  removeFile();
  document.getElementById('apiKeyInput').value = '';
  showScreen('uploadScreen');
  filterSection('Physics', null);
}

// ═══════════════════════════════════════════════════════
//   DEMO QUESTIONS — 75 JEE-style Qs with LaTeX
// ═══════════════════════════════════════════════════════
function generateDemoQuestions() {
  const demoData = [
    // ── PHYSICS (1–25) ──────────────────────────────────
    { s:'Physics', q:'A particle moves such that its displacement is $s = 2t^2 - 4t + 5$ metres. The velocity at $t = 2$ s is:', opts:['A. 4 m/s','B. 2 m/s','C. 8 m/s','D. 0 m/s'], c:'A' },
    { s:'Physics', q:'The value of $\\int_{0}^{\\pi} \\sin x \\, dx$ equals:', opts:['A. 0','B. 1','C. 2','D. $\\pi$'], c:'C' },
    { s:'Physics', q:'Two bodies of masses $m_1$ and $m_2$ are connected by a light string. If the system accelerates at $a$, the tension in the string is:\n$$T = \\frac{m_1 m_2 (g - a)}{m_1 + m_2}$$\nFor $m_1 = 4$ kg, $m_2 = 6$ kg, $a = 2$ m/s²:', opts:['A. 48 N','B. 24 N','C. 36 N','D. 60 N'], c:'A' },
    { s:'Physics', q:'Which of the following represents the **de Broglie wavelength** of a particle of mass $m$ and kinetic energy $K$?\n$$\\lambda = \\frac{h}{\\sqrt{2mK}}$$', opts:['A. $\\dfrac{h}{\\sqrt{2mK}}$','B. $\\dfrac{h}{\\sqrt{mK}}$','C. $\\dfrac{h}{2\\sqrt{mK}}$','D. $\\dfrac{\\sqrt{2mK}}{h}$'], c:'A' },
    { s:'Physics', q:'The electric field inside a spherical shell of surface charge density $\\sigma$ is:', opts:['A. $\\dfrac{\\sigma}{\\varepsilon_0}$','B. $\\dfrac{\\sigma}{2\\varepsilon_0}$','C. Zero','D. $\\dfrac{\\sigma R}{\\varepsilon_0}$'], c:'C' },
    { s:'Physics', q:'A wire of resistance $R$ is stretched to double its original length. Its new resistance is:', opts:['A. $R/2$','B. $2R$','C. $4R$','D. $R/4$'], c:'C' },
    { s:'Physics', q:'The root mean square speed of an ideal gas molecule is $v_{rms} = \\sqrt{\\dfrac{3RT}{M}}$. If temperature doubles, $v_{rms}$ becomes:', opts:['A. $\\sqrt{2}\\,v$','B. $2v$','C. $4v$','D. $v/\\sqrt{2}$'], c:'A' },
    { s:'Physics', q:'The magnetic flux through a coil changes from $5$ Wb to $1$ Wb in $0.2$ s. The induced EMF is:', opts:['A. 10 V','B. 20 V','C. 4 V','D. 25 V'], c:'B' },
    { s:'Physics', q:'In a Young\'s double slit experiment with slit separation $d$ and screen distance $D$, the fringe width is $\\beta = \\dfrac{\\lambda D}{d}$. If $d$ is halved, $\\beta$:', opts:['A. Halves','B. Doubles','C. Quadruples','D. Unchanged'], c:'B' },
    { s:'Physics', q:'The work done in rotating a bar magnet of moment $M$ from $\\theta_1 = 0°$ to $\\theta_2 = 90°$ in uniform field $B$ is:', opts:['A. $MB$','B. $2MB$','C. $0$','D. $-MB$'], c:'A' },
    { s:'Physics', q:'The focal length of a convex lens is $20$ cm. Its power is:', opts:['A. 5 D','B. 2 D','C. 0.05 D','D. 20 D'], c:'A' },
    { s:'Physics', q:'Binding energy per nucleon is maximum for:', opts:['A. Hydrogen','B. Iron-56','C. Uranium-238','D. Helium-4'], c:'B' },
    { s:'Physics', q:'A projectile is fired at angle $\\theta$. Maximum range is at $\\theta = 45°$. Range is $R = \\dfrac{u^2 \\sin 2\\theta}{g}$. For $u = 20$ m/s, $g = 10$, max range is:', opts:['A. 40 m','B. 20 m','C. 80 m','D. 10 m'], c:'A' },
    { s:'Physics', q:'The escape velocity from Earth\'s surface is $v_e = \\sqrt{\\dfrac{2GM}{R}}$. If Earth\'s radius halves but mass unchanged, $v_e$:', opts:['A. Doubles','B. Halves','C. Increases by $\\sqrt{2}$','D. Unchanged'], c:'C' },
    { s:'Physics', q:'A capacitor of capacitance $C$ is charged to potential $V$. Energy stored is:', opts:['A. $CV^2$','B. $\\dfrac{1}{2}CV^2$','C. $\\dfrac{CV}{2}$','D. $2CV^2$'], c:'B' },
    { s:'Physics', q:'Photoelectric effect proves that light has:', opts:['A. Wave nature','B. Particle nature','C. Dual nature','D. Transverse nature'], c:'B' },
    { s:'Physics', q:'For SHM, the acceleration $a = -\\omega^2 x$. If $\\omega = 4$ rad/s and $x = 2$ cm, $|a|$ is:', opts:['A. 0.32 m/s²','B. 3.2 m/s²','C. 32 m/s²','D. 8 m/s²'], c:'A' },
    { s:'Physics', q:'The half-life of a radioactive element is 10 years. After 30 years, the fraction remaining is:', opts:['A. $1/4$','B. $1/8$','C. $1/16$','D. $1/3$'], c:'B' },
    { s:'Physics', q:'An ideal gas undergoes isothermal expansion. The internal energy:', opts:['A. Increases','B. Decreases','C. Remains unchanged','D. First increases then decreases'], c:'C' },
    { s:'Physics', q:'The Lorentz force on a charge $q$ moving with velocity $\\vec{v}$ in field $\\vec{B}$ is $\\vec{F} = q(\\vec{v} \\times \\vec{B})$. If $v \\parallel B$, force is:', opts:['A. Maximum','B. Minimum (zero)','C. $qvB$','D. $qvB/2$'], c:'B' },
    { s:'Physics', q:'For a transformer with $N_p = 100$ turns and $N_s = 2000$ turns, if input voltage is $5$ V, output voltage is:', opts:['A. 10 V','B. 50 V','C. 100 V','D. 200 V'], c:'C' },
    { s:'Physics', q:'Stefan-Boltzmann law states $P = \\sigma A T^4$. If temperature doubles, power radiated becomes:', opts:['A. 2P','B. 4P','C. 8P','D. 16P'], c:'D' },
    { s:'Physics', q:'The angle of minimum deviation for a prism equals the prism angle $A$ when the refractive index $\\mu = \\dfrac{\\sin A}{\\sin(A/2)}$. For $A = 60°$, $\\mu$:', opts:['A. $\\sqrt{2}$','B. $\\sqrt{3}$','C. $1.5$','D. $2$'], c:'B' },
    { s:'Physics', q:'Doppler effect: apparent frequency when source moves toward stationary observer is $f' = f\\left(\\dfrac{v}{v - v_s}\\right)$. It is:', opts:['A. Greater than $f$','B. Less than $f$','C. Equal to $f$','D. Zero'], c:'A' },
    { s:'Physics', q:'The work function of a metal is $2.5$ eV. The threshold wavelength for photoelectric emission is ($h = 6.6 \\times 10^{-34}$ Js):', opts:['A. 496 nm','B. 248 nm','C. 620 nm','D. 124 nm'], c:'A' },

    // ── CHEMISTRY (26–50) ───────────────────────────────
    { s:'Chemistry', q:'Which quantum number determines the shape of an orbital?', opts:['A. Principal ($n$)','B. Azimuthal ($l$)','C. Magnetic ($m_l$)','D. Spin ($m_s$)'], c:'B' },
    { s:'Chemistry', q:'The IUPAC name of $\\text{CH}_3\\text{CH}_2\\text{CHO}$ is:', opts:['A. Propanal','B. Propanone','C. Propanol','D. Propionic acid'], c:'A' },
    { s:'Chemistry', q:'van\'t Hoff factor $i$ for $\\text{K}_2\\text{SO}_4$ (fully dissociated) is:', opts:['A. 1','B. 2','C. 3','D. 4'], c:'C' },
    { s:'Chemistry', q:'Among the following, the most acidic compound is:', opts:['A. $\\text{CH}_3\\text{OH}$','B. $\\text{C}_2\\text{H}_5\\text{OH}$','C. $\\text{PhOH}$ (Phenol)','D. $\\text{ROH}$'], c:'C' },
    { s:'Chemistry', q:'The hybridization of the central atom in $\\text{PCl}_5$ is:', opts:['A. $sp^3$','B. $sp^2$','C. $sp^3d$','D. $sp^3d^2$'], c:'C' },
    { s:'Chemistry', q:'According to Hess\'s law, the enthalpy change for a reaction is:', opts:['A. Path dependent','B. Path independent','C. Always negative','D. Always positive'], c:'B' },
    { s:'Chemistry', q:'The Nernst equation for an electrochemical cell is:\n$$E = E^\\circ - \\frac{0.0592}{n}\\log Q$$\nFor $n=2$, $E^\\circ = 0.34$ V, $Q = 100$, $E$ is:', opts:['A. 0.28 V','B. 0.40 V','C. 0.22 V','D. 0.34 V'], c:'A' },
    { s:'Chemistry', q:'Which of the following is an example of a Brønsted-Lowry acid?', opts:['A. $\\text{AlCl}_3$','B. $\\text{BF}_3$','C. $\\text{HCl}$','D. $\\text{NaOH}$'], c:'C' },
    { s:'Chemistry', q:'The $\\text{pH}$ of a $0.01$ M $\\text{HCl}$ solution is:', opts:['A. 1','B. 2','C. 12','D. 7'], c:'B' },
    { s:'Chemistry', q:'Mond process is used for the purification of:', opts:['A. Copper','B. Aluminium','C. Nickel','D. Silver'], c:'C' },
    { s:'Chemistry', q:'In the reaction $\\text{N}_2 + 3\\text{H}_2 \\rightleftharpoons 2\\text{NH}_3$, the equilibrium constant expression is:', opts:['A. $K_c = \\dfrac{[\\text{NH}_3]^2}{[\\text{N}_2][\\text{H}_2]^3}$','B. $K_c = \\dfrac{[\\text{N}_2][\\text{H}_2]^3}{[\\text{NH}_3]^2}$','C. $K_c = [\\text{NH}_3]^2$','D. $K_c = [\\text{N}_2][\\text{H}_2]^3$'], c:'A' },
    { s:'Chemistry', q:'Which reagent converts primary alcohol to aldehyde selectively?', opts:['A. KMnO₄','B. PCC (Pyridinium chlorochromate)','C. Cr₂O₇²⁻/H⁺','D. Ozone'], c:'B' },
    { s:'Chemistry', q:'The geometry of $\\text{SF}_6$ is:', opts:['A. Trigonal bipyramidal','B. Octahedral','C. Square planar','D. Tetrahedral'], c:'B' },
    { s:'Chemistry', q:'Boyle\'s Law states $PV = \\text{constant}$ at constant $T$. If pressure doubles, volume:', opts:['A. Doubles','B. Halves','C. Quadruples','D. Unchanged'], c:'B' },
    { s:'Chemistry', q:'The coordination number of $\\text{Na}^+$ in NaCl crystal is:', opts:['A. 4','B. 8','C. 6','D. 12'], c:'C' },
    { s:'Chemistry', q:'Kolbe\'s reaction is used to prepare:', opts:['A. Phenol from benzene','B. Salicylic acid from sodium phenoxide','C. Aspirin from salicylic acid','D. Benzene from phenol'], c:'B' },
    { s:'Chemistry', q:'Which of the following has maximum molar conductance?', opts:['A. $\\text{CH}_3\\text{COOH}$ (0.1 M)','B. $\\text{NaCl}$ (0.1 M)','C. $\\text{KOH}$ (0.1 M)','D. $\\text{NaCl}$ at infinite dilution'], c:'D' },
    { s:'Chemistry', q:'The ore of aluminium is:', opts:['A. Galena','B. Bauxite','C. Haematite','D. Chalcopyrite'], c:'B' },
    { s:'Chemistry', q:'Lucas test distinguishes between:', opts:['A. Aldehydes and ketones','B. Primary, secondary, and tertiary alcohols','C. Acids and esters','D. Alkenes and alkynes'], c:'B' },
    { s:'Chemistry', q:'In $d$-$d$ transition, which radiations are absorbed?', opts:['A. UV','B. Visible','C. IR','D. Microwave'], c:'B' },
    { s:'Chemistry', q:'The CFSE for $\\text{[Co(NH}_3\\text{)}_6]^{3+}$ in strong field is (in terms of $\\Delta_o$):', opts:['A. $-2.4\\Delta_o$','B. $-1.6\\Delta_o$','C. $0$','D. $-0.4\\Delta_o$'], c:'A' },
    { s:'Chemistry', q:'Fehling\'s solution is used to detect:', opts:['A. Primary amines','B. Phenols','C. Aldehydes','D. Ketones'], c:'C' },
    { s:'Chemistry', q:'Which of the following is a lyophilic colloid?', opts:['A. Gold sol','B. Starch sol','C. Sulphur sol','D. AgI sol'], c:'B' },
    { s:'Chemistry', q:'Rosenmund reduction converts acid chloride to:', opts:['A. Carboxylic acid','B. Alcohol','C. Aldehyde','D. Ketone'], c:'C' },
    { s:'Chemistry', q:'The Henry\'s law constant for a gas increases with temperature. This means:', opts:['A. Solubility increases','B. Solubility decreases','C. Solubility unchanged','D. Pressure increases'], c:'B' },

    // ── MATHS (51–75) ───────────────────────────────────
    { s:'Maths', q:'The value of $\\displaystyle\\lim_{x \\to 0} \\frac{\\sin x}{x}$ is:', opts:['A. 0','B. 1','C. $\\infty$','D. Does not exist'], c:'B' },
    { s:'Maths', q:'The derivative of $\\sin^{-1}\\!\\left(\\dfrac{2x}{1+x^2}\\right)$ with respect to $\\tan^{-1}\\!\\left(\\dfrac{2x}{1-x^2}\\right)$ is:', opts:['A. $1/2$','B. $1$','C. $2$','D. $-1$'], c:'B' },
    { s:'Maths', q:'Number of solutions of $2\\sin\\theta = \\tan\\theta$ in $[0, 2\\pi]$ is:', opts:['A. 3','B. 4','C. 5','D. 2'], c:'A' },
    { s:'Maths', q:'If $A = \\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}$, then $\\det(A)$ is:', opts:['A. $-2$','B. $2$','C. $10$','D. $-10$'], c:'A' },
    { s:'Maths', q:'The area enclosed by the parabola $y^2 = 4x$ and the line $x = 1$ is:', opts:['A. $4/3$ sq.u.','B. $8/3$ sq.u.','C. $2/3$ sq.u.','D. $1$ sq.u.'], c:'B' },
    { s:'Maths', q:'The equation of the circle with centre $(2,-3)$ and radius $5$ is:\n$$(x-2)^2 + (y+3)^2 = 25$$', opts:['A. $x^2+y^2+4x-6y-12=0$','B. $x^2+y^2-4x+6y-12=0$','C. $x^2+y^2+4x+6y-12=0$','D. $x^2+y^2-4x-6y+12=0$'], c:'B' },
    { s:'Maths', q:'The sum of an infinite GP with first term $a$ and ratio $r$ ($|r|<1$) is $S = \\dfrac{a}{1-r}$. For $a=3, r=1/2$:', opts:['A. 4','B. 5','C. 6','D. 3'], c:'C' },
    { s:'Maths', q:'$\\int x\\,e^x\\,dx$ equals:', opts:['A. $e^x(x-1)+C$','B. $e^x(x+1)+C$','C. $xe^x+C$','D. $e^x-x+C$'], c:'A' },
    { s:'Maths', q:'The eccentricity of the ellipse $\\dfrac{x^2}{25}+\\dfrac{y^2}{9}=1$ is:', opts:['A. $4/5$','B. $3/5$','C. $5/4$','D. $1/2$'], c:'A' },
    { s:'Maths', q:'$^{10}C_3$ equals:', opts:['A. 90','B. 120','C. 720','D. 180'], c:'B' },
    { s:'Maths', q:'The number of ways to arrange 5 letters of the word MATHS is:', opts:['A. 24','B. 60','C. 120','D. 240'], c:'C' },
    { s:'Maths', q:'If $\\vec{a} = \\hat{i}+2\\hat{j}+3\\hat{k}$ and $\\vec{b} = 3\\hat{i}-\\hat{j}+2\\hat{k}$, then $\\vec{a}\\cdot\\vec{b}$ is:', opts:['A. 7','B. 11','C. 5','D. -7'], c:'A' },
    { s:'Maths', q:'The principal value of $\\sin^{-1}\\!\\left(-\\dfrac{1}{2}\\right)$ is:', opts:['A. $-\\pi/3$','B. $\\pi/6$','C. $-\\pi/6$','D. $5\\pi/6$'], c:'C' },
    { s:'Maths', q:'Solution of the differential equation $\\dfrac{dy}{dx} = \\dfrac{y}{x}$ is:', opts:['A. $y = cx^2$','B. $y = cx$','C. $y = c/x$','D. $xy = c$'], c:'B' },
    { s:'Maths', q:'The coefficient of $x^3$ in $(1+x)^5$ is:', opts:['A. 5','B. 10','C. 15','D. 20'], c:'B' },
    { s:'Maths', q:'If $\\log_2 x + \\log_4 x = 3$, then $x$ is:', opts:['A. 4','B. 8','C. $2^2$','D. $2^{4/3}$'], c:'B' },
    { s:'Maths', q:'The angle between the lines $y = \\sqrt{3}x + 2$ and $y = -\\sqrt{3}x + 5$ is:', opts:['A. $30°$','B. $60°$','C. $90°$','D. $45°$'], c:'C' },
    { s:'Maths', q:'$\\displaystyle\\int_0^{\\pi/2} \\sin^2 x \\, dx$ equals:', opts:['A. $\\pi/4$','B. $\\pi/2$','C. $1$','D. $0$'], c:'A' },
    { s:'Maths', q:'Roots of $x^2 - 5x + 6 = 0$ using quadratic formula $x = \\dfrac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$:', opts:['A. 2, 3','B. 1, 6','C. -2, -3','D. 1, 5'], c:'A' },
    { s:'Maths', q:'The probability of getting a sum of 7 when two dice are thrown is:', opts:['A. $1/6$','B. $5/36$','C. $7/36$','D. $1/4$'], c:'A' },
    { s:'Maths', q:'Mean of first $n$ natural numbers is:', opts:['A. $n/2$','B. $(n+1)/2$','C. $n(n+1)/2$','D. $n+1$'], c:'B' },
    { s:'Maths', q:'If $f(x) = x^3 - 3x$, then points of local minima are at:', opts:['A. $x = 1$','B. $x = -1$','C. $x = 0$','D. $x = 3$'], c:'A' },
    { s:'Maths', q:'The focus of the parabola $y^2 = 8x$ is:', opts:['A. $(2, 0)$','B. $(0, 2)$','C. $(-2, 0)$','D. $(4, 0)$'], c:'A' },
    { s:'Maths', q:'$|z|$ for $z = 3 + 4i$ is:', opts:['A. 3','B. 4','C. 5','D. 7'], c:'C' },
    { s:'Maths', q:'The vector equation of the line through $(1,2,3)$ parallel to $\\hat{i}+2\\hat{j}-3\\hat{k}$ is:\n$$\\vec{r} = (\\hat{i}+2\\hat{j}+3\\hat{k}) + \\lambda(\\hat{i}+2\\hat{j}-3\\hat{k})$$', opts:['A. $\\vec{r} = \\lambda(\\hat{i}+2\\hat{j}-3\\hat{k})$','B. As shown','C. $\\vec{r} = \\hat{i}+2\\hat{j}+3\\hat{k}$','D. None'], c:'B' },
  ];

  return demoData.map((d, i) => ({
    id: i + 1,
    subject: d.s,
    question: d.q,
    options: d.opts,
    correct: d.c,
    type: 'single',
  }));
}

// ═══════════════════════════════════════════════════════
//   INIT ON LOAD
// ═══════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  // Restore theme
  const savedTheme = localStorage.getItem('jee_theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
    const icon = savedTheme === 'dark' ? '☀️' : '🌙';
    const el = document.getElementById('themeIcon');
    if (el) el.textContent = icon;
  }

  // Handle resize (palette behavior changes)
  window.addEventListener('resize', () => {
    const panel    = document.getElementById('palettePanel');
    const backdrop = document.getElementById('paletteBackdrop');
    if (window.innerWidth >= 901) {
      if (panel) panel.classList.remove('open');
      if (backdrop) backdrop.classList.remove('active');
      document.body.style.overflow = '';
      App.paletteOpen = false;
    }
  });
});
