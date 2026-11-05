(function () {
  "use strict";

  // Must stay in step with the catch-ball-hit-bounce-catch /
  // catch-ball-throw-miss animation durations in css/styles.css. Caught: the
  // ball hits the Pokemon, bounces off, pulls it in, then drops into its
  // place. Missed: the ball deflects off. REVEAL_DELAY_MS is how long to
  // wait after that before showing the result.
  var CATCH_MS = 1600;
  var MISS_MS = 820;
  var REVEAL_DELAY_MS = 80;

  function stageMarkup(spriteUrl, spriteAlt, ballUrl) {
    return (
      '<div class="catch-stage">' +
        '<img class="catch-sprite" src="' + spriteUrl + '" alt="' + spriteAlt + '" />' +
        '<img class="catch-ball" src="' + ballUrl + '" alt="" />' +
      "</div>"
    );
  }

  // Plays either "caught" (ball hits the Pokemon, bounces off, pulls it in
  // and lands in its place) or "missed" (ball deflects off, Pokemon
  // flinches) inside `stageEl`, then calls `onDone`.
  function play(stageEl, caught, onDone) {
    requestAnimationFrame(function () {
      stageEl.classList.add(caught ? "is-caught" : "is-missed");
    });
    setTimeout(onDone, (caught ? CATCH_MS : MISS_MS) + REVEAL_DELAY_MS);
  }

  window.QwillionCatchAnim = { stageMarkup: stageMarkup, play: play };
})();
