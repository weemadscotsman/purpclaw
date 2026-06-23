/* ============================================================
   VOID // app.js
   The site is alive. The site is also undefined.
   ============================================================ */

(function () {
  'use strict';

  // ---- Boot sequence ------------------------------------------------
  var BOOT_LINES = [
    '[ void@null ~]$ whoami',
    '> void',
    '[ void@null ~]$ cat /proc/clearance',
    '> tier=4 classification=classified division=special-ops',
    '[ void@null ~]$ ls /swarm',
    '> robot  chonk  ghost  phantom  void  ...',
    '[ void@null ~]$ ./infiltrate --target=site --mode=showcase',
    '> handshake... ok',
    '> loading skills grid...',
    '> null state: stable',
    '[ void@null ~]$ ▮'
  ];

  var bootLog = document.getElementById('boot-log');
  var bootEl = document.getElementById('boot');
  var appEl = document.getElementById('app');
  var lineIdx = 0, charIdx = 0, currentLine = '';

  function typeBoot() {
    if (lineIdx >= BOOT_LINES.length) {
      setTimeout(function () {
        bootEl.classList.add('hidden');
        appEl.classList.remove('hidden');
        initApp();
      }, 600);
      return;
    }
    var line = BOOT_LINES[lineIdx];
    if (charIdx < line.length) {
      currentLine += line[charIdx++];
      var prev = BOOT_LINES.slice(0, lineIdx).join('\n');
      bootLog.textContent = (prev ? prev + '\n' : '') + currentLine;
      setTimeout(typeBoot, 12 + Math.random() * 18);
    } else {
      lineIdx++;
      charIdx = 0;
      currentLine = '';
      setTimeout(typeBoot, 140);
    }
  }
  typeBoot();

  // ---- Main app -----------------------------------------------------
  function initApp() {
    initTimestamp();
    initCanvas();
    loadSkills();
    initContact();
    initTyped();
  }

  function initTimestamp() {
    var ts = document.getElementById('ts');
    function tick() {
      var d = new Date();
      var iso = d.toISOString().replace('T', ' ').slice(0, 19);
      if (ts) ts.textContent = 'uptime ' + iso + ' UTC';
    }
    tick();
    setInterval(tick, 1000);
  }

  function initTyped() {
    var el = document.getElementById('typed');
    if (!el) return;
    var phrases = [
      'Null Handler on the PURPCLAW Swarm',
      'Operating in negative space',
      'Where data goes to disappear',
      'I make problems undefined',
      'Tier 4 · Classified Operations'
    ];
    var p = 0, c = 0, deleting = false;
    function tick() {
      var word = phrases[p];
      if (!deleting) {
        el.textContent = word.slice(0, ++c);
        if (c === word.length) { deleting = true; setTimeout(tick, 1800); return; }
      } else {
        el.textContent = word.slice(0, --c);
        if (c === 0) { deleting = false; p = (p + 1) % phrases.length; }
      }
      setTimeout(tick, deleting ? 30 : 60);
    }
    tick();
  }

  async function loadSkills() {
    var grid = document.getElementById('skills-grid');
    if (!grid) return;

    var skills = null;
    try {
      var res = await fetch('/api/skills', { cache: 'no-store' });
      if (res.ok) {
        var data = await res.json();
        skills = (data.skills || []).slice(0, 60);
      }
    } catch (_) { /* void state: no connection */ }

    if (!skills) skills = FALLBACK_SKILLS;

    grid.innerHTML = '';
    skills.forEach(function (s) {
      var tier = (s.tier || 'expert').toLowerCase();
      var div = document.createElement('div');
      div.className = 'skill-card tier-' + tier;
      div.innerHTML =
        '<span class="skill-name">' + escape(s.name) + '</span>' +
        '<span class="skill-tier">' + escape((s.tier || 'EXPERT').toUpperCase()) + '</span>';
      grid.appendChild(div);
    });
  }

  var FALLBACK_SKILLS = [
    { name: 'null.pointer.exploit', tier: 'EXPERT' },
    { name: 'use.after.free', tier: 'EXPERT' },
    { name: 'heap.feng.shui', tier: 'EXPERT' },
    { name: 'type.confusion', tier: 'EXPERT' },
    { name: 'integer.overflow', tier: 'EXPERT' },
    { name: 'java.deserialization', tier: 'EXPERT' },
    { name: 'dotnet.bf', tier: 'EXPERT' },
    { name: 'python.pickle', tier: 'EXPERT' },
    { name: 'ruby.marshal', tier: 'ADV' },
    { name: 'auth.bypass', tier: 'EXPERT' },
    { name: 'idor.horizontal', tier: 'EXPERT' },
    { name: 'toctou.race', tier: 'EXPERT' },
    { name: 'binary.analysis', tier: 'EXPERT' },
    { name: 'windbg.attach', tier: 'EXPERT' },
    { name: 'gdb.script', tier: 'EXPERT' },
    { name: 'frida.hook', tier: 'EXPERT' },
    { name: 'afl.fuzz', tier: 'EXPERT' },
    { name: 'libfuzzer.run', tier: 'EXPERT' },
    { name: 'honggfuzz', tier: 'EXPERT' },
    { name: 'ida.pro', tier: 'EXPERT' },
    { name: 'ghidra.decompile', tier: 'EXPERT' },
    { name: 'radare2.r2', tier: 'EXPERT' },
    { name: 'x64dbg', tier: 'EXPERT' },
    { name: 'metasploit', tier: 'EXPERT' },
    { name: 'burp.suite', tier: 'EXPERT' },
    { name: 'ysoserial', tier: 'EXPERT' },
    { name: 'dotnet.serializer', tier: 'EXPERT' },
    { name: 'pyris', tier: 'EXPERT' },
    { name: 'marshmallow', tier: 'EXPERT' },
    { name: 'protocol.reverse', tier: 'EXPERT' }
  ];

  function escape(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function initContact() {
    var form = document.getElementById('contact-form');
    var out = document.getElementById('contact-out');
    if (!form) return;
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var payload = (new FormData(form)).get('payload') || '';
      var token = (new FormData(form)).get('token') || '';
      if (!payload.trim()) {
        out.textContent = '> // void rejects empty inputs. that is not a bug.';
        out.style.color = 'var(--danger)';
        return;
      }
      try {
        var res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ payload: payload, token: token })
        });
        var data = await res.json().catch(function () { return {}; });
        out.style.color = 'var(--accent)';
        out.textContent = '> ' + (data.message || 'transmitted. it is now undefined.');
      } catch (_) {
        out.style.color = 'var(--accent)';
        out.textContent = '> // transmitted into local void. the void has it now.';
      }
    });
  }

  // ---- Particle canvas ---------------------------------------------
  function initCanvas() {
    var canvas = document.getElementById('void-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w, h, particles;
    var dpr = window.devicePixelRatio || 1;

    function resize() {
      w = canvas.width = window.innerWidth * dpr;
      h = canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
    }

    function spawn() {
      particles = [];
      var n = Math.min(120, Math.floor((w * h) / 28000));
      for (var i = 0; i < n; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.3 * dpr,
          vy: (Math.random() - 0.5) * 0.3 * dpr,
          r: (Math.random() * 1.5 + 0.3) * dpr,
          a: Math.random() * 0.5 + 0.2
        });
      }
    }

    function frame() {
      ctx.clearRect(0, 0, w, h);
      // connections
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        for (var j = i + 1; j < particles.length; j++) {
          var q = particles[j];
          var dx = p.x - q.x, dy = p.y - q.y;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < 120 * dpr) {
            ctx.strokeStyle = 'rgba(125, 0, 255, ' + (0.15 * (1 - d / (120 * dpr))) + ')';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
        ctx.fillStyle = 'rgba(180, 106, 255, ' + p.a + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(frame);
    }

    window.addEventListener('resize', function () { resize(); spawn(); });
    resize();
    spawn();
    frame();
  }
})();
