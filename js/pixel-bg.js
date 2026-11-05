// Qwillion's background: an original, procedurally drawn pixel-art reef
// (water bands, light rays, distant ridges, sand, rocks, coral, kelp, fish
// and bubbles). Everything here is drawn by this file - no third-party art -
// so it's free to use however the project likes.
//
// The scene is drawn into a small canvas (one canvas pixel = PIXEL CSS px)
// and scaled up with image-rendering: pixelated, so it stays crisp and
// chunky at any screen size. Animation runs at a deliberately low frame
// rate for a retro feel, and freezes on a single frame when reduced motion
// is on (OS setting or the in-app toggle).
(function () {
  "use strict";

  var FPS = 12;

  // Top (surface) to bottom (deep) - drawn as hard bands with a dithered
  // seam between each pair, like a limited-palette sprite.
  var WATER = ["#2a9fc0", "#2189ad", "#1b749a", "#166187", "#125074", "#0f4162", "#0c3451", "#0a2942", "#082034", "#061828"];
  var RIDGE_FAR = "#0e3d5c";
  var RIDGE_NEAR = "#0a2c45";
  var SAND = { top: "#f0d488", body: "#d1aa62", shade: "#ad8547", deep: "#8a6838", speck: "#f7e4ac" };
  var ROCK = { body: "#35536b", light: "#56809c", dark: "#223a4e" };
  var CORAL = [
    { body: "#ff7a6b", tip: "#ffb3a3" },
    { body: "#f2a33a", tip: "#ffd98a" },
    { body: "#d4609e", tip: "#ffa3d1" }
  ];
  var TUBE = { body: "#8a5cc7", rim: "#c9a3ff" };
  var KELP = { body: "#1f7d52", light: "#3fb06e", dark: "#145a3a" };
  var FISH_COLORS = ["#ffd35c", "#7ff0e0", "#ff8f7a", "#c6f27a"];
  var FISH_FAR = "#0f4466";
  var BUBBLE = { body: "#bff3ff", light: "#ffffff" };

  // A right-facing fish, 6x3: # body, e eye, . empty.
  var FISH_SHAPE = ["#.###.", "####e#", "#.###."];

  var canvas = document.createElement("canvas");
  canvas.className = "pixel-bg";
  canvas.setAttribute("aria-hidden", "true");
  document.body.insertBefore(canvas, document.body.firstChild);
  var ctx = canvas.getContext("2d");

  var staticLayer = document.createElement("canvas");
  var sctx = staticLayer.getContext("2d");

  var W = 0, H = 0, PIXEL = 4;
  var floorTop = 0;
  var kelps = [], fish = [], bubbles = [], vents = [], rays = [];
  var rand = mulberry32(1);

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function ri(min, max) { return Math.floor(min + rand() * (max - min + 1)); }
  function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }

  function px(c, x, y, color) {
    c.fillStyle = color;
    c.fillRect(x, y, 1, 1);
  }

  function floorY(x) {
    return Math.round(floorTop + Math.sin(x * 0.045) * 2 + Math.sin(x * 0.012 + 1.3) * 3);
  }

  function ridgeY(x, base, amp, f1, f2, phase) {
    var v = Math.sin(x * f1 + phase) * amp + Math.sin(x * f2 + phase * 2.1) * amp * 0.6;
    return Math.round(base + v);
  }

  // ---------- Static scenery (redrawn only on resize) ----------

  function drawWater(c) {
    var bandH = H / WATER.length;
    for (var i = 0; i < WATER.length; i++) {
      var y0 = Math.floor(i * bandH);
      var y1 = Math.floor((i + 1) * bandH);
      c.fillStyle = WATER[i];
      c.fillRect(0, y0, W, y1 - y0);
      // Dither seam into the next band: a checkerboard row, then a sparse one.
      if (i < WATER.length - 1) {
        for (var x = 0; x < W; x++) {
          if (x % 2 === 0) px(c, x, y1 - 2, WATER[i + 1]);
          if (x % 2 === 1) px(c, x, y1 - 1, WATER[i + 1]);
          if (x % 4 === 0) px(c, x, y1 - 3, WATER[i + 1]);
        }
      }
    }
  }

  function drawRidges(c) {
    var farBase = Math.round(H * 0.66), nearBase = Math.round(H * 0.76);
    for (var x = 0; x < W; x++) {
      var fy = ridgeY(x, farBase, 7, 0.031, 0.083, 0.4);
      c.fillStyle = RIDGE_FAR;
      c.fillRect(x, fy, 1, H - fy);
      var ny = ridgeY(x, nearBase, 6, 0.024, 0.071, 2.2);
      c.fillStyle = RIDGE_NEAR;
      c.fillRect(x, ny, 1, H - ny);
    }
  }

  function drawSand(c) {
    for (var x = 0; x < W; x++) {
      var fy = floorY(x);
      var depth = H - fy;
      c.fillStyle = SAND.body;
      c.fillRect(x, fy, 1, depth);
      c.fillStyle = SAND.shade;
      c.fillRect(x, fy + Math.ceil(depth * 0.45), 1, depth);
      c.fillStyle = SAND.deep;
      c.fillRect(x, fy + Math.ceil(depth * 0.75), 1, depth);
      px(c, x, fy, SAND.top);
      if (x % 3 !== 1) px(c, x, fy + 1, SAND.top);
    }
    // Speckles and ripples.
    var specks = Math.floor(W * (H - floorTop) / 18);
    for (var i = 0; i < specks; i++) {
      var sx = ri(0, W - 1);
      var sy = ri(floorY(sx) + 2, H - 1);
      px(c, sx, sy, rand() < 0.5 ? SAND.speck : SAND.deep);
    }
  }

  function drawRock(c, cx, w, h) {
    var base = floorY(cx) + 2;
    for (var dx = -w; dx <= w; dx++) {
      var t = dx / w;
      var colH = Math.round(h * Math.sqrt(Math.max(0, 1 - t * t)));
      for (var dy = 0; dy < colH; dy++) {
        var color = ROCK.body;
        if (dy === colH - 1 || (dx < -w * 0.3 && dy > colH - 3)) color = ROCK.light;
        if (dx > w * 0.5 || dy < 2) color = ROCK.dark;
        px(c, cx + dx, base - dy, color);
      }
    }
  }

  function drawBranchCoral(c, cx) {
    var col = pick(CORAL);
    var base = floorY(cx) + 1;
    var branches = ri(3, 5);
    for (var b = 0; b < branches; b++) {
      var dir = b - (branches - 1) / 2;
      var x = cx + Math.round(dir);
      var len = ri(6, 13) - Math.abs(Math.round(dir));
      var y = base;
      for (var i = 0; i < len; i++) {
        y--;
        if (i > 1 && rand() < 0.35) x += dir > 0 ? 1 : dir < 0 ? -1 : (rand() < 0.5 ? -1 : 1);
        px(c, x, y, col.body);
        if (i === Math.floor(len / 2) && rand() < 0.7) {
          var side = rand() < 0.5 ? -1 : 1;
          px(c, x + side, y - 1, col.body);
          px(c, x + side * 2, y - 2, col.tip);
        }
      }
      px(c, x, y - 1, col.tip);
    }
  }

  function drawTubeCoral(c, cx) {
    var base = floorY(cx) + 1;
    var tubes = ri(2, 4);
    for (var t = 0; t < tubes; t++) {
      var x = cx + t * 3;
      var h = ri(4, 9);
      c.fillStyle = TUBE.body;
      c.fillRect(x, base - h, 2, h);
      px(c, x, base - h - 1, TUBE.rim);
      px(c, x + 1, base - h - 1, TUBE.rim);
    }
  }

  function drawStar(c, cx) {
    var y = floorY(cx) + ri(3, 6);
    var color = "#ff9a4d";
    px(c, cx, y, color); px(c, cx - 1, y, color); px(c, cx + 1, y, color);
    px(c, cx, y - 1, color); px(c, cx - 1, y + 1, color); px(c, cx + 1, y + 1, color);
  }

  function buildStatic() {
    staticLayer.width = W;
    staticLayer.height = H;
    drawWater(sctx);
    drawRidges(sctx);

    // Kelp is animated, but its roots belong behind the sand's front edge,
    // so we only decide where it goes here.
    kelps = [];
    var kelpCount = Math.max(4, Math.round(W / 26));
    for (var k = 0; k < kelpCount; k++) {
      var kx = ri(2, W - 3);
      kelps.push({ x: kx, h: ri(Math.round(H * 0.18), Math.round(H * 0.42)), phase: rand() * 6.28 });
    }

    drawSand(sctx);

    var rockCount = Math.max(3, Math.round(W / 45));
    for (var r = 0; r < rockCount; r++) drawRock(sctx, ri(0, W), ri(4, 10), ri(4, 9));
    var coralCount = Math.max(4, Math.round(W / 22));
    for (var cc = 0; cc < coralCount; cc++) {
      var x = ri(2, W - 6);
      if (rand() < 0.65) drawBranchCoral(sctx, x); else drawTubeCoral(sctx, x);
    }
    var starCount = Math.max(1, Math.round(W / 90));
    for (var s = 0; s < starCount; s++) drawStar(sctx, ri(4, W - 4));

    // Bubble vents sit at the bases of some kelp/coral.
    vents = [];
    for (var v = 0; v < Math.max(3, Math.round(W / 60)); v++) vents.push(ri(0, W - 1));

    rays = [];
    for (var ry = 0; ry < Math.max(3, Math.round(W / 70)); ry++) {
      rays.push({ x: ri(-Math.round(H * 0.3), W), w: ri(4, 10), phase: rand() * 6.28 });
    }
  }

  // ---------- Moving things ----------

  function spawnFish() {
    fish = [];
    var schools = Math.max(2, Math.round(W / 110));
    for (var s = 0; s < schools; s++) {
      var dir = rand() < 0.5 ? 1 : -1;
      var color = pick(FISH_COLORS);
      var y = ri(Math.round(H * 0.25), Math.round(H * 0.7));
      var x = ri(0, W);
      var speed = 6 + rand() * 6;
      var count = ri(3, 6);
      for (var f = 0; f < count; f++) {
        fish.push({ x: x + f * ri(7, 10) * -dir, y: y + ri(-6, 6), dir: dir, speed: speed, color: color, phase: rand() * 6.28 });
      }
    }
    // A slow school of far-off silhouettes.
    var farDir = rand() < 0.5 ? 1 : -1;
    var farY = ri(Math.round(H * 0.4), Math.round(H * 0.55));
    for (var ff = 0; ff < 7; ff++) {
      fish.push({ x: ri(0, W), y: farY + ri(-5, 5), dir: farDir, speed: 3, color: FISH_FAR, phase: rand() * 6.28 });
    }
  }

  function spawnBubble(fromBottom) {
    var vx = vents.length ? pick(vents) : ri(0, W);
    return {
      x: vx + ri(-1, 1),
      y: fromBottom ? floorY(vx) - 2 : ri(0, H),
      speed: 8 + rand() * 10,
      big: rand() < 0.35,
      phase: rand() * 6.28
    };
  }

  function spawnBubbles() {
    bubbles = [];
    var n = Math.max(10, Math.round(W / 14));
    for (var i = 0; i < n; i++) bubbles.push(spawnBubble(false));
  }

  function drawRays(t) {
    var len = Math.round(H * 0.75);
    for (var i = 0; i < rays.length; i++) {
      var ray = rays[i];
      var sway = Math.round(Math.sin(t * 0.4 + ray.phase) * 3);
      for (var y = 0; y < len; y += 1) {
        var alpha = 0.11 * (1 - y / len);
        if (alpha <= 0.01) break;
        ctx.fillStyle = "rgba(220,250,255," + alpha.toFixed(3) + ")";
        ctx.fillRect(ray.x + sway + Math.round(y * 0.35), y, ray.w, 1);
      }
    }
  }

  function drawSurface(t) {
    for (var x = 0; x < W; x++) {
      var v = Math.sin(x * 0.3 + t * 2.2) + Math.sin(x * 0.11 - t * 1.3);
      if (v > 0.9) px(ctx, x, 0, "#c9f7ff");
      if (v > 1.3) px(ctx, x, 1, "#8fe6f2");
      if (Math.sin(x * 0.07 + t) + Math.sin(x * 0.23 - t * 1.7) > 1.4) px(ctx, x, 3, "#5fc6dd");
    }
  }

  function drawKelp(t) {
    for (var i = 0; i < kelps.length; i++) {
      var k = kelps[i];
      var base = floorY(k.x) + 2;
      for (var y = 0; y < k.h; y++) {
        var bend = Math.round(Math.sin(y * 0.14 + t * 1.3 + k.phase) * (y / k.h) * 4);
        var x = k.x + bend;
        var yy = base - y;
        px(ctx, x, yy, KELP.body);
        px(ctx, x + 1, yy, KELP.dark);
        if (y % 2 === 0) px(ctx, x, yy, KELP.light);
        if (y > 3 && y % 6 === 0) {
          var side = (y / 6) % 2 === 0 ? -1 : 2;
          px(ctx, x + side, yy, KELP.body);
          px(ctx, x + side + (side < 0 ? -1 : 1), yy - 1, KELP.light);
        }
      }
    }
  }

  function drawFish(t, dt) {
    for (var i = 0; i < fish.length; i++) {
      var f = fish[i];
      f.x += f.dir * f.speed * dt;
      if (f.dir > 0 && f.x > W + 8) f.x = -8 - ri(0, 20);
      if (f.dir < 0 && f.x < -8) f.x = W + 8 + ri(0, 20);
      var fx = Math.round(f.x);
      var fy = Math.round(f.y + Math.sin(t * 2 + f.phase) * 1.2);
      for (var row = 0; row < FISH_SHAPE.length; row++) {
        var line = FISH_SHAPE[row];
        for (var col = 0; col < line.length; col++) {
          var ch = line[col];
          if (ch === ".") continue;
          var cx = f.dir > 0 ? fx + col : fx + (line.length - 1 - col);
          var color = ch === "e" && f.color !== FISH_FAR ? "#06141f" : f.color;
          px(ctx, cx, fy + row, color);
        }
      }
    }
  }

  function drawBubbles(t, dt) {
    for (var i = 0; i < bubbles.length; i++) {
      var b = bubbles[i];
      b.y -= b.speed * dt;
      if (b.y < 2) { bubbles[i] = spawnBubble(true); continue; }
      var x = Math.round(b.x + Math.sin(t * 3 + b.phase) * 1);
      var y = Math.round(b.y);
      if (b.big) {
        ctx.fillStyle = BUBBLE.body;
        ctx.fillRect(x, y, 2, 2);
        px(ctx, x, y, BUBBLE.light);
      } else {
        px(ctx, x, y, BUBBLE.body);
      }
    }
  }

  // ---------- Loop ----------

  var lastFrame = 0, lastTime = 0, running = false, rafId = 0;

  function frame(now) {
    // A hidden or mid-resize window can briefly report a 0 size.
    if (!W || !H || !staticLayer.width || !staticLayer.height) return;
    var t = now / 1000;
    var dt = lastTime ? Math.min(0.25, t - lastTime) : 0;
    lastTime = t;
    ctx.drawImage(staticLayer, 0, 0);
    drawRays(t);
    drawSurface(t);
    drawKelp(t);
    drawFish(t, dt);
    drawBubbles(t, dt);
  }

  function loop(now) {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    if (now - lastFrame < 1000 / FPS) return;
    lastFrame = now;
    // Backstop for viewports that change size without a resize event.
    if (sizeChanged()) {
      lastW = window.innerWidth; lastH = window.innerHeight;
      build();
      return;
    }
    frame(now);
  }

  function reduceMotion() {
    return document.body.getAttribute("data-reduce-motion") === "true" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function start() {
    cancelAnimationFrame(rafId);
    lastTime = 0;
    if (reduceMotion()) {
      running = false;
      frame(4000);
    } else {
      running = true;
      rafId = requestAnimationFrame(loop);
    }
  }

  function build() {
    PIXEL = Math.max(3, Math.min(6, Math.round(window.innerHeight / 210)));
    W = Math.ceil(window.innerWidth / PIXEL);
    H = Math.ceil(window.innerHeight / PIXEL);
    if (!W || !H) return;
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = W * PIXEL + "px";
    canvas.style.height = H * PIXEL + "px";
    floorTop = H - Math.max(14, Math.round(H * 0.13));
    rand = mulberry32(W * 7919 + H);
    buildStatic();
    spawnFish();
    spawnBubbles();
    start();
  }

  var resizeTimer = 0, lastW = 0, lastH = 0;
  // Ignores the small height jitter from mobile browser toolbars.
  function sizeChanged() {
    return window.innerWidth !== lastW || Math.abs(window.innerHeight - lastH) >= 120;
  }
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (!sizeChanged()) return;
      lastW = window.innerWidth; lastH = window.innerHeight;
      build();
    }, 150);
  }
  window.addEventListener("resize", onResize);

  new MutationObserver(start).observe(document.body, { attributes: true, attributeFilter: ["data-reduce-motion"] });
  window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", start);

  lastW = window.innerWidth; lastH = window.innerHeight;
  build();
})();
