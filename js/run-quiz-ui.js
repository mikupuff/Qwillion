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

  var teamReveal = document.getElementById("teamReveal");
  var teamGrid = document.getElementById("teamGrid");
  var playAgainBtn = document.getElementById("playAgainBtn");

  var quiz = null;
  var awaitingContinue = false;

  function renderQuestion(q) {
    progressEl.textContent = "Question " + q.index + " of " + q.total;
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
    feedbackEl.setAttribute("data-state", "correct");
    feedbackEl.innerHTML =
      '<div class="catch-result">' +
        window.QwillionCatchAnim.stageMarkup(caught.spriteUrl, caught.pokemon.name, caught.tierSprite) +
        '<div class="catch-info">' +
          '<p class="catch-name">' + caught.pokemon.name + '</p>' +
          '<p class="catch-stat">' + caught.detail + "</p>" +
          '<div class="catch-tier">' +
            '<img class="tier-ball" src="' + caught.tierSprite + '" alt="" />' +
            '<div class="catch-tier-text">' +
              '<p class="catch-tier-label" style="color:' + caught.tierColor + '">' + caught.tierLabel + '</p>' +
              '<p class="catch-tier-desc">' + caught.tierDescription + '</p>' +
            '</div>' +
          '</div>' +
        "</div>" +
      "</div>";
    inputEl.disabled = true;
    continueBtn.hidden = true;
    awaitingContinue = false;

    var resultEl = feedbackEl.firstElementChild;
    window.QwillionCatchAnim.play(resultEl.querySelector(".catch-stage"), true, function () {
      resultEl.classList.add("is-revealed");
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
      showTeamReveal(adv.team);
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
      '<p class="team-slot-tier" style="color:' + member.tierColor + '">' + member.tierLabel + "</p>";
    return slot;
  }

  function showTeamReveal(team) {
    card.hidden = true;
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
  }

  playAgainBtn.addEventListener("click", function () {
    teamReveal.hidden = true;
    card.hidden = false;
    startNewRun();
  });

  function startNewRun() {
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
      startNewRun();
    } catch (err) {
      questionEl.textContent = "Couldn't load the quiz data. Try reloading the page.";
      card.removeAttribute("aria-busy");
      console.error("Qwillion: failed to load run quiz data", err);
    }
  }

  loadQuiz();
})();
