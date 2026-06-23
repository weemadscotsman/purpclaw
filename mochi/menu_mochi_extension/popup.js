const DEFAULT_STATE = {
  name: 'Mochi', stage: 'Arcade Blob', hunger: 82, happiness: 78, cleanliness: 85,
  energy: 72, boredom: 18, bond: 10, xp: 0, coins: 0, level: 1, careMistakes: 0,
  mood: 'idle', createdAt: Date.now(), lastTick: Date.now(), lastSeen: Date.now(),
  diary: ['Day 1: Mochi hatched inside the browser chrome.']
};
let state = { ...DEFAULT_STATE };
let sfxOn = true;
let audioCtx = null;

const $ = (id) => document.getElementById(id);
const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(n)));
const escapeHtml = (str) => String(str).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

async function load() {
  const data = await chrome.storage.local.get(['petState', 'sfxOn']);
  state = applyDecay(data.petState || DEFAULT_STATE);
  sfxOn = data.sfxOn !== false;
  await save();
  render();
}
async function save() { await chrome.storage.local.set({ petState: state, sfxOn }); }

function addDiary(entry) {
  const day = Math.max(1, Math.floor((Date.now() - (state.createdAt || Date.now())) / 86400000) + 1);
  state.diary = Array.isArray(state.diary) ? state.diary.slice(-79) : [];
  state.diary.push(`Day ${day}: ${entry}`);
}

function applyDecay(input) {
  const now = Date.now();
  const mins = Math.max(0, Math.floor((now - (input.lastTick || now)) / 60000));
  const blocks = Math.min(96, mins / 30);
  const next = { ...input };
  if (mins >= 5) {
    next.hunger = clamp(next.hunger - blocks * 3);
    next.happiness = clamp(next.happiness - blocks * 2.4);
    next.cleanliness = clamp(next.cleanliness - blocks * 1.8);
    next.energy = clamp(next.energy - blocks * 1.2);
    next.boredom = clamp((next.boredom || 18) + blocks * 2.5);
    next.lastTick = now;
  }
  return calculateMood(next);
}
function calculateMood(p) {
  const min = Math.min(p.hunger, p.happiness, p.cleanliness, p.energy, 100 - (p.boredom || 0));
  if (min <= 10) p.mood = 'danger';
  else if (p.energy < 18) p.mood = 'sleeping';
  else if (p.cleanliness < 20) p.mood = 'dirty';
  else if (p.hunger < 22) p.mood = 'hungry';
  else if ((p.boredom || 0) > 82) p.mood = 'bored';
  else if (p.happiness < 22) p.mood = 'sad';
  else if (min < 38) p.mood = 'worried';
  else if (min > 75) p.mood = 'happy';
  else p.mood = 'idle';
  p.level = Math.max(1, Math.floor((p.xp || 0) / 100) + 1);
  if (p.level >= 6) p.stage = 'CRT Gremlin';
  else if (p.level >= 4) p.stage = 'Pixel Rascal';
  else if (p.level >= 2) p.stage = 'Menu Critter';
  else p.stage = 'Arcade Blob';
  return p;
}
function getBondLevel() {
  const days = Math.floor((Date.now() - (state.createdAt || Date.now())) / 86400000);
  if (days >= 7 || (state.bond || 0) >= 90) return 'Family';
  if (days >= 1 || (state.bond || 0) >= 65) return 'Best Friend';
  if ((state.bond || 0) >= 40) return 'Friend';
  if ((state.bond || 0) >= 15) return 'Acquaintance';
  return 'Stranger';
}
function render() {
  ['hunger', 'happiness', 'cleanliness', 'energy', 'bond'].forEach(k => { if ($(k)) $(k).value = state[k] || 0; });
  if ($('boredom')) $('boredom').value = 100 - (state.boredom || 0);
  $('levelText').textContent = `Lvl ${state.level} - ${state.stage}`;
  $('coinsText').textContent = `${state.coins || 0} coins`;
  $('soundToggle').textContent = sfxOn ? 'SFX ON' : 'SFX OFF';
  $('bondText').textContent = `Bond: ${getBondLevel()} | Switches today: ${state.tabSwitchesToday || 0}`;
  const sprite = $('petSprite');
  sprite.className = `pet ${state.mood || 'idle'}`;
  const messages = {
    idle: `${state.name} is watching the active tab.`, happy: `${state.name} is vibrating with pixel joy.`,
    hungry: `${state.name} wants snacks. Immediately.`, sad: `${state.name} is emotionally buffering.`,
    sleeping: `${state.name} is pretending to rest.`, dirty: `${state.name} smells like cached regret.`,
    worried: `${state.name} is doing tiny panic maths.`, bored: `${state.name} needs enrichment before it starts chewing the reload button.`,
    danger: `${state.name} has entered emergency bean protocol.`
  };
  $('moodText').textContent = messages[state.mood] || messages.idle;
  renderDiary();
}
function renderDiary() {
  const panel = $('diaryPanel');
  if (!panel) return;
  panel.innerHTML = (state.diary || []).slice(-16).reverse().map(x => `<div>${escapeHtml(x)}</div>`).join('') || '<div>No diary entries yet.</div>';
}
function tone(freq, duration = 0.08, type = 'square', gain = 0.05) {
  if (!sfxOn) return;
  audioCtx ||= new AudioContext();
  const osc = audioCtx.createOscillator();
  const amp = audioCtx.createGain();
  osc.type = type; osc.frequency.value = freq; amp.gain.value = gain;
  osc.connect(amp); amp.connect(audioCtx.destination);
  osc.start(); amp.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
  osc.stop(audioCtx.currentTime + duration);
}
function melody(notes) { notes.forEach((n, i) => setTimeout(() => tone(n[0], n[1], n[2] || 'square'), i * 95)); }
async function action(kind) {
  state = applyDecay(state);
  let line = 'Mochi accepts this offering.';
  if (kind === 'feed') { state.hunger = clamp(state.hunger + 34); state.energy = clamp(state.energy - 3); state.xp += 8; line = '(★‿★) Crumb acquired!'; addDiary('Human fed me. I felt loved and slightly crumbly.'); melody([[392,.06],[523,.08],[659,.1]]); }
  if (kind === 'play') { state.happiness = clamp(state.happiness + 20); state.boredom = clamp((state.boredom || 18) - 50); state.energy = clamp(state.energy - 9); state.bond = clamp(state.bond + 4); state.xp += 14; line = '(｡•̀ᴗ-)✧ WHEEEE.'; addDiary('Human played with me. Best tab moment so far.'); $('gamePanel').classList.remove('hidden'); melody([[330,.06],[440,.06],[660,.08]]); }
  if (kind === 'clean') { state.cleanliness = clamp(state.cleanliness + 45); state.xp += 7; line = '(✧ᴗ✧) Sparkle mode engaged.'; addDiary('Human cleaned me. I became legally shiny.'); melody([[700,.04],[520,.04],[700,.07]]); }
  if (kind === 'sleep') { state.energy = clamp(state.energy + 38); state.happiness = clamp(state.happiness + 4); state.xp += 5; line = '( ˘ω˘ ) zzz best human ever.'; addDiary('Human let me rest. The favicon became peaceful.'); melody([[440,.08,'triangle'],[330,.08,'triangle'],[220,.12,'triangle']]); }
  state.bond = clamp(state.bond + 1);
  state = calculateMood(state);
  await save(); render();
  try { chrome.runtime.sendMessage({ type: 'MENU_MOCHI_CARE_EVENT', text: line, line }); } catch (err) {}
}

document.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', () => action(btn.dataset.action)));
$('soundToggle').addEventListener('click', async () => { sfxOn = !sfxOn; await save(); render(); tone(660); });
$('diaryToggle').addEventListener('click', () => $('diaryPanel').classList.toggle('hidden'));
$('apologize').addEventListener('click', async () => {
  state = applyDecay(state);
  state.hunger = Math.max(state.hunger, 50);
  state.happiness = Math.max(state.happiness, 50);
  state.cleanliness = Math.max(state.cleanliness, 50);
  state.energy = Math.max(state.energy, 50);
  state.boredom = Math.min(state.boredom || 0, 50);
  state.bond = clamp((state.bond || 0) + 8);
  addDiary('Human apologised. I forgave them, but wrote it down.');
  await save(); render();
  try { chrome.runtime.sendMessage({ type: 'MENU_MOCHI_CARE_EVENT', text: 'Mochi received an apology.', line: '(╥﹏╥) Mochi forgives you. Obviously.' }); } catch (err) {}
});
$('resetPet').addEventListener('click', async () => { state = { ...DEFAULT_STATE, createdAt: Date.now(), lastTick: Date.now() }; await save(); render(); melody([[180,.1],[140,.1],[110,.16]]); });

let gameTimer = null;
$('startGame').addEventListener('click', () => {
  const area = $('gameArea'); area.innerHTML = ''; let score = 0; let ticks = 0;
  $('score').textContent = 'Score: 0'; clearInterval(gameTimer);
  gameTimer = setInterval(() => {
    ticks++;
    const el = document.createElement('div');
    const bug = Math.random() < 0.25;
    el.className = bug ? 'bug' : 'byte'; el.textContent = bug ? '✖' : '◆';
    el.style.left = Math.floor(Math.random() * 285) + 'px'; el.style.top = '-20px';
    area.appendChild(el);
    let y = -20;
    const fall = setInterval(() => {
      y += 7 + Math.min(8, ticks / 8); el.style.top = y + 'px';
      if (y > 120) { clearInterval(fall); el.remove(); }
    }, 55);
    el.addEventListener('click', async () => {
      if (bug) { score -= 3; tone(120,.12,'sawtooth'); }
      else { score += 5; state.happiness = clamp(state.happiness + 2); state.boredom = clamp((state.boredom || 0) - 5); state.coins += 1; state.xp += 3; tone(880,.05,'square'); }
      $('score').textContent = `Score: ${score}`; el.remove(); clearInterval(fall); await save(); render();
    });
    if (ticks >= 24) { clearInterval(gameTimer); state = calculateMood(state); save(); render(); }
  }, 420);
});

load();
