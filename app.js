/*
 * Times Tables Trainer
 * Plain JavaScript, no frameworks. Nothing is stored or sent anywhere:
 * all state lives in memory and is gone when the page closes.
 */
(function () {
  "use strict";

  // ---------- Settings ----------
  const MIN_TABLE = 2;
  const MAX_TABLE = 15;
  const MAX_MULTIPLIER = 12;      // questions go up to 12 × the table
  const PRACTISE_QUESTIONS = 20;
  const CHALLENGE_SECONDS = 60;
  const CORRECT_PAUSE_MS = 450;   // how long the green "Correct!" shows
  const WRONG_PAUSE_MS = 1400;    // longer, so the right answer can be read
  const MAX_DIGITS = 3;           // 15 × 12 = 180

  // ---------- Small helpers ----------
  const $ = (id) => document.getElementById(id);
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // ---------- Elements ----------
  const screens = {
    setup: $("screen-setup"),
    quiz: $("screen-quiz"),
    results: $("screen-results"),
  };
  const el = {
    grid: $("table-grid"),
    hint: $("setup-hint"),
    progress: $("progress"),
    liveScore: $("live-score"),
    timerTrack: $("timer-track"),
    timerFill: $("timer-fill"),
    timerText: $("timer-text"),
    card: $("question-card"),
    question: $("question"),
    answer: $("answer"),
    feedback: $("feedback"),
    keypad: $("keypad"),
    resultsTitle: $("results-title"),
    resultsMode: $("results-mode"),
    scoreBig: $("score-big"),
    scorePct: $("score-pct"),
    scoreMsg: $("score-msg"),
    wrongList: $("wrong-list"),
    allRight: $("all-right"),
    retryWrong: $("retry-wrong"),
  };

  // ---------- State (memory only) ----------
  const selected = new Set();
  let game = null;   // the current round, or null when not playing
  let lastSetup = null; // remembers mode + question source for "Play again"

  // ---------- Screen switching ----------
  function show(name) {
    Object.entries(screens).forEach(([key, node]) => {
      node.classList.toggle("active", key === name);
    });
    window.scrollTo(0, 0);
  }

  // ---------- Setup screen ----------
  function buildTableChips() {
    for (let t = MIN_TABLE; t <= MAX_TABLE; t++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = t + "×";
      b.dataset.table = t;
      b.setAttribute("aria-pressed", "false");
      b.setAttribute("aria-label", t + " times table");
      b.addEventListener("click", () => toggleTable(t));
      el.grid.appendChild(b);
    }
  }

  function toggleTable(t, force) {
    const on = force !== undefined ? force : !selected.has(t);
    if (on) selected.add(t); else selected.delete(t);
    const chip = el.grid.querySelector('[data-table="' + t + '"]');
    chip.setAttribute("aria-pressed", String(on));
    el.hint.textContent = "";
  }

  function setAll(on) {
    for (let t = MIN_TABLE; t <= MAX_TABLE; t++) toggleTable(t, on);
  }

  function startFromSetup(mode) {
    if (selected.size === 0) {
      el.hint.textContent = "Choose at least one table first.";
      return;
    }
    lastSetup = { mode, tables: Array.from(selected).sort((a, b) => a - b), retryList: null };
    startGame(lastSetup);
  }

  // ---------- Making questions ----------
  function makeQuestion(tables, previous) {
    // Pick a random table and multiplier, avoiding an exact repeat of the last question.
    let q;
    let tries = 0;
    do {
      const table = tables[randInt(0, tables.length - 1)];
      const n = randInt(1, MAX_MULTIPLIER);
      // Mix the order so students see both "7 × 8" and "8 × 7".
      q = Math.random() < 0.5 ? { a: n, b: table } : { a: table, b: n };
      tries++;
    } while (previous && q.a === previous.a && q.b === previous.b && tries < 10);
    return q;
  }

  // ---------- Game ----------
  function startGame(setup) {
    const isChallenge = setup.mode === "challenge";
    game = {
      mode: setup.mode,
      tables: setup.tables,
      queue: setup.retryList ? shuffle(setup.retryList) : null, // fixed list when re-trying mistakes
      total: setup.retryList ? setup.retryList.length : (isChallenge ? Infinity : PRACTISE_QUESTIONS),
      asked: 0,
      correct: 0,
      wrong: [],
      current: null,
      input: "",
      locked: false,
      endsAt: isChallenge ? Date.now() + CHALLENGE_SECONDS * 1000 : 0,
      timerId: null,
      pauseId: null,
    };

    el.timerTrack.hidden = !isChallenge;
    if (isChallenge) {
      el.timerFill.classList.remove("low");
      el.timerFill.style.transition = "none";
      el.timerFill.style.transform = "scaleX(1)";
      el.timerText.textContent = CHALLENGE_SECONDS;
      // Re-enable the smooth animation on the next frame.
      requestAnimationFrame(() => { el.timerFill.style.transition = ""; });
      game.timerId = setInterval(tick, 200);
    }

    show("quiz");
    nextQuestion();
  }

  function tick() {
    if (!game) return;
    const msLeft = Math.max(0, game.endsAt - Date.now());
    const secs = Math.ceil(msLeft / 1000);
    el.timerText.textContent = secs;
    el.timerFill.style.transform = "scaleX(" + (msLeft / (CHALLENGE_SECONDS * 1000)) + ")";
    el.timerFill.classList.toggle("low", secs <= 10);
    if (msLeft <= 0) endGame();
  }

  function nextQuestion() {
    if (!game) return;
    if (game.asked >= game.total) { endGame(); return; }

    game.current = game.queue ? game.queue[game.asked] : makeQuestion(game.tables, game.current);
    game.input = "";
    game.locked = false;

    el.card.classList.remove("correct", "wrong");
    el.feedback.textContent = "";
    el.question.textContent = game.current.a + " × " + game.current.b;
    renderAnswer();
    renderStatus();
  }

  function renderAnswer() {
    el.answer.innerHTML = game.input
      ? String(game.input)
      : '<span class="placeholder">?</span>';
  }

  function renderStatus() {
    const n = game.asked + 1;
    el.progress.textContent = game.total === Infinity ? "Q " + n : "Q " + n + "/" + game.total;
    el.liveScore.textContent = "✓ " + game.correct;
  }

  function pressKey(key) {
    if (!game || game.locked) return;
    if (key === "del") {
      game.input = game.input.slice(0, -1);
    } else if (key === "go") {
      submit();
      return;
    } else if (/^\d$/.test(key)) {
      if (game.input.length >= MAX_DIGITS) return;
      if (game.input === "0") game.input = ""; // no leading zeros
      game.input += key;
    }
    renderAnswer();
  }

  function submit() {
    if (!game || game.locked || game.input === "") return;
    const { a, b } = game.current;
    const right = a * b;
    const given = parseInt(game.input, 10);
    game.asked++;
    game.locked = true;

    if (given === right) {
      game.correct++;
      el.card.classList.add("correct");
      el.feedback.textContent = "Correct!";
      vibrate(30);
    } else {
      game.wrong.push({ a, b, given, right });
      el.card.classList.add("wrong");
      el.feedback.textContent = a + " × " + b + " = " + right;
      vibrate([60, 40, 60]);
    }
    el.liveScore.textContent = "✓ " + game.correct;
    game.pauseId = setTimeout(nextQuestion, given === right ? CORRECT_PAUSE_MS : WRONG_PAUSE_MS);
  }

  function vibrate(pattern) {
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* ignore */ } }
  }

  function quit() {
    if (!game) return;
    if (game.asked === 0) { stopTimers(); game = null; show("setup"); return; }
    endGame();
  }

  function stopTimers() {
    if (!game) return;
    clearInterval(game.timerId);
    clearTimeout(game.pauseId);
  }

  // ---------- Results ----------
  function endGame() {
    if (!game) return;
    stopTimers();
    const g = game;
    game = null;

    const pct = g.asked ? Math.round((g.correct / g.asked) * 100) : 0;
    el.scoreBig.textContent = g.correct + " / " + g.asked;
    el.scorePct.textContent = pct + "%";

    let title, msg;
    if (g.asked === 0) { title = "Time's up!"; msg = "Try answering a few next time."; }
    else if (pct === 100) { title = "Perfect!"; msg = "Every single one right."; }
    else if (pct >= 80) { title = "Great work!"; msg = "Nearly there — check the ones below."; }
    else if (pct >= 50) { title = "Good effort!"; msg = "Practise your mistakes to lock them in."; }
    else { title = "Keep going!"; msg = "Practising your mistakes is the fastest way to improve."; }
    el.resultsTitle.textContent = title;
    el.scoreMsg.textContent = msg;

    const tablesText = g.queue ? "your mistakes" : g.tables.map((t) => t + "×").join(", ");
    el.resultsMode.textContent = (g.mode === "challenge" ? "Challenge · 60 seconds · " : "Practise · ") + tablesText;

    // "Questions I got wrong" list
    el.wrongList.innerHTML = "";
    g.wrong.forEach((w) => {
      const li = document.createElement("li");
      li.innerHTML =
        '<span class="q">' + w.a + " × " + w.b + "</span>" +
        '<span><span class="yours" aria-label="You said ' + w.given + '">' + w.given + "</span> " +
        '<span class="right" aria-label="Correct answer ' + w.right + '">' + w.right + "</span></span>";
      el.wrongList.appendChild(li);
    });
    el.allRight.hidden = g.wrong.length > 0 || g.asked === 0;
    el.retryWrong.hidden = g.wrong.length === 0;

    // Keep a de-duplicated list of mistakes for "Practise my mistakes".
    const seen = new Set();
    lastSetup.mistakes = g.wrong
      .filter((w) => { const k = w.a + "x" + w.b; if (seen.has(k)) return false; seen.add(k); return true; })
      .map((w) => ({ a: w.a, b: w.b }));

    show("results");
  }

  // ---------- Wiring up buttons and keys ----------
  function init() {
    buildTableChips();
    $("select-all").addEventListener("click", () => setAll(true));
    $("select-none").addEventListener("click", () => setAll(false));
    $("start-practise").addEventListener("click", () => startFromSetup("practise"));
    $("start-challenge").addEventListener("click", () => startFromSetup("challenge"));
    $("quit").addEventListener("click", quit);
    $("go-home").addEventListener("click", () => show("setup"));
    $("play-again").addEventListener("click", () => {
      startGame({ mode: lastSetup.mode, tables: lastSetup.tables, retryList: null });
    });
    el.retryWrong.addEventListener("click", () => {
      if (!lastSetup.mistakes || !lastSetup.mistakes.length) return;
      startGame({ mode: "practise", tables: lastSetup.tables, retryList: lastSetup.mistakes });
    });

    // Number pad: pointerdown feels instant on phones (no 300 ms delay).
    el.keypad.addEventListener("pointerdown", (e) => {
      const btn = e.target.closest(".key");
      if (!btn) return;
      e.preventDefault();
      pressKey(btn.dataset.key);
    });
    // Keyboard users who tab to a key and press Enter/Space still get a click.
    el.keypad.addEventListener("click", (e) => {
      const btn = e.target.closest(".key");
      if (btn && e.detail === 0) pressKey(btn.dataset.key);
    });

    // Physical keyboard support (laptops, tablets with keyboards).
    document.addEventListener("keydown", (e) => {
      if (!screens.quiz.classList.contains("active")) return;
      let key = null;
      if (/^\d$/.test(e.key)) key = e.key;
      else if (e.key === "Backspace" || e.key === "Delete") key = "del";
      else if (e.key === "Enter") key = "go";
      else if (e.key === "Escape") { quit(); return; }
      if (!key) return;
      e.preventDefault();
      const btn = el.keypad.querySelector('[data-key="' + key + '"]');
      if (btn) { btn.classList.add("pressed"); setTimeout(() => btn.classList.remove("pressed"), 100); }
      pressKey(key);
    });
  }

  init();

  // ---------- Offline support ----------
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => { /* app still works online */ });
    });
  }
})();
