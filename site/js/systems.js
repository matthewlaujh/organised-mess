/* organisedmess.studio — rule-based backdrops (test rig)
 *
 * Five small systems rendered on a 2D canvas at low resolution and scaled
 * up, in the site's greys. Same interface as the WebGL backdrops:
 * setSpeedScale(), pause(), resume(), stats().
 *
 *   life    Conway's Game of Life with a fading memory of past cells
 *   lenia   continuous Life (Lenia): smooth kernels, organisms that move
 *   eca     elementary cellular automaton, one row per tick, scrolling
 *   sand    falling sand: grains pile, slide and settle; pointer pours
 *   boids   flocking: separation / alignment / cohesion, with trails
 */
(function () {
	'use strict';

	function hexToRgb(h) {
		h = (h || '').replace('#', '');
		if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
		var n = parseInt(h, 16);
		return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
	}
	function num(v, d) { return v != null ? parseFloat(v) : d; }
	function lerp(a, b, t) { return a + (b - a) * t; }

	/* grain overlay: one tile of noise, re-drawn at ~12 fps with an offset */
	function makeGrain(size) {
		var c = document.createElement('canvas'); c.width = c.height = size;
		var ctx = c.getContext('2d'); var img = ctx.createImageData(size, size);
		for (var i = 0; i < img.data.length; i += 4) {
			var v = 128 + (Math.random() - 0.5) * 90;
			img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
		}
		ctx.putImageData(img, 0, 0); return c;
	}

	function System(el, mode) {
		var d = el.dataset;
		this.el = el; this.mode = mode;
		this.colA = hexToRgb(d.colorA || '#f4f4f4');
		this.colB = hexToRgb(d.colorB || '#a6a6a6');
		this.settings = {
			speed: num(d.speed, 1),
			grain: num(d.grain, 0.7),
			mouse_interaction: d.mouseInteraction !== 'false',
			rule: parseInt(d.rule != null ? d.rule : 30, 10)
		};
		this.speedScale = 1;
		this.reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		this.generation = 0; this.alive = 0; this.fps = 0; this._fpsAcc = 0; this._fpsN = 0;
		this.mouse = { x: -1, y: -1 }; this.pointerMoving = 0; this.inViewport = true;
		this.canvas = document.createElement('canvas');
		this.canvas.className = 'backdrop-canvas';
		el.appendChild(this.canvas);
		this.ctx = this.canvas.getContext('2d', { alpha: false });
		this.grain = makeGrain(256);
		this.bind();
		this.ready = true;
		this.el.parentElement.classList.add('loaded');
		this.resume();
	}

	System.prototype.setSpeedScale = function (k) { this.speedScale = k; };
	System.prototype.stats = function () {
		return { mode: this.mode, generation: this.generation, alive: this.alive, fps: Math.round(this.fps), cells: this.gw ? this.gw * this.gh : 0 };
	};
	System.prototype.pause = function () { cancelAnimationFrame(this.frame); this.paused = true; };
	System.prototype.resume = function () {
		cancelAnimationFrame(this.frame);
		if (this.inViewport && this.ready) { this.last = 0; this.acc = 0; this.loop(); this.paused = false; }
	};

	System.prototype.setSize = function (w, h) {
		var res = Math.min(window.devicePixelRatio || 1, 2);
		this.canvas.width = Math.round(w * res); this.canvas.height = Math.round(h * res);
		this.cw = w; this.ch = h;
		var cell = { life: 9, lenia: 5, eca: 3, sand: 4, boids: 1 }[this.mode];
		var gw = Math.max(32, Math.round(w / cell)), gh = Math.max(24, Math.round(h / cell));
		if (gw !== this.gw || gh !== this.gh) { this.gw = gw; this.gh = gh; this.init(); }
	};

	/* ---------- init per mode ---------- */
	System.prototype.init = function () {
		var n = this.gw * this.gh;
		this.off = document.createElement('canvas'); this.off.width = this.gw; this.off.height = this.gh;
		this.octx = this.off.getContext('2d');
		this.img = this.octx.createImageData(this.gw, this.gh);
		this.generation = 0;
		if (this.mode === 'life') {
			this.a = new Uint8Array(n); this.b = new Uint8Array(n); this.trail = new Float32Array(n);
			for (var i = 0; i < n; i++) this.a[i] = Math.random() < 0.12 ? 1 : 0;
			this.tick = 1 / 4;
		} else if (this.mode === 'lenia') {
			this.a = new Float32Array(n); this.b = new Float32Array(n);
			this.R = 8; this.mu = 0.15; this.sigma = 0.017; this.dt = 0.12;
			// ring kernel
			var R = this.R, K = [], sum = 0;
			for (var y = -R; y <= R; y++) for (var x = -R; x <= R; x++) {
				var r = Math.sqrt(x * x + y * y) / R; if (r > 1) continue;
				var k = Math.exp(-Math.pow((r - 0.5) / 0.15, 2) / 2);
				K.push([x, y, k]); sum += k;
			}
			this.K = K.map(function (e) { return [e[0], e[1], e[2] / sum]; });
			// a few soft blobs to start
			for (var s = 0; s < 6; s++) this.blob(Math.random() * this.gw, Math.random() * this.gh, 6 + Math.random() * 6);
			this.tick = 1 / 12;
		} else if (this.mode === 'eca') {
			this.rows = []; this.row = new Uint8Array(this.gw);
			this.row[Math.floor(this.gw / 2)] = 1;
			for (var q = 0; q < this.gw; q++) if (Math.random() < 0.02) this.row[q] = 1;
			this.tick = 1 / 14;
		} else if (this.mode === 'sand') {
			this.a = new Uint8Array(n);
			this.tick = 1 / 40;
		} else if (this.mode === 'boids') {
			this.boids = [];
			for (var j = 0; j < 180; j++) this.boids.push({ x: Math.random() * this.cw, y: Math.random() * this.ch, vx: Math.random() - 0.5, vy: Math.random() - 0.5 });
			this.trailCanvas = document.createElement('canvas'); this.trailCanvas.width = this.canvas.width; this.trailCanvas.height = this.canvas.height;
			this.tctx = this.trailCanvas.getContext('2d');
			this.tctx.fillStyle = 'rgb(' + this.colA.join(',') + ')'; this.tctx.fillRect(0, 0, this.trailCanvas.width, this.trailCanvas.height);
			this.tick = 1 / 60;
		}
	};
	System.prototype.blob = function (cx, cy, r) {
		for (var y = -r; y <= r; y++) for (var x = -r; x <= r; x++) {
			var d = Math.sqrt(x * x + y * y) / r; if (d > 1) continue;
			var ix = ((Math.round(cx + x) % this.gw) + this.gw) % this.gw, iy = ((Math.round(cy + y) % this.gh) + this.gh) % this.gh;
			this.a[iy * this.gw + ix] = Math.max(this.a[iy * this.gw + ix], (1 - d) * (0.6 + Math.random() * 0.4));
		}
	};

	/* ---------- step per mode ---------- */
	System.prototype.step = function () {
		var gw = this.gw, gh = this.gh, n = gw * gh, i, x, y;
		this.generation++;
		if (this.mode === 'life') {
			var a = this.a, b = this.b, alive = 0;
			for (y = 0; y < gh; y++) for (x = 0; x < gw; x++) {
				var s = 0;
				for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
					if (!dx && !dy) continue;
					s += a[((y + dy + gh) % gh) * gw + ((x + dx + gw) % gw)];
				}
				i = y * gw + x;
				var v = a[i] ? (s === 2 || s === 3 ? 1 : 0) : (s === 3 ? 1 : 0);
				b[i] = v; alive += v;
				this.trail[i] = v ? 1 : this.trail[i] * 0.86;
			}
			// pointer seeds a small random patch
			if (this.pointerMoving > 0 && this.mouse.x >= 0) {
				var px = Math.floor(this.mouse.x * gw), py = Math.floor(this.mouse.y * gh);
				for (var k = 0; k < 6; k++) { var rx = (px + Math.floor(Math.random() * 5) - 2 + gw) % gw, ry = (py + Math.floor(Math.random() * 5) - 2 + gh) % gh; b[ry * gw + rx] = 1; }
			}
			this.a = b; this.b = a; this.alive = alive;
			// keep it from dying out entirely
			if (alive < n * 0.004 && Math.random() < 0.1) { for (var z = 0; z < 20; z++) this.a[Math.floor(Math.random() * n)] = 1; }
		} else if (this.mode === 'lenia') {
			var A = this.a, B = this.b, K = this.K, mu = this.mu, sg = this.sigma, dt = this.dt, mass = 0;
			for (y = 0; y < gh; y++) for (x = 0; x < gw; x++) {
				var u = 0;
				for (var kk = 0; kk < K.length; kk++) {
					var e = K[kk];
					u += e[2] * A[((y + e[1] + gh) % gh) * gw + ((x + e[0] + gw) % gw)];
				}
				var g = 2 * Math.exp(-Math.pow((u - mu) / sg, 2) / 2) - 1;
				i = y * gw + x;
				var nv = Math.min(1, Math.max(0, A[i] + dt * g));
				B[i] = nv; mass += nv;
			}
			if (this.pointerMoving > 0 && this.mouse.x >= 0 && Math.random() < 0.15) { this.a = B; this.blob(this.mouse.x * gw, this.mouse.y * gh, 5); B = this.a; }
			this.a = B; this.b = A; this.alive = Math.round(mass);
			if (mass < 2) { for (var s2 = 0; s2 < 4; s2++) this.blob(Math.random() * gw, Math.random() * gh, 7); }
		} else if (this.mode === 'eca') {
			var r = this.row, next = new Uint8Array(gw), rule = this.settings.rule;
			for (x = 0; x < gw; x++) {
				var l = r[(x - 1 + gw) % gw], c = r[x], rr = r[(x + 1) % gw];
				next[x] = (rule >> ((l << 2) | (c << 1) | rr)) & 1;
			}
			if (this.pointerMoving > 0 && this.mouse.x >= 0) next[Math.floor(this.mouse.x * gw)] ^= 1;
			this.rows.push(next); if (this.rows.length > gh) this.rows.shift();
			this.row = next; this.alive = 0; for (x = 0; x < gw; x++) this.alive += next[x];
		} else if (this.mode === 'sand') {
			var S = this.a;
			// pour from the pointer, plus a slow trickle from the top
			if (this.pointerMoving > 0 && this.mouse.x >= 0) { var sx = Math.floor(this.mouse.x * gw), sy = Math.floor(this.mouse.y * gh); for (var q2 = 0; q2 < 3; q2++) { var qx = Math.min(gw - 1, Math.max(0, sx + Math.floor(Math.random() * 3) - 1)); S[Math.max(0, sy) * gw + qx] = 1 + Math.floor(Math.random() * 3); } }
			if (Math.random() < 0.6) S[Math.floor(Math.random() * gw)] = 1 + Math.floor(Math.random() * 3);
			for (y = gh - 2; y >= 0; y--) {
				var dir = (this.generation + y) & 1 ? 1 : -1;
				for (var xx = 0; xx < gw; xx++) {
					x = dir > 0 ? xx : gw - 1 - xx;
					i = y * gw + x; var g2 = S[i]; if (!g2) continue;
					var below = i + gw;
					if (!S[below]) { S[below] = g2; S[i] = 0; continue; }
					var side = Math.random() < 0.5 ? -1 : 1;
					var bx = x + side;
					if (bx >= 0 && bx < gw && !S[below + side]) { S[below + side] = g2; S[i] = 0; continue; }
					bx = x - side;
					if (bx >= 0 && bx < gw && !S[below - side]) { S[below - side] = g2; S[i] = 0; }
				}
			}
			// when it fills past a line, let the bottom rows drain away slowly
			var full = 0; for (x = 0; x < gw; x++) if (S[Math.floor(gh * 0.35) * gw + x]) full++;
			if (full > gw * 0.5) { for (x = 0; x < gw; x++) if (Math.random() < 0.3) S[(gh - 1) * gw + x] = 0; }
			this.alive = 0; for (i = 0; i < n; i++) if (S[i]) this.alive++;
		} else if (this.mode === 'boids') {
			var bs = this.boids, W = this.cw, H = this.ch;
			for (var bi = 0; bi < bs.length; bi++) {
				var b0 = bs[bi], ax = 0, ay = 0, cx = 0, cy = 0, sx2 = 0, sy2 = 0, cnt = 0;
				for (var bj = 0; bj < bs.length; bj++) {
					if (bi === bj) continue; var o = bs[bj]; var dx2 = o.x - b0.x, dy2 = o.y - b0.y; var d2 = dx2 * dx2 + dy2 * dy2;
					if (d2 < 60 * 60) { cnt++; ax += o.vx; ay += o.vy; cx += o.x; cy += o.y; if (d2 < 18 * 18) { sx2 -= dx2; sy2 -= dy2; } }
				}
				if (cnt) { ax = ax / cnt - b0.vx; ay = ay / cnt - b0.vy; cx = cx / cnt - b0.x; cy = cy / cnt - b0.y; }
				b0.vx += ax * 0.05 + cx * 0.002 + sx2 * 0.03; b0.vy += ay * 0.05 + cy * 0.002 + sy2 * 0.03;
				if (this.mouse.x >= 0) { var mx = this.mouse.x * W - b0.x, my = this.mouse.y * H - b0.y; var md = Math.hypot(mx, my) + 1; if (md < 140) { b0.vx -= mx / md * 0.12; b0.vy -= my / md * 0.12; } }
				var sp = Math.hypot(b0.vx, b0.vy); var max = 1.6; if (sp > max) { b0.vx *= max / sp; b0.vy *= max / sp; } if (sp < 0.5) { b0.vx *= 1.1; b0.vy *= 1.1; }
				b0.x = (b0.x + b0.vx + W) % W; b0.y = (b0.y + b0.vy + H) % H;
			}
			this.alive = bs.length;
		}
	};

	/* ---------- render ---------- */
	System.prototype.render = function () {
		var ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
		var A = this.colA, Bc = this.colB, gw = this.gw, gh = this.gh, i, x, y, t;
		if (this.mode === 'boids') {
			var tc = this.tctx;
			tc.fillStyle = 'rgba(' + A.join(',') + ',0.08)'; tc.fillRect(0, 0, W, H);
			var res = W / this.cw;
			tc.fillStyle = 'rgb(' + Bc.join(',') + ')';
			for (var bi = 0; bi < this.boids.length; bi++) { var b = this.boids[bi]; tc.beginPath(); tc.arc(b.x * res, b.y * res, 1.6 * res, 0, 6.283); tc.fill(); }
			ctx.drawImage(this.trailCanvas, 0, 0);
		} else {
			var data = this.img.data;
			for (y = 0; y < gh; y++) for (x = 0; x < gw; x++) {
				i = y * gw + x;
				// vertical gradient base, pattern adds darkness
				var base = (y / gh) * 0.55;
				if (this.mode === 'life') t = base + this.trail[i] * 0.45;
				else if (this.mode === 'lenia') t = base + this.a[i] * 0.55;
				else if (this.mode === 'eca') { var row = this.rows[y - (gh - this.rows.length)]; t = base + ((row && row[x]) ? 0.5 : 0); }
				else if (this.mode === 'sand') { var g = this.a[i]; t = base + (g ? 0.35 + g * 0.1 : 0); }
				t = Math.min(1, t);
				var p = i * 4;
				data[p] = lerp(A[0], Bc[0], t); data[p + 1] = lerp(A[1], Bc[1], t); data[p + 2] = lerp(A[2], Bc[2], t); data[p + 3] = 255;
			}
			this.octx.putImageData(this.img, 0, 0);
			ctx.imageSmoothingEnabled = this.mode !== 'eca' && this.mode !== 'sand';
			ctx.drawImage(this.off, 0, 0, W, H);
		}
		// grain
		if (this.settings.grain > 0) {
			ctx.globalCompositeOperation = 'overlay';
			ctx.globalAlpha = 0.18 * this.settings.grain;
			var ox = (this.grainPhase * 97) % 256, oy = (this.grainPhase * 59) % 256;
			ctx.save(); ctx.translate(-ox, -oy);
			var pat = ctx.createPattern(this.grain, 'repeat'); ctx.fillStyle = pat; ctx.fillRect(0, 0, W + 256, H + 256);
			ctx.restore();
			ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
		}
	};

	System.prototype.loop = function (now) {
		var _this = this;
		this.frame = requestAnimationFrame(function (t) { _this.loop(t); });
		now = now || performance.now();
		var dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 0.016;
		this.last = now;
		this._fpsAcc += dt; this._fpsN++; if (this._fpsAcc > 0.5) { this.fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0; }
		if (this.reducedMotion) dt = 0;
		this.pointerMoving = Math.max(0, this.pointerMoving - dt);
		this.acc += dt * this.settings.speed * this.speedScale;
		var steps = 0;
		while (this.acc >= this.tick && steps < 4) { this.step(); this.acc -= this.tick; steps++; }
		this.grainPhase = Math.floor(now / 83);
		this.render();
	};

	System.prototype.bind = function () {
		var _this = this;
		var wrapper = this.el.closest('.backdrop') || this.el;
		var page = wrapper.parentElement;
		function resize() { _this.setSize(page.clientWidth, Math.min(page.clientHeight, window.innerHeight)); }
		resize();
		if (window.ResizeObserver) new ResizeObserver(resize).observe(page);
		window.addEventListener('resize', resize, { passive: true });
		if (this.settings.mouse_interaction) {
			window.addEventListener('pointermove', function (e) {
				_this.mouse.x = e.clientX / window.innerWidth; _this.mouse.y = e.clientY / window.innerHeight; _this.pointerMoving = 0.2;
			}, { passive: true });
		}
		if (window.IntersectionObserver) {
			new IntersectionObserver(function (en) { _this.inViewport = en[0].isIntersecting; if (_this.inViewport) _this.resume(); else _this.pause(); }, { threshold: 0 }).observe(wrapper);
		}
		document.addEventListener('visibilitychange', function () { if (document.hidden) _this.pause(); else _this.resume(); });
	};

	window.Systems = {
		modes: ['life', 'lenia', 'eca', 'sand', 'boids'],
		create: function (el, mode) { return new System(el, mode); }
	};
})();
