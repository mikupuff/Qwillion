(function () {
  "use strict";

  var STAT_LABELS = {
    "hp": "HP",
    "attack": "Attack",
    "defense": "Defense",
    "special-attack": "Sp. Atk",
    "special-defense": "Sp. Def",
    "speed": "Speed"
  };
  var STAT_KEYS = Object.keys(STAT_LABELS);

  var ORDINAL_WORDS = ["", "first", "second", "third", "fourth", "fifth", "sixth"];

  // Regional-form entries (region + baseName set in the data) accept their
  // base name with the region prefix/suffix in either noun or adjective
  // form: "Raichu-Alola", "Raichu-Alolan", "Alola Raichu", "Alolan Raichu".
  var REGION_ADJECTIVE = {
    "alola": "alolan",
    "galar": "galarian",
    "hisui": "hisuian",
    "paldea": "paldean"
  };

  // Higher/lower stat questions stay the most common. Exact type match
  // ("is X/Y type") is kept intentionally light since most types have far
  // more valid dual-type partners than a single monotype option, which
  // otherwise buries monotype questions under dual-type ones; "has X type"
  // (any Pokemon containing that type, mono or dual) covers that simpler,
  // more common case instead.
  var QUESTION_KIND_WEIGHTS = [
    { kind: "stat", weight: 0.35 },
    { kind: "type-has", weight: 0.20 },
    { kind: "type-exact", weight: 0.15 },
    { kind: "stage", weight: 0.20 },
    { kind: "no-evolve", weight: 0.10 },
    { kind: "has-mega", weight: 0.12 }
  ];

  // Three popularity signals, blended by weight. Bulbapedia's 2026 ranking is
  // the current site-engagement signal (partial coverage so far, ~400/1028).
  // Google Trends search interest (poke-trends.com) is the most complete
  // (1,025/1,025) and continuous, with a generation-bias correction already
  // applied upstream (newer Pokemon get less raw search volume simply for
  // having existed for less of the 2004-2026 window). The 2019 favorite-
  // Pokemon survey is the oldest and least complete (dex #1-809 only), so it
  // gets the smallest weight.
  var BULBAPEDIA_WEIGHT = 0.40;
  var GOOGLETRENDS_WEIGHT = 0.35;
  var SURVEY_WEIGHT = 0.25;
  var UNRANKED_POPULARITY = 0.95; // not in any list -> treat as obscure

  // Tiers are assigned per-question, relative only to the Pokemon that
  // actually satisfy that question's condition (not against the whole
  // roster). Within that pool, sorted from most to least popular, each tier
  // is a cumulative slice measured from the obscure end: Master Ball is the
  // most-obscure 5% of the pool (rounded up, at least one guaranteed), Ultra
  // Ball the next slice up to 12%, Great Ball up to 25%, Premier Ball up to
  // 50%, and Poké Ball the remaining (most popular) half.
  var TIER_DEFS = [
    { key: "poke", label: "Poké Ball", sprite: "assets/balls/poke-ball.png", description: "common answer.", color: "#ff4444" },
    { key: "premier", label: "Premier Ball", sprite: "assets/balls/premier-ball.png", description: "solid pick.", color: "#ffb3c6" },
    { key: "great", label: "Great Ball", sprite: "assets/balls/great-ball.png", description: "good find.", color: "#4fa3e3" },
    { key: "ultra", label: "Ultra Ball", sprite: "assets/balls/ultra-ball.png", description: "rare pull.", color: "#ffcc33" },
    { key: "master", label: "Master Ball", sprite: "assets/balls/master-ball.png", description: "one in a Qwillion.", color: "#c77dff" }
  ];
  var MASTER_BALL_FRACTION = 0.05;
  var CUMULATIVE_CEILING = { ultra: 0.12, great: 0.25, premier: 0.50 };

  function randInt(n) {
    return Math.floor(Math.random() * n);
  }

  function pickWeightedKind() {
    var total = QUESTION_KIND_WEIGHTS.reduce(function (sum, e) { return sum + e.weight; }, 0);
    var roll = Math.random() * total;
    var cumulative = 0;
    for (var i = 0; i < QUESTION_KIND_WEIGHTS.length; i++) {
      cumulative += QUESTION_KIND_WEIGHTS[i].weight;
      if (roll < cumulative) return QUESTION_KIND_WEIGHTS[i].kind;
    }
    return QUESTION_KIND_WEIGHTS[QUESTION_KIND_WEIGHTS.length - 1].kind;
  }

  function titleCase(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  function ordinalWord(stage) {
    return ORDINAL_WORDS[stage] || (stage + "th");
  }

  function normalizeName(name) {
    return name
      .replace(/♂/g, "m")
      .replace(/♀/g, "f")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function spriteUrl(id) {
    return "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/" + id + ".png";
  }

  function tierDefByKey(key) {
    for (var i = 0; i < TIER_DEFS.length; i++) {
      if (TIER_DEFS[i].key === key) return TIER_DEFS[i];
    }
    return TIER_DEFS[0];
  }

  // pool: array of { id, popularityScore } for every Pokemon that satisfies
  // the current question. Returns a Map of id -> tier def, rebalanced
  // relative only to this pool.
  function assignPoolTiers(pool) {
    var sorted = pool.slice().sort(function (a, b) { return b.popularityScore - a.popularityScore; });
    var n = sorted.length;
    var masterCount = Math.max(1, Math.ceil(MASTER_BALL_FRACTION * n));

    var byId = new Map();
    sorted.forEach(function (entry, index) {
      var rank = index + 1; // 1 = most obscure
      var rarityFraction = rank / n;
      var key;
      if (rank <= masterCount) key = "master";
      else if (rarityFraction <= CUMULATIVE_CEILING.ultra) key = "ultra";
      else if (rarityFraction <= CUMULATIVE_CEILING.great) key = "great";
      else if (rarityFraction <= CUMULATIVE_CEILING.premier) key = "premier";
      else key = "poke";
      byId.set(entry.id, tierDefByKey(key));
    });
    return byId;
  }

  function QwillionQuiz(dataset) {
    this.byId = new Map();
    this.byNormalizedName = new Map();
    dataset.stats.pokemon.forEach(function (p) {
      this.byId.set(p.id, p);
      this.byNormalizedName.set(normalizeName(p.name), p);
      if (p.region) {
        var region = p.region;
        var adjective = REGION_ADJECTIVE[region];
        [
          p.baseName + "-" + region,
          p.baseName + "-" + adjective,
          region + " " + p.baseName,
          adjective + " " + p.baseName
        ].forEach(function (alias) {
          this.byNormalizedName.set(normalizeName(alias), p);
        }, this);
      }
    }, this);

    this.statSummary = dataset.stats.statSummary;
    this.popularity = this._buildPopularity(dataset.survey, dataset.bulbapedia, dataset.googletrends);
    this._buildTypeIndex();
    this._buildStageIndex();
    this.current = null;
  }

  function percentileMap(entries) {
    var total = entries.length;
    var map = new Map();
    entries.forEach(function (e) {
      map.set(e.id, (e.rank - 1) / Math.max(1, total - 1));
    });
    return map;
  }

  QwillionQuiz.prototype._buildPopularity = function (survey, bulbapedia, googletrends) {
    var surveyPercentile = percentileMap(survey);
    var bulbaPercentile = percentileMap(bulbapedia);
    var trendsPercentile = percentileMap(googletrends);

    var sources = [
      { map: bulbaPercentile, weight: BULBAPEDIA_WEIGHT },
      { map: trendsPercentile, weight: GOOGLETRENDS_WEIGHT },
      { map: surveyPercentile, weight: SURVEY_WEIGHT }
    ];

    // Regional-form Pokemon aren't tracked separately by any of the three
    // popularity sources (they're all keyed by base species), so a regional
    // form inherits its base species' popularity score rather than falling
    // back to "unranked/obscure" by default.
    var scores = new Map();
    this.byId.forEach(function (p, id) {
      var lookupId = p.baseSpeciesId || id;
      var weightedSum = 0;
      var weightTotal = 0;
      sources.forEach(function (source) {
        if (source.map.has(lookupId)) {
          weightedSum += source.map.get(lookupId) * source.weight;
          weightTotal += source.weight;
        }
      });
      scores.set(id, weightTotal > 0 ? weightedSum / weightTotal : UNRANKED_POPULARITY);
    });
    return scores;
  };

  // Builds the set of type signatures that actually exist among real
  // Pokemon: which single types have at least one monotype Pokemon, and
  // which unordered type pairs have at least one dual-type Pokemon. Type
  // questions only ever draw from these - no combo is ever asked about
  // unless a real Pokemon has it.
  QwillionQuiz.prototype._buildTypeIndex = function () {
    var typesSeen = new Set();
    var monotypeSet = new Set();
    var dualPairSet = new Set();

    this.byId.forEach(function (p) {
      p.types.forEach(function (t) { typesSeen.add(t); });
      if (p.types.length === 1) {
        monotypeSet.add(p.types[0]);
      } else if (p.types.length === 2) {
        dualPairSet.add(p.types.slice().sort().join("|"));
      }
    });

    this.allTypes = Array.from(typesSeen).sort();
    this.monotypeSet = monotypeSet;
    this.dualPairSet = dualPairSet;
  };

  QwillionQuiz.prototype._buildStageIndex = function () {
    var stages = new Set();
    this.byId.forEach(function (p) {
      if (p.stage) stages.add(p.stage);
    });
    this.stageNumbers = Array.from(stages).sort(function (a, b) { return a - b; });
  };

  QwillionQuiz.prototype._tiersForStat = function (statKey) {
    var summary = this.statSummary[statKey];
    var mean = summary.mean;
    var stdev = summary.stdev;
    var round = Math.round;
    return [
      round(mean),
      round(mean + 0.5 * stdev),
      round(mean - 0.5 * stdev),
      round(mean + 1.0 * stdev),
      round(mean - 1.0 * stdev)
    ];
  };

  QwillionQuiz.prototype._idsWhere = function (predicate) {
    var ids = [];
    this.byId.forEach(function (pokemon, id) {
      if (predicate(pokemon)) ids.push(id);
    });
    return ids;
  };

  QwillionQuiz.prototype._statQuestion = function () {
    var statKey, tiers, x, direction, poolIds;
    var attempts = 0;
    do {
      statKey = STAT_KEYS[randInt(STAT_KEYS.length)];
      tiers = this._tiersForStat(statKey);
      x = tiers[randInt(tiers.length)];
      direction = Math.random() < 0.5 ? "higher" : "lower";
      poolIds = this._idsWhere(matchesStat);
      attempts++;
    } while (poolIds.length === 0 && attempts < 20);

    var statLabel = STAT_LABELS[statKey];

    function matchesStat(p) {
      var v = p.stats[statKey];
      return direction === "higher" ? v > x : v < x;
    }

    return {
      text: "Name a Pokémon with " + direction + " than " + x + " " + statLabel + ".",
      poolIds: poolIds,
      checker: matchesStat,
      detail: function (p) { return statLabel + ": " + p.stats[statKey]; },
      wrongMessage: function (p) {
        return p.name + "'s " + statLabel + " is " + p.stats[statKey] +
          " — not " + direction + " than " + x + ". Try again.";
      }
    };
  };

  QwillionQuiz.prototype._dualPartnersOf = function (x) {
    var self = this;
    return this.allTypes.filter(function (t) {
      return t !== x && self.dualPairSet.has([x, t].sort().join("|"));
    });
  };

  // Exact type-match question: "is X/Y type" (or monotype "is X type"). When
  // a type has both a monotype Pokemon and dual-type partners, it's a fair
  // coin flip between the two - otherwise it's whichever actually exists.
  QwillionQuiz.prototype._typeExactQuestion = function () {
    var x, y, dualPartners;
    var attempts = 0;
    do {
      x = this.allTypes[randInt(this.allTypes.length)];
      var hasMonotype = this.monotypeSet.has(x);
      dualPartners = this._dualPartnersOf(x);
      if (hasMonotype && dualPartners.length > 0) {
        y = Math.random() < 0.5 ? null : dualPartners[randInt(dualPartners.length)];
      } else if (hasMonotype) {
        y = null;
      } else if (dualPartners.length > 0) {
        y = dualPartners[randInt(dualPartners.length)];
      } else {
        y = undefined;
      }
      attempts++;
    } while (y === undefined && attempts < 20);

    var targetSet = y === null ? new Set([x]) : new Set([x, y]);
    var label = y === null ? titleCase(x) + " type" : titleCase(x) + "/" + titleCase(y) + " type";

    function matchesType(p) {
      if (p.types.length !== targetSet.size) return false;
      for (var i = 0; i < p.types.length; i++) {
        if (!targetSet.has(p.types[i])) return false;
      }
      return true;
    }

    return {
      text: "Name a Pokémon that is " + label + ".",
      poolIds: this._idsWhere(matchesType),
      checker: matchesType,
      detail: function (p) { return p.types.map(titleCase).join("/") + " type"; },
      wrongMessage: function (p) {
        return p.name + " is " + p.types.map(titleCase).join("/") +
          " type — not " + label + ". Try again.";
      }
    };
  };

  // Looser type question: "has X type" - any Pokemon carrying that type,
  // whether it's their only type or one of two.
  QwillionQuiz.prototype._typeHasQuestion = function () {
    var x = this.allTypes[randInt(this.allTypes.length)];
    var label = titleCase(x) + " type";

    function matchesHas(p) { return p.types.indexOf(x) !== -1; }

    return {
      text: "Name a Pokémon that has " + label + ".",
      poolIds: this._idsWhere(matchesHas),
      checker: matchesHas,
      detail: function (p) { return p.types.map(titleCase).join("/") + " type"; },
      wrongMessage: function (p) {
        return p.name + " is " + p.types.map(titleCase).join("/") +
          " type — it doesn't have " + label + ". Try again.";
      }
    };
  };

  QwillionQuiz.prototype._stageQuestion = function () {
    var stageNumber = this.stageNumbers[randInt(this.stageNumbers.length)];
    var ordinal = ordinalWord(stageNumber);

    function matchesStage(p) { return p.stage === stageNumber; }

    return {
      text: "Name a " + ordinal + "-stage Pokémon.",
      poolIds: this._idsWhere(matchesStage),
      checker: matchesStage,
      detail: function (p) { return titleCase(ordinalWord(p.stage)) + "-stage"; },
      wrongMessage: function (p) {
        if (p.doesNotEvolve) {
          return p.name + " doesn't evolve at all — it's not a " + ordinal + "-stage Pokémon. Try again.";
        }
        return p.name + " is a " + ordinalWord(p.stage) + "-stage Pokémon — not " + ordinal + ". Try again.";
      }
    };
  };

  QwillionQuiz.prototype._noEvolveQuestion = function () {
    function matchesNoEvolve(p) { return p.doesNotEvolve === true; }

    return {
      text: "Name a Pokémon that does not evolve (Mega Evolutions don't count).",
      poolIds: this._idsWhere(matchesNoEvolve),
      checker: matchesNoEvolve,
      detail: function () { return "Doesn't evolve"; },
      wrongMessage: function (p) {
        return p.name + " is part of an evolution line — it's not a stand-alone Pokémon. Try again.";
      }
    };
  };

  QwillionQuiz.prototype._hasMegaQuestion = function () {
    function matchesHasMega(p) { return p.hasMegaEvolution === true; }

    return {
      text: "Name a Pokémon that has a Mega Evolution.",
      poolIds: this._idsWhere(matchesHasMega),
      checker: matchesHasMega,
      detail: function () { return "Has a Mega Evolution"; },
      wrongMessage: function (p) {
        return p.name + " doesn't have a Mega Evolution. Try again.";
      }
    };
  };

  QwillionQuiz.prototype._generateWithKind = function () {
    var kind = pickWeightedKind();
    var generated;
    if (kind === "stat") generated = this._statQuestion();
    else if (kind === "type-exact") generated = this._typeExactQuestion();
    else if (kind === "type-has") generated = this._typeHasQuestion();
    else if (kind === "stage") generated = this._stageQuestion();
    else if (kind === "has-mega") generated = this._hasMegaQuestion();
    else generated = this._noEvolveQuestion();
    generated.kind = kind;
    return generated;
  };

  QwillionQuiz.prototype._toQuestionState = function (generated) {
    var popularity = this.popularity;
    var pool = generated.poolIds.map(function (id) {
      var score = popularity.get(id);
      return { id: id, popularityScore: score === undefined ? UNRANKED_POPULARITY : score };
    });
    return {
      kind: generated.kind,
      text: generated.text,
      poolIds: generated.poolIds,
      checker: generated.checker,
      detail: generated.detail,
      wrongMessage: generated.wrongMessage,
      tierByPokemonId: assignPoolTiers(pool),
      poolSize: pool.length
    };
  };

  QwillionQuiz.prototype.nextQuestion = function () {
    this.current = this._toQuestionState(this._generateWithKind());
    return { text: this.current.text, poolSize: this.current.poolSize, kind: this.current.kind };
  };

  QwillionQuiz.prototype._checkGuess = function (rawName, state) {
    var key = normalizeName(rawName);
    if (!key) {
      return { ok: false, reason: "empty" };
    }
    var pokemon = this.byNormalizedName.get(key);
    if (!pokemon) {
      return { ok: false, reason: "unknown", guess: rawName };
    }
    if (!state.checker(pokemon)) {
      return { ok: false, reason: "wrong", message: state.wrongMessage(pokemon) };
    }
    return { ok: true, pokemon: pokemon, state: state };
  };

  QwillionQuiz.prototype.submitGuess = function (rawName) {
    if (!this.current) throw new Error("No active question");
    var result = this._checkGuess(rawName, this.current);
    if (!result.ok) return result;

    var pokemon = result.pokemon;
    var tier = this.current.tierByPokemonId.get(pokemon.id);
    return {
      ok: true,
      pokemon: pokemon,
      detail: this.current.detail(pokemon),
      tierLabel: tier.label,
      tierSprite: tier.sprite,
      tierDescription: tier.description,
      tierColor: tier.color,
      poolSize: this.current.poolSize,
      spriteUrl: spriteUrl(pokemon.id)
    };
  };

  // --- Run mode: a fixed-length quiz (e.g. 6 questions) where no Pokemon
  // can be used as an answer more than once across the whole run. ---

  QwillionQuiz.prototype.startRun = function (length) {
    length = length || 6;
    var usedIds = new Set();
    var questions = [];
    for (var i = 0; i < length; i++) {
      var attempts = 0;
      var generated;
      do {
        generated = this._generateWithKind();
        attempts++;
        // generated.poolIds.every(...) is vacuously true for an empty pool
        // too, so this single check covers both "no valid answers at all"
        // and "every valid answer is already caught earlier this run".
      } while (
        generated.poolIds.every(function (id) { return usedIds.has(id); }) &&
        attempts < 30
      );
      questions.push(this._toQuestionState(generated));
    }

    this.run = {
      questions: questions,
      usedPokemonIds: usedIds,
      team: [],
      index: 0,
      length: length
    };

    var first = questions[0];
    return { text: first.text, poolSize: first.poolSize, kind: first.kind, index: 1, total: length };
  };

  QwillionQuiz.prototype.submitRunGuess = function (rawName) {
    if (!this.run) throw new Error("No active run");
    var state = this.run.questions[this.run.index];
    var key = normalizeName(rawName);
    if (!key) return { ok: false, reason: "empty" };

    var pokemon = this.byNormalizedName.get(key);
    if (!pokemon) return { ok: false, reason: "unknown", guess: rawName };

    if (this.run.usedPokemonIds.has(pokemon.id)) {
      return {
        ok: false,
        reason: "used",
        message: pokemon.name + " is already on your team this run — try a different Pokémon."
      };
    }

    var result = this._checkGuess(rawName, state);
    if (!result.ok) return result;

    var tier = state.tierByPokemonId.get(pokemon.id);
    var caught = {
      pokemon: pokemon,
      detail: state.detail(pokemon),
      tierLabel: tier.label,
      tierSprite: tier.sprite,
      tierDescription: tier.description,
      tierColor: tier.color,
      spriteUrl: spriteUrl(pokemon.id)
    };

    this.run.usedPokemonIds.add(pokemon.id);
    this.run.team.push(caught);

    return {
      ok: true,
      caught: caught,
      poolSize: state.poolSize,
      isLastQuestion: this.run.index === this.run.length - 1
    };
  };

  QwillionQuiz.prototype.advanceRun = function () {
    if (!this.run) throw new Error("No active run");
    this.run.index++;
    if (this.run.index >= this.run.length) {
      return { done: true, team: this.run.team.slice() };
    }
    var state = this.run.questions[this.run.index];
    return {
      done: false,
      text: state.text,
      poolSize: state.poolSize,
      kind: state.kind,
      index: this.run.index + 1,
      total: this.run.length
    };
  };

  QwillionQuiz.prototype.getRunTeam = function () {
    return this.run ? this.run.team.slice() : [];
  };

  window.QwillionQuiz = QwillionQuiz;
})();
