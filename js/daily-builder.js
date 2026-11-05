(function () {
  "use strict";

  // Dev mode: a password gate (checked by dev_server.py, not in the browser)
  // in front of the daily-game builder and the practice quiz.

  var GAME_LENGTH = 6;
  var TOKEN_KEY = "qwillion:devToken";
  var SMALL_POOL = 15;

  var $ = function (id) { return document.getElementById(id); };
  var gate = $("devGate");
  var gateMsg = $("devGateMsg");
  var passwordEl = $("devPassword");
  var unlocked = $("devUnlocked");
  var tabBuilder = $("devTabBuilder");
  var tabPractice = $("devTabPractice");
  var builderPanel = $("devBuilderPanel");
  var practicePanel = $("devPracticePanel");
  var dateEl = $("dailyDate");
  var dateNote = $("dailyDateNote");
  var scheduledEl = $("dailyScheduled");
  var slotsEl = $("dailySlots");
  var warningsEl = $("dailyWarnings");
  var statusEl = $("dailyStatus");
  var publishBtn = $("dailyPublish");
  var deleteBtn = $("dailyDelete");

  var quiz = null;
  var options = null;
  var specs = [];
  var publishedDates = [];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function getToken() {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  function setToken(t) {
    try {
      if (t) sessionStorage.setItem(TOKEN_KEY, t);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* storage unavailable: stays unlocked for this page load only */ }
    memoryToken = t;
  }
  var memoryToken = getToken();

  // ---------- Gate ----------

  function showUnlocked(isUnlocked) {
    gate.hidden = isUnlocked;
    unlocked.hidden = !isUnlocked;
    if (isUnlocked) initBuilder();
  }

  gate.addEventListener("submit", function (e) {
    e.preventDefault();
    var password = passwordEl.value;
    if (!password) return;
    gateMsg.textContent = "Checking…";
    fetch("/api/dev/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: password })
    }).then(function (res) {
      if (res.status === 404 || res.status === 501) throw new Error("no-server");
      return res.json().then(function (body) { return { status: res.status, body: body }; });
    }).then(function (r) {
      if (r.status !== 200) {
        gateMsg.textContent = r.body.error || "Wrong password.";
        return;
      }
      passwordEl.value = "";
      gateMsg.textContent = "";
      setToken(r.body.token);
      showUnlocked(true);
    }).catch(function () {
      gateMsg.textContent = "Dev server isn't running. Start it with: python dev_server.py";
    });
  });

  $("devLock").addEventListener("click", function () {
    setToken(null);
    showUnlocked(false);
  });

  function selectTab(builder) {
    tabBuilder.setAttribute("aria-selected", String(builder));
    tabPractice.setAttribute("aria-selected", String(!builder));
    builderPanel.hidden = !builder;
    practicePanel.hidden = builder;
  }
  tabBuilder.addEventListener("click", function () { selectTab(true); });
  tabPractice.addEventListener("click", function () { selectTab(false); });

  // ---------- Builder ----------

  function localDateString(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function initBuilder() {
    if (quiz) return;
    try {
      quiz = new window.QwillionQuiz({
        stats: window.QWILLION_POKEMON_STATS,
        survey: window.QWILLION_SURVEY_2019,
        bulbapedia: window.QWILLION_BULBAPEDIA_2026,
        googletrends: window.QWILLION_GOOGLETRENDS
      });
    } catch (err) {
      statusEl.textContent = "Couldn't load the quiz data.";
      console.error("Qwillion: daily builder failed to load", err);
      return;
    }
    options = quiz.questionOptions();
    for (var i = 0; i < GAME_LENGTH; i++) specs.push(quiz.randomSpec());
    renderAllSlots();
    refreshScheduled().then(function () {
      // Default to today (so publishing changes what the site opens with
      // right away), or the next day without a daily if today has one.
      var d = new Date();
      while (publishedDates.indexOf(localDateString(d)) !== -1) d.setDate(d.getDate() + 1);
      dateEl.value = localDateString(d);
      onDateChange();
    });
  }

  function selectHtml(role, items, selected) {
    return '<select class="dev-select" data-role="' + role + '">' + items.map(function (it) {
      return '<option value="' + esc(it.key) + '"' + (String(it.key) === String(selected) ? " selected" : "") + ">" + esc(it.label) + "</option>";
    }).join("") + "</select>";
  }

  function paramsHtml(spec) {
    if (spec.kind === "stat") {
      var stat = options.stats.filter(function (s) { return s.key === spec.stat; })[0];
      return selectHtml("stat", options.stats, spec.stat) +
        selectHtml("direction", [{ key: "higher", label: "higher than" }, { key: "lower", label: "lower than" }], spec.direction) +
        '<input type="number" class="quiz-input dev-input dev-number" data-role="value" value="' + spec.value +
          '" min="' + stat.min + '" max="' + stat.max + '" step="1" aria-label="Threshold" />' +
        '<p class="dev-suggest">Suggested: ' + stat.suggested.map(function (v) {
          return '<button type="button" class="dev-chip" data-role="suggest" data-value="' + v + '">' + v + "</button>";
        }).join("") + ' <span class="dev-note">(range ' + stat.min + "–" + stat.max + ")</span></p>";
    }
    if (spec.kind === "region") return selectHtml("region", options.regions, spec.region);
    if (spec.kind === "type-has") return selectHtml("type", options.types, spec.type);
    if (spec.kind === "stage") return selectHtml("stage", options.stages, spec.stage);
    if (spec.kind === "type-exact") {
      var first = spec.types[0];
      var firstInfo = options.types.filter(function (t) { return t.key === first; })[0];
      var second = [];
      if (firstInfo.hasMonotype) second.push({ key: "", label: "(none — mono-type)" });
      quiz.dualPartnersOf(first).forEach(function (t) { second.push({ key: t, label: t.charAt(0).toUpperCase() + t.slice(1) }); });
      return selectHtml("type1", options.types, first) + " / " + selectHtml("type2", second, spec.types[1] || "");
    }
    return '<p class="dev-note">No settings for this structure.</p>';
  }

  function previewHtml(spec) {
    var p;
    try { p = quiz.previewQuestion(spec); } catch (err) {
      return '<p class="dev-error">' + esc(err.message) + "</p>";
    }
    var tiers = window.QwillionQuiz.TIERS;
    var rows = tiers.slice().reverse().map(function (t) {
      var names = p.byTier[t.key];
      // Show the most obscure few for the rare tiers, the most popular for the rest.
      var sample = (t.key === "master" || t.key === "ultra") ? names.slice(-3).reverse() : names.slice(0, 3);
      return '<li><img src="' + t.sprite + '" alt="" /><span class="dev-tier-count" style="color:' + t.color + '">' + names.length + "</span>" +
        '<span class="dev-tier-names">' + esc(sample.join(", ")) + (names.length > sample.length ? "…" : "") + "</span></li>";
    }).join("");
    return '<p class="dev-preview-text">' + esc(p.text) + "</p>" +
      '<p class="dev-pool' + (p.poolSize === 0 ? " dev-error" : p.poolSize < SMALL_POOL ? " dev-warn" : "") + '">' +
        p.poolSize + " valid answer" + (p.poolSize === 1 ? "" : "s") + "</p>" +
      '<ul class="dev-tiers">' + rows + "</ul>";
  }

  function slotHtml(i) {
    var spec = specs[i];
    return '<div class="dev-slot-head"><span class="quiz-kicker">Question ' + (i + 1) + "</span>" +
        '<button type="button" class="dev-chip" data-role="random" title="Randomize this question">&#8635; random</button></div>' +
      '<label class="dev-field"><span class="dev-label">Structure</span>' +
        selectHtml("kind", options.kinds.map(function (k) { return { key: k.kind, label: k.label }; }), spec.kind) + "</label>" +
      '<div class="dev-params">' + paramsHtml(spec) + "</div>" +
      '<div class="dev-preview">' + previewHtml(spec) + "</div>";
  }

  function renderSlot(i) {
    slotsEl.children[i].innerHTML = slotHtml(i);
    renderWarnings();
  }

  function renderAllSlots() {
    slotsEl.innerHTML = "";
    for (var i = 0; i < GAME_LENGTH; i++) {
      var li = document.createElement("li");
      li.className = "quiz-card dev-slot";
      li.dataset.index = i;
      slotsEl.appendChild(li);
      li.innerHTML = slotHtml(i);
    }
    renderWarnings();
  }

  function slotIndexOf(el) {
    var li = el.closest(".dev-slot");
    return li ? Number(li.dataset.index) : -1;
  }

  slotsEl.addEventListener("change", function (e) {
    var i = slotIndexOf(e.target);
    if (i < 0) return;
    var role = e.target.dataset.role;
    var v = e.target.value;
    var spec = specs[i];
    if (role === "kind") specs[i] = quiz.randomSpec(v);
    else if (role === "stat") {
      spec.stat = v;
      var s = options.stats.filter(function (x) { return x.key === v; })[0];
      spec.value = s.suggested[Math.floor(s.suggested.length / 2)];
    }
    else if (role === "direction") spec.direction = v;
    else if (role === "value") spec.value = Math.round(Number(v));
    else if (role === "region") spec.region = v;
    else if (role === "type") spec.type = v;
    else if (role === "stage") spec.stage = Number(v);
    else if (role === "type1") {
      var info = options.types.filter(function (t) { return t.key === v; })[0];
      var partners = quiz.dualPartnersOf(v);
      var keep = spec.types[1];
      if (keep && partners.indexOf(keep) !== -1) spec.types = [v, keep];
      else spec.types = info.hasMonotype ? [v] : [v, partners[0]];
    }
    else if (role === "type2") spec.types = v ? [spec.types[0], v] : [spec.types[0]];
    else return;
    renderSlot(i);
  });

  // Live preview while typing a threshold, without re-rendering the input.
  slotsEl.addEventListener("input", function (e) {
    if (e.target.dataset.role !== "value") return;
    var i = slotIndexOf(e.target);
    var n = Number(e.target.value);
    if (e.target.value === "" || !isFinite(n)) return;
    specs[i].value = Math.round(n);
    slotsEl.children[i].querySelector(".dev-preview").innerHTML = previewHtml(specs[i]);
    renderWarnings();
  });

  slotsEl.addEventListener("click", function (e) {
    var btn = e.target.closest("button");
    if (!btn) return;
    var i = slotIndexOf(btn);
    if (btn.dataset.role === "random") {
      specs[i] = quiz.randomSpec(specs[i].kind);
      renderSlot(i);
    } else if (btn.dataset.role === "suggest") {
      specs[i].value = Number(btn.dataset.value);
      renderSlot(i);
    }
  });

  $("dailyRandomAll").addEventListener("click", function () {
    for (var i = 0; i < GAME_LENGTH; i++) specs[i] = quiz.randomSpec();
    renderAllSlots();
  });

  // Problems with the current six. Errors block publishing; warnings don't.
  function problems() {
    var errors = [];
    var warnings = [];
    var seen = {};
    specs.forEach(function (spec, i) {
      var label = "Q" + (i + 1);
      var p;
      try { p = quiz.previewQuestion(spec); } catch (err) {
        errors.push(label + ": " + err.message);
        return;
      }
      if (p.poolSize === 0) errors.push(label + " has no valid answers.");
      else if (p.poolSize < SMALL_POOL) warnings.push(label + " only has " + p.poolSize + " answers.");
      var key = JSON.stringify(spec);
      if (seen[key] !== undefined) warnings.push(label + " is the same question as Q" + (seen[key] + 1) + ".");
      else seen[key] = i;
    });
    var date = dateEl.value;
    if (!date) errors.push("Pick a date.");
    else if (date < localDateString(new Date())) warnings.push("That date is in the past.");
    return { errors: errors, warnings: warnings };
  }

  function renderWarnings() {
    var pr = problems();
    warningsEl.innerHTML = pr.errors.map(function (m) { return '<li class="dev-error">' + esc(m) + "</li>"; }).join("") +
      pr.warnings.map(function (m) { return '<li class="dev-warn">' + esc(m) + "</li>"; }).join("");
    publishBtn.disabled = pr.errors.length > 0;
  }

  // ---------- Dates and publishing ----------

  function refreshScheduled() {
    return fetch("/api/daily").then(function (r) { return r.ok ? r.json() : { dates: [] }; })
      .catch(function () { return { dates: [] }; })
      .then(function (body) {
        publishedDates = body.dates || [];
        var today = localDateString(new Date());
        var upcoming = publishedDates.filter(function (d) { return d >= today; });
        scheduledEl.innerHTML = upcoming.length
          ? '<span class="dev-label">Published:</span> ' + upcoming.map(function (d) {
              return '<button type="button" class="dev-chip" data-date="' + d + '">' + d + "</button>";
            }).join("")
          : '<span class="dev-note">No upcoming dailies published yet.</span>';
      });
  }

  scheduledEl.addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-date]");
    if (!btn) return;
    dateEl.value = btn.dataset.date;
    onDateChange();
  });

  function onDateChange() {
    var date = dateEl.value;
    var isPublished = publishedDates.indexOf(date) !== -1;
    deleteBtn.hidden = !isPublished;
    statusEl.textContent = "";
    if (!isPublished) {
      dateNote.textContent = date ? "Nothing published for " + date + " yet." : "";
      renderWarnings();
      return;
    }
    dateNote.textContent = "Loading the published game for " + date + "…";
    fetch("data/daily/" + date + ".json", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (game) {
        if (!Array.isArray(game.questions) || game.questions.length !== GAME_LENGTH) throw new Error("bad file");
        specs = game.questions.map(function (q) { return JSON.parse(JSON.stringify(q)); });
        renderAllSlots();
        dateNote.textContent = "Editing the published game for " + date + ". Publishing again overwrites it.";
      })
      .catch(function (err) {
        dateNote.textContent = "Couldn't load the published game for " + date + " (" + err.message + ").";
      });
  }
  dateEl.addEventListener("change", onDateChange);

  function authed(method, url, body) {
    return fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + memoryToken },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (b) {
        if (res.status === 401) {
          setToken(null);
          showUnlocked(false);
          gateMsg.textContent = "Session expired (server restarted?). Unlock again — your picks are kept.";
        }
        if (!res.ok) throw new Error(b.error || "HTTP " + res.status);
        return b;
      });
    });
  }

  publishBtn.addEventListener("click", function () {
    var pr = problems();
    if (pr.errors.length) return;
    var date = dateEl.value;
    var overwriting = publishedDates.indexOf(date) !== -1;
    if (overwriting && !window.confirm("Overwrite the published daily for " + date + "?")) return;
    statusEl.textContent = "Publishing…";
    authed("POST", "/api/daily", { date: date, questions: specs, publishedAt: new Date().toISOString() })
      .then(function () {
        statusEl.textContent = date === localDateString(new Date())
          ? "Published. This is now the game the site opens with today."
          : "Published the daily for " + date + ". The site opens with it on that date.";
        return refreshScheduled().then(function () { deleteBtn.hidden = false; });
      })
      .catch(function (err) { statusEl.textContent = "Publish failed: " + err.message; });
  });

  deleteBtn.addEventListener("click", function () {
    var date = dateEl.value;
    if (!window.confirm("Unpublish the daily for " + date + "? Players will get a random dive that day.")) return;
    authed("DELETE", "/api/daily/" + date)
      .then(function () {
        statusEl.textContent = "Unpublished " + date + ".";
        return refreshScheduled().then(onDateChange);
      })
      .catch(function (err) { statusEl.textContent = "Unpublish failed: " + err.message; });
  });

  $("dailyDownload").addEventListener("click", function () {
    var date = dateEl.value || "undated";
    var blob = new Blob([JSON.stringify({ date: date, questions: specs }, null, 2) + "\n"], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = date + ".json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  showUnlocked(!!memoryToken);
})();
