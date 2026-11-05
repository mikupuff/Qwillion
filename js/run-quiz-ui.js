(function () {
  "use strict";

  var RUN_LENGTH = 6;
  var REVEAL_STAGGER_MS = 900;
  var REVEAL_SHAKE_MS = 450;
  var BALL_POKE = "assets/balls/poke-ball.png";

  var card = document.getElementById("runQuizCard");
  var progressEl = document.getElementById("runProgress");
  var questionEl = document.getElementById("runQuestion");
  var formEl = document.getElementById("runForm");
  var inputEl = document.getElementById("runInput");
  var feedbackEl = document.getElementById("runFeedback");
  var continueBtn = document.getElementById("runContinue");

  var ballKeyEl = document.getElementById("ballKey");
  var teamRailSlots = document.getElementById("teamRailSlots");

  var teamReveal = document.getElementById("teamReveal");
  var teamGrid = document.getElementById("teamGrid");
  var playAgainBtn = document.getElementById("playAgainBtn");

  var quiz = null;
  var awaitingContinue = false;

  // ---------- Ball key: every tier in rarity order, joined by a line; the
  // tier you just caught lights up, with its name and description. ----------

  function buildBallKey() {
    var tiers = window.QwillionQuiz.TIERS;
    var items = tiers.map(function (t) {
      return '<li class="ball-key-item" data-tier="' + t.key + '" style="--tier-color:' + t.color + '">' +
        '<img src="' + t.sprite + '" alt="' + t.label + '" title="' + t.label + '" />' +
        '<span class="ball-key-points">' + t.points + "</span>" +
      "</li>";
    }).join("");
    ballKeyEl.innerHTML =
      '<ol class="ball-key-row">' + items + "</ol>" +
      '<p class="ball-key-caption"><span class="ball-key-label"></span><span class="ball-key-gain"></span><span class="ball-key-desc"></span></p>';
    setBallKey(null);
  }

  function setBallKey(tierKey) {
    var tiers = window.QwillionQuiz.TIERS;
    var litIndex = -1;
    tiers.forEach(function (t, i) { if (t.key === tierKey) litIndex = i; });
    ballKeyEl.querySelectorAll(".ball-key-item").forEach(function (item, i) {
      item.classList.toggle("is-lit", i === litIndex);
      item.classList.toggle("is-passed", litIndex >= 0 && i < litIndex);
    });
    // How far the connecting line fills: up to the lit ball.
    var row = ballKeyEl.querySelector(".ball-key-row");
    row.style.setProperty("--fill", litIndex < 0 ? "0" : String(litIndex / (tiers.length - 1)));
    var label = ballKeyEl.querySelector(".ball-key-label");
    var desc = ballKeyEl.querySelector(".ball-key-desc");
    var gain = ballKeyEl.querySelector(".ball-key-gain");
    if (litIndex < 0) {
      gain.textContent = "";
      ballKeyEl.classList.remove("has-lit");
      label.textContent = "Catch rarity";
      label.style.color = "";
      desc.textContent = "common → one in a Qwillion";
    } else {
      var tier = tiers[litIndex];
      ballKeyEl.classList.add("has-lit");
      label.textContent = tier.label;
      label.style.color = tier.color;
      gain.textContent = "+" + tier.points;
      desc.textContent = tier.description;
    }
  }

  // ---------- Team rail: six slots that fill in as you catch. ----------

  function resetTeamRail() {
    var html = "";
    for (var i = 0; i < RUN_LENGTH; i++) {
      html += '<li class="team-rail-slot is-empty"><span class="team-rail-placeholder" aria-hidden="true"></span>' +
        '<span class="visually-hidden">Empty slot</span></li>';
    }
    teamRailSlots.innerHTML = html;
  }

  function addToTeamRail(member, index) {
    var slot = teamRailSlots.children[index];
    if (!slot) return;
    slot.className = "team-rail-slot is-filled";
    slot.innerHTML =
      '<img class="team-rail-sprite" src="' + member.spriteUrl + '" alt="" />' +
      '<span class="team-rail-text">' +
        '<span class="team-rail-name">' + member.pokemon.name + "</span>" +
        '<span class="team-rail-tier" style="color:' + member.tierColor + '">' +
          '<img src="' + member.tierSprite + '" alt="" />' + member.tierLabel + " +" + member.tierPoints +
        "</span>" +
      "</span>";
  }

  function setProgress(index, total) {
    progressEl.innerHTML = "Question " + index + " of " + total +
      '<span class="run-score">' + quiz.getRunScore() + " pts</span>";
  }

  function renderQuestion(q) {
    setBallKey(null);
    setProgress(q.index, q.total);
    questionEl.textContent = q.text;
    feedbackEl.innerHTML = "";
    feedbackEl.removeAttribute("data-state");
    inputEl.value = "";
    inputEl.disabled = false;
    continueBtn.hidden = true;
    awaitingContinue = false;
    inputEl.focus();
  }

  function renderUnknown(guess) {
    feedbackEl.setAttribute("data-state", "wrong");
    feedbackEl.innerHTML = '<p class="feedback-message">Never heard of “' + guess + '” — try another Pokémon.</p>';
  }

  function renderMiss(result) {
    feedbackEl.setAttribute("data-state", "wrong");
    feedbackEl.innerHTML =
      '<div class="catch-result catch-result-miss">' +
        window.QwillionCatchAnim.stageMarkup(result.spriteUrl, result.pokemon.name, BALL_POKE) +
        '<div class="catch-info"><p class="feedback-message">' + result.message + "</p></div>" +
      "</div>";
    var resultEl = feedbackEl.firstElementChild;
    window.QwillionCatchAnim.play(resultEl.querySelector(".catch-stage"), false, function () {
      resultEl.classList.add("is-revealed");
    });
  }

  function renderCaught(caught, isLastQuestion) {
    var teamIndex = quiz.run.team.length - 1;
    feedbackEl.setAttribute("data-state", "correct");
    feedbackEl.innerHTML =
      '<div class="catch-result">' +
        window.QwillionCatchAnim.stageMarkup(caught.spriteUrl, caught.pokemon.name, caught.tierSprite) +
        '<div class="catch-info">' +
          '<p class="catch-name">' + caught.pokemon.name + '</p>' +
          '<p class="catch-stat">' + caught.detail + "</p>" +
        "</div>" +
      "</div>";
    inputEl.disabled = true;
    continueBtn.hidden = true;
    awaitingContinue = false;

    var resultEl = feedbackEl.firstElementChild;
    window.QwillionCatchAnim.play(resultEl.querySelector(".catch-stage"), true, function () {
      resultEl.classList.add("is-revealed");
      if (window.QwillionFeatured) window.QwillionFeatured.show(caught.pokemon.id);
      setBallKey(caught.tierKey);
      setProgress(quiz.run.index + 1, quiz.run.length);
      addToTeamRail(caught, teamIndex);
      continueBtn.hidden = false;
      continueBtn.textContent = isLastQuestion ? "See my team →" : "Continue →";
      awaitingContinue = true;
    });
  }

  formEl.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!quiz || inputEl.disabled || awaitingContinue) return;
    var guess = inputEl.value.trim();
    if (!guess) return;

    var result = quiz.submitRunGuess(guess);
    if (result.ok) {
      renderCaught(result.caught, result.isLastQuestion);
      return;
    }

    if (result.reason === "unknown") {
      renderUnknown(result.guess);
    } else if (result.reason === "wrong" || result.reason === "used") {
      renderMiss(result);
    }
  });

  continueBtn.addEventListener("click", function () {
    if (!quiz || !awaitingContinue) return;
    var adv = quiz.advanceRun();
    if (adv.done) {
      showTeamReveal(adv.team, adv.score, adv.maxScore);
    } else {
      renderQuestion(adv);
    }
  });

  function buildTeamSlot(member) {
    var slot = document.createElement("div");
    slot.className = "team-slot";
    slot.innerHTML =
      '<div class="team-slot-art">' +
        '<img class="team-ball" src="' + member.tierSprite + '" alt="" />' +
        '<img class="team-pokemon" src="' + member.spriteUrl + '" alt="' + member.pokemon.name + '" />' +
      "</div>" +
      '<p class="team-slot-name">' + member.pokemon.name + "</p>" +
      '<p class="team-slot-tier" style="color:' + member.tierColor + '">' + member.tierLabel + "</p>" +
      '<p class="team-slot-points">+' + member.tierPoints + "</p>";
    return slot;
  }

  // Counts the final score up from 0 (in chunky steps, to match the pixel
  // look), with depth = points x 10 m, like Krillion.
  function showScore(score, maxScore) {
    var valueEl = document.getElementById("teamScoreValue");
    var depthEl = document.getElementById("teamScoreDepth");
    var maxEl = document.getElementById("teamScoreMax");
    var scoreEl = document.getElementById("teamScore");
    maxEl.textContent = "out of " + maxScore;
    scoreEl.classList.add("is-shown");
    function paint(v) {
      valueEl.textContent = v;
      depthEl.textContent = (v * 10).toLocaleString() + " m deep";
    }
    var reduce = document.body.getAttribute("data-reduce-motion") === "true" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || score === 0) { paint(score); return; }
    var steps = 20, step = 0;
    var timer = setInterval(function () {
      step++;
      paint(Math.round(score * step / steps));
      if (step >= steps) clearInterval(timer);
    }, 45);
  }

  function showTeamReveal(team, score, maxScore) {
    card.hidden = true;
    document.getElementById("teamScore").classList.remove("is-shown");
    document.getElementById("teamScoreValue").textContent = "0";
    document.getElementById("teamScoreDepth").textContent = "0 m deep";
    teamGrid.innerHTML = "";
    var slots = team.map(function (member) {
      var slot = buildTeamSlot(member);
      teamGrid.appendChild(slot);
      return slot;
    });
    teamReveal.hidden = false;

    slots.forEach(function (slot, index) {
      var startAt = index * REVEAL_STAGGER_MS;
      setTimeout(function () { slot.classList.add("shaking"); }, startAt);
      setTimeout(function () {
        slot.classList.remove("shaking");
        slot.classList.add("revealed");
      }, startAt + REVEAL_SHAKE_MS);
    });
    setTimeout(function () { showScore(score, maxScore); }, team.length * REVEAL_STAGGER_MS + 200);
  }

  playAgainBtn.addEventListener("click", function () {
    teamReveal.hidden = true;
    card.hidden = false;
    startNewRun();
  });

  function startNewRun() {
    resetTeamRail();
    var q = quiz.startRun(RUN_LENGTH);
    renderQuestion(q);
  }

  function loadQuiz() {
    try {
      var stats = window.QWILLION_POKEMON_STATS;
      var survey = window.QWILLION_SURVEY_2019;
      var bulbapedia = window.QWILLION_BULBAPEDIA_2026;
      var googletrends = window.QWILLION_GOOGLETRENDS;
      if (!stats || !survey || !bulbapedia || !googletrends) throw new Error("quiz data scripts not loaded");

      quiz = new window.QwillionQuiz({ stats: stats, survey: survey, bulbapedia: bulbapedia, googletrends: googletrends });
      card.removeAttribute("aria-busy");
      buildBallKey();
      startNewRun();
    } catch (err) {
      questionEl.textContent = "Couldn't load the quiz data. Try reloading the page.";
      card.removeAttribute("aria-busy");
      console.error("Qwillion: failed to load run quiz data", err);
    }
  }

  loadQuiz();
})();
