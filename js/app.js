(function () {
  "use strict";

  function wireDialog(triggerId, dialogId, closeId) {
    var trigger = document.getElementById(triggerId);
    var dialog = document.getElementById(dialogId);
    var close = document.getElementById(closeId);
    if (!trigger || !dialog || !close) return;
    trigger.addEventListener("click", function () { dialog.showModal(); });
    close.addEventListener("click", function () { dialog.close(); });
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog) dialog.close();
    });
  }

  wireDialog("menuTrigger", "menuDialog", "menuClose");
  wireDialog("settingsTrigger", "settingsDialog", "settingsClose");

  (function wireViewSwitch() {
    var mainView = document.getElementById("mainView");
    var devModeView = document.getElementById("devModeView");
    var navMainView = document.getElementById("navMainView");
    var navDevMode = document.getElementById("navDevMode");
    var menuDialog = document.getElementById("menuDialog");
    if (!mainView || !devModeView || !navMainView || !navDevMode) return;

    function showView(name) {
      var showingMain = name === "main";
      mainView.hidden = !showingMain;
      devModeView.hidden = showingMain;
      if (showingMain) {
        navMainView.setAttribute("aria-current", "page");
        navDevMode.removeAttribute("aria-current");
      } else {
        navDevMode.setAttribute("aria-current", "page");
        navMainView.removeAttribute("aria-current");
      }
      if (menuDialog) menuDialog.close();
    }

    navMainView.addEventListener("click", function (e) { e.preventDefault(); showView("main"); });
    navDevMode.addEventListener("click", function (e) { e.preventDefault(); showView("dev"); });
  })();

  var reduceMotionToggle = document.getElementById("reduceMotionToggle");
  var highContrastToggle = document.getElementById("highContrastToggle");

  try {
    if (localStorage.getItem("qwillion:reduceMotion") === "true") {
      reduceMotionToggle.checked = true;
      document.body.setAttribute("data-reduce-motion", "true");
    }
    if (localStorage.getItem("qwillion:highContrast") === "true") {
      highContrastToggle.checked = true;
      document.body.setAttribute("data-contrast", "high");
    }
  } catch (e) { /* storage unavailable, ignore */ }

  if (reduceMotionToggle) {
    reduceMotionToggle.addEventListener("change", function () {
      document.body.setAttribute("data-reduce-motion", String(reduceMotionToggle.checked));
      try { localStorage.setItem("qwillion:reduceMotion", String(reduceMotionToggle.checked)); } catch (e) {}
    });
  }
  if (highContrastToggle) {
    highContrastToggle.addEventListener("change", function () {
      document.body.setAttribute("data-contrast", highContrastToggle.checked ? "high" : "normal");
      try { localStorage.setItem("qwillion:highContrast", String(highContrastToggle.checked)); } catch (e) {}
    });
  }

  var STATUS_LINES = ["descending…", "scanning the trench…", "surfacing the catch…"];
  var statusLine = document.getElementById("statusLine");
  var statusIndex = 0;
  setInterval(function () {
    statusIndex = (statusIndex + 1) % STATUS_LINES.length;
    if (statusLine) statusLine.textContent = STATUS_LINES[statusIndex];
  }, 3200);

  function titleCase(str) {
    return str.replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  async function loadQwilfish() {
    var card = document.getElementById("dexCard");
    try {
      var [pokemonRes, speciesRes] = await Promise.all([
        fetch("https://pokeapi.co/api/v2/pokemon/qwilfish"),
        fetch("https://pokeapi.co/api/v2/pokemon-species/qwilfish")
      ]);
      if (!pokemonRes.ok || !speciesRes.ok) throw new Error("PokeAPI request failed");
      var pokemon = await pokemonRes.json();
      var species = await speciesRes.json();

      document.getElementById("dexNumber").textContent = "#" + String(pokemon.id).padStart(3, "0");
      document.getElementById("dexName").textContent = titleCase(pokemon.name);

      var typesEl = document.getElementById("dexTypes");
      typesEl.innerHTML = "";
      pokemon.types.forEach(function (t) {
        var chip = document.createElement("span");
        chip.className = "type-chip";
        chip.textContent = t.type.name;
        typesEl.appendChild(chip);
      });

      var flavorEntry = species.flavor_text_entries.find(function (f) { return f.language.name === "en"; });
      document.getElementById("dexFlavor").textContent = flavorEntry
        ? flavorEntry.flavor_text.replace(/[\n\f\r]/g, " ")
        : "No Pokédex entry available.";

      var statsEl = document.getElementById("dexStats");
      statsEl.innerHTML = "";
      pokemon.stats.forEach(function (s) {
        var row = document.createElement("div");
        row.className = "stat-row";

        var label = document.createElement("p");
        label.className = "stat-label";
        label.textContent = titleCase(s.stat.name);

        var bar = document.createElement("div");
        bar.className = "stat-bar";
        var fill = document.createElement("div");
        fill.className = "stat-bar-fill";
        bar.appendChild(fill);

        var value = document.createElement("p");
        value.className = "stat-value";
        value.textContent = s.base_stat;

        row.appendChild(label);
        row.appendChild(bar);
        row.appendChild(value);
        statsEl.appendChild(row);

        requestAnimationFrame(function () {
          fill.style.width = Math.min(100, (s.base_stat / 180) * 100) + "%";
        });
      });

      document.getElementById("dexHeight").textContent = (pokemon.height / 10) + " m";
      document.getElementById("dexWeight").textContent = (pokemon.weight / 10) + " kg";
      document.getElementById("dexAbilities").textContent = pokemon.abilities
        .map(function (a) { return titleCase(a.ability.name) + (a.is_hidden ? " (hidden)" : ""); })
        .join(", ");

      card.removeAttribute("aria-busy");
    } catch (err) {
      document.getElementById("dexFlavor").textContent =
        "Couldn't reach the Pokédex right now. Check your connection and reload.";
      card.removeAttribute("aria-busy");
      console.error("Qwillion: failed to load Qwilfish data", err);
    }
  }

  loadQwilfish();
})();
