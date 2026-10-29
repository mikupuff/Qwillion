(function () {
  "use strict";

  var card = document.getElementById("devQuizCard");
  var questionEl = document.getElementById("devQuizQuestion");
  var formEl = document.getElementById("devQuizForm");
  var inputEl = document.getElementById("devQuizInput");
  var feedbackEl = document.getElementById("devQuizFeedback");
  var nextBtn = document.getElementById("devQuizNext");

  var quiz = null;

  function renderQuestion() {
    var q = quiz.nextQuestion();
    questionEl.textContent = q.text;
    feedbackEl.innerHTML = "";
    feedbackEl.removeAttribute("data-state");
    inputEl.value = "";
    inputEl.disabled = false;
    inputEl.focus();
  }

  function renderWrong(message) {
    feedbackEl.setAttribute("data-state", "wrong");
    feedbackEl.innerHTML = '<p class="feedback-message">' + message + "</p>";
  }

  function renderCorrect(result) {
    feedbackEl.setAttribute("data-state", "correct");
    feedbackEl.innerHTML =
      '<div class="catch-result">' +
        '<img class="catch-sprite" src="' + result.spriteUrl + '" alt="' + result.pokemon.name + '" />' +
        '<div class="catch-info">' +
          '<p class="catch-name">' + result.pokemon.name + '</p>' +
          '<p class="catch-stat">' + result.detail + "</p>" +
          '<div class="catch-tier">' +
            '<img class="tier-ball" src="' + result.tierSprite + '" alt="" />' +
            '<div class="catch-tier-text">' +
              '<p class="catch-tier-label" style="color:' + result.tierColor + '">' + result.tierLabel + '</p>' +
              '<p class="catch-tier-desc">' + result.tierDescription + '</p>' +
            '</div>' +
          '</div>' +
        "</div>" +
      "</div>";
    inputEl.disabled = true;
  }

  formEl.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!quiz || inputEl.disabled) return;
    var guess = inputEl.value.trim();
    if (!guess) return;

    var result = quiz.submitGuess(guess);
    if (result.ok) {
      renderCorrect(result);
      return;
    }

    if (result.reason === "unknown") {
      renderWrong("Never heard of “" + result.guess + "” — try another Pokémon.");
    } else if (result.reason === "wrong") {
      renderWrong(result.message);
    }
  });

  nextBtn.addEventListener("click", function () {
    if (quiz) renderQuestion();
  });

  function loadQuiz() {
    try {
      var stats = window.QWILLION_POKEMON_STATS;
      var survey = window.QWILLION_SURVEY_2019;
      var bulbapedia = window.QWILLION_BULBAPEDIA_2026;
      var googletrends = window.QWILLION_GOOGLETRENDS;
      if (!stats || !survey || !bulbapedia || !googletrends) throw new Error("quiz data scripts not loaded");

      quiz = new window.QwillionQuiz({ stats: stats, survey: survey, bulbapedia: bulbapedia, googletrends: googletrends });
      card.removeAttribute("aria-busy");
      renderQuestion();
    } catch (err) {
      questionEl.textContent = "Couldn't load the quiz data. Try reloading the page.";
      card.removeAttribute("aria-busy");
      console.error("Qwillion: failed to load quiz data", err);
    }
  }

  loadQuiz();
})();
