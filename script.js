'use strict';

(() => {
  // ===================== 상수 =====================
  const ANIMALS = ['🐭', '🐮', '🐯', '🐰', '🐲', '🐍', '🐴', '🐑', '🐵', '🐔', '🐶', '🐷'];
  const COLORS = [
    '#E4E0F7', // 쥐 - 라벤더
    '#FFF0C2', // 소 - 크림
    '#FFD9A8', // 호랑이 - 살구
    '#FFDDEB', // 토끼 - 핑크
    '#C9F5DD', // 용 - 민트
    '#DDF5C2', // 뱀 - 라임
    '#F6DEC6', // 말 - 베이지
    '#EEF0FF', // 양 - 구름색
    '#FBDDC0', // 원숭이 - 피치
    '#FFF4AE', // 닭 - 레몬
    '#D3EAFF', // 개 - 하늘
    '#FFD3DE', // 돼지 - 딸기우유
  ];
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Segoe UI Symbol",sans-serif';
  const UI_FONT = '-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif';
  const PROLOGUE_TEXT = '저 별에는 무엇이 있을까?';

  const TAU = Math.PI * 2;
  const HOVER_GAP = 2.6;          // 이동 블록과 탑 꼭대기 사이 거리(블록 단위)
  const PERFECT_TOL = 0.1;        // 퍼펙트 판정 허용 오차(블록 크기 대비)
  const GOOD_TOL = 0.22;
  const SUPPORT_HALF = 0.55;      // 중심이 이 범위를 벗어나면 낙하
  const BASE_SUPPORT_HALF = 0.85; // 첫 블록은 받침대 위라 더 관대하게
  const CAM_ANCHOR = 0.62;        // 탑 꼭대기가 화면 높이의 이 위치에 오도록 카메라 이동
  const MAX_SWING_RANGE = 2.4;    // 이동 블록의 최대 좌우 진폭(블록 단위)
  const BEST_KEY = 'zodiacTower.best';
  const MUTE_KEY = 'zodiacTower.muted';

  const STATE = { PROLOGUE: 'PROLOGUE', PLAYING: 'PLAYING', GAMEOVER: 'GAMEOVER' };

  // ===================== 유틸 =====================
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

  const storage = {
    get(key) {
      try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
    },
  };

  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255;
    let g = (n >> 8) & 255;
    let b = n & 255;
    const target = amount < 0 ? 0 : 255;
    const t = Math.abs(amount);
    r = Math.round(r + (target - r) * t);
    g = Math.round(g + (target - g) * t);
    b = Math.round(b + (target - b) * t);
    return `rgb(${r},${g},${b})`;
  }

  // 모서리가 둥근 사각형(Squircle) 경로
  function squirclePath(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  function starPath(c, cx, cy, outer, inner, rot) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 ? inner : outer;
      const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
  }

  // ===================== 사운드 (Web Audio API) =====================
  const Sound = (() => {
    let ac = null;
    let master = null;
    let sfxBus = null;
    let musicBus = null;
    let noiseBuffer = null;
    let muted = storage.get(MUTE_KEY) === '1';

    let bgmOn = false;
    let stage = 0;
    let step = 0;
    let nextTime = 0;
    let timer = null;

    // 32스텝(8분음표) 패턴, 0은 쉼표, 숫자는 MIDI 노트
    const STAGES = [
      { // 들판: 느리고 평화로운 Sine
        bpm: 84, leadWave: 'sine', bassWave: 'sine',
        leadGain: 0.13, bassGain: 0.12, leadLen: 1.8, filter: 0, drums: 0,
        lead: [72, 0, 76, 0, 79, 0, 76, 0, 81, 0, 79, 0, 76, 0, 74, 0, 72, 0, 74, 0, 76, 0, 79, 0, 76, 0, 74, 0, 72, 0, 0, 0],
        bass: [48, 0, 0, 0, 55, 0, 0, 0, 53, 0, 0, 0, 55, 0, 0, 0, 48, 0, 0, 0, 55, 0, 0, 0, 53, 0, 0, 0, 48, 0, 0, 0],
      },
      { // 노을: 템포 업
        bpm: 120, leadWave: 'sine', bassWave: 'triangle',
        leadGain: 0.11, bassGain: 0.11, leadLen: 0.95, filter: 0, drums: 1,
        lead: [72, 76, 79, 76, 81, 79, 76, 74, 72, 74, 76, 79, 81, 84, 81, 79, 77, 81, 84, 81, 79, 76, 74, 76, 72, 74, 76, 79, 76, 74, 72, 0],
        bass: [48, 0, 48, 0, 55, 0, 55, 0, 53, 0, 53, 0, 55, 0, 55, 0, 53, 0, 53, 0, 55, 0, 55, 0, 48, 0, 48, 0, 55, 0, 48, 0],
      },
      { // 우주: 빠르고 긴박한 Sawtooth
        bpm: 156, leadWave: 'sawtooth', bassWave: 'sawtooth',
        leadGain: 0.055, bassGain: 0.07, leadLen: 0.75, filter: 1800, drums: 2,
        lead: [69, 72, 76, 72, 69, 72, 76, 79, 67, 71, 74, 71, 67, 71, 74, 77, 65, 69, 72, 69, 65, 69, 72, 76, 64, 68, 71, 68, 71, 74, 76, 80],
        bass: [45, 45, 45, 45, 45, 45, 45, 45, 43, 43, 43, 43, 43, 43, 43, 43, 41, 41, 41, 41, 41, 41, 41, 41, 40, 40, 40, 40, 40, 40, 40, 40],
      },
    ];

    function makeNoise() {
      const len = ac.sampleRate * 1.5;
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return buf;
    }

    function unlock() {
      try {
        if (!ac) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          ac = new AC();
          const comp = ac.createDynamicsCompressor();
          comp.connect(ac.destination);
          master = ac.createGain();
          master.gain.value = muted ? 0 : 0.9;
          master.connect(comp);
          sfxBus = ac.createGain();
          sfxBus.gain.value = 0.9;
          sfxBus.connect(master);
          musicBus = ac.createGain();
          musicBus.gain.value = 0;
          musicBus.connect(master);
          noiseBuffer = makeNoise();
          // iOS 구버전 오디오 잠금 해제용 무음 재생
          const silent = ac.createBufferSource();
          silent.buffer = ac.createBuffer(1, 1, 22050);
          silent.connect(ac.destination);
          silent.start(0);
        }
        if (ac.state !== 'running') ac.resume();
      } catch (e) { /* 오디오 미지원 환경 */ }
    }

    const ready = () => ac && ac.state === 'running' && !muted;
    const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

    function tone({ type = 'sine', f, f2, t, dur, gain, attack = 0.005, dest, filter }) {
      t = t === undefined ? ac.currentTime : t;
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = o;
      if (filter) {
        const lp = ac.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = filter;
        o.connect(lp);
        node = lp;
      }
      node.connect(g);
      g.connect(dest || sfxBus);
      o.start(t);
      o.stop(t + dur + 0.05);
    }

    function noise({ t, dur, gain, type = 'bandpass', f, f2, q = 1, dest }) {
      t = t === undefined ? ac.currentTime : t;
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer;
      const filt = ac.createBiquadFilter();
      filt.type = type;
      filt.Q.value = q;
      filt.frequency.setValueAtTime(f, t);
      if (f2) filt.frequency.exponentialRampToValueAtTime(f2, t + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filt);
      filt.connect(g);
      g.connect(dest || sfxBus);
      src.start(t, Math.random() * 0.5);
      src.stop(t + dur + 0.05);
    }

    // 드롭음: 짧은 '슉'
    function drop() {
      if (!ready()) return;
      noise({ dur: 0.2, gain: 0.35, f: 3200, f2: 500, q: 1.4 });
      tone({ f: 900, f2: 320, dur: 0.14, gain: 0.04 });
    }

    // 착지음: 말랑한 '콩'
    function land() {
      if (!ready()) return;
      tone({ f: 280, f2: 110, dur: 0.13, gain: 0.38 });
      tone({ type: 'triangle', f: 560, f2: 280, dur: 0.07, gain: 0.07 });
    }

    // 퍼펙트음: 맑고 높은 '핑' (콤보마다 음이 올라감)
    function perfect(combo) {
      if (!ready()) return;
      const steps = [0, 2, 4, 7, 9, 12, 14, 16];
      const base = 1046.5 * Math.pow(2, steps[Math.min(combo - 1, steps.length - 1)] / 12);
      const t = ac.currentTime;
      tone({ f: base, t, dur: 0.55, gain: 0.24 });
      tone({ f: base * 2, t, dur: 0.3, gain: 0.06 });
      tone({ f: base * 1.5, t: t + 0.08, dur: 0.5, gain: 0.14 });
      tone({ f: 280, f2: 110, t, dur: 0.12, gain: 0.25 });
    }

    // 붕괴음: 낮고 탁한 소리
    function crash() {
      if (!ready()) return;
      const t = ac.currentTime;
      noise({ t, dur: 1.4, gain: 0.7, type: 'lowpass', f: 900, f2: 120, q: 0.7 });
      tone({ type: 'sawtooth', f: 120, f2: 32, t, dur: 1.2, gain: 0.32, filter: 420 });
      for (let i = 0; i < 6; i++) {
        tone({ f: rand(120, 170), f2: 45, t: t + 0.1 + i * rand(0.12, 0.22), dur: 0.2, gain: 0.25 });
      }
    }

    // 구간 진입 팡파레
    function fanfare() {
      if (!ready()) return;
      const t = ac.currentTime;
      [72, 76, 79, 84].forEach((m, i) => {
        tone({ type: 'triangle', f: midiToFreq(m), t: t + i * 0.09, dur: 0.35, gain: 0.14 });
      });
    }

    function scheduleNote(midi, t, dur, wave, gain, filter) {
      tone({ type: wave, f: midiToFreq(midi), t, dur, gain, attack: 0.012, dest: musicBus, filter: wave === 'sine' ? 0 : filter || 2400 });
    }

    function scheduler() {
      if (!ac || !bgmOn) return;
      if (nextTime < ac.currentTime - 0.2) nextTime = ac.currentTime + 0.05;
      while (nextTime < ac.currentTime + 0.12) {
        const st = STAGES[stage];
        const stepDur = 60 / st.bpm / 2;
        const i = step % 32;
        const lead = st.lead[i];
        const bass = st.bass[i];
        if (lead) scheduleNote(lead, nextTime, stepDur * st.leadLen, st.leadWave, st.leadGain, st.filter);
        if (bass) scheduleNote(bass, nextTime, stepDur * 1.7, st.bassWave, st.bassGain, 600);
        if (st.drums >= 1 && i % 2 === 1) {
          noise({ t: nextTime, dur: 0.04, gain: st.drums === 2 ? 0.07 : 0.04, type: 'highpass', f: 7000, dest: musicBus });
        }
        if (st.drums === 2 && i % 4 === 0) {
          tone({ f: 150, f2: 45, t: nextTime, dur: 0.16, gain: 0.3, dest: musicBus });
        }
        nextTime += stepDur;
        step++;
      }
    }

    function startBgm(s) {
      if (!ac) return;
      stage = s || 0;
      step = 0;
      bgmOn = true;
      nextTime = ac.currentTime + 0.08;
      const g = musicBus.gain;
      g.cancelScheduledValues(ac.currentTime);
      g.setValueAtTime(g.value, ac.currentTime);
      g.linearRampToValueAtTime(1, ac.currentTime + 1);
      if (!timer) timer = setInterval(scheduler, 25);
    }

    function stopBgm() {
      if (!ac) return;
      bgmOn = false;
      const g = musicBus.gain;
      g.cancelScheduledValues(ac.currentTime);
      g.setValueAtTime(g.value, ac.currentTime);
      g.linearRampToValueAtTime(0, ac.currentTime + 0.5);
    }

    function setStage(s) {
      if (s !== stage) {
        stage = s;
        step = 0;
      }
    }

    function toggleMute() {
      muted = !muted;
      storage.set(MUTE_KEY, muted ? '1' : '0');
      if (ac) {
        master.gain.cancelScheduledValues(ac.currentTime);
        master.gain.setValueAtTime(muted ? 0 : 0.9, ac.currentTime);
      }
      return muted;
    }

    function suspend() {
      if (ac && ac.state === 'running') ac.suspend();
    }

    function resume() {
      if (ac && ac.state === 'suspended') ac.resume();
    }

    return {
      unlock, drop, land, perfect, crash, fanfare,
      startBgm, stopBgm, setStage, toggleMute, suspend, resume,
      get muted() { return muted; },
    };
  })();

  // ===================== 캔버스 & 레이아웃 =====================
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const safeProbe = document.getElementById('safe-probe');

  let W = 0;
  let H = 0;
  let DPR = 1;
  let S = 80;          // 블록 한 변 크기(px)
  let groundY = 0;     // 땅 표면(월드 y)
  let baseTopY = 0;    // 받침대 윗면(월드 y)
  let safeTop = 0;

  let sprites = [];
  let gradField;
  let gradSunset;
  let gradSpace;
  let gradGround;

  let clouds = [];
  let stars = [];
  let hills = [];
  let tufts = [];
  let flowers = [];
  let crowd = [];

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;

    S = Math.round(Math.min(W * 0.22, H * 0.11, 110));
    groundY = H * 0.82;
    baseTopY = groundY - S * 0.35;
    safeTop = parseFloat(getComputedStyle(safeProbe).paddingTop) || 0;

    buildSprites();
    buildGradients();
    buildScenery();
  }

  function buildSprites() {
    sprites = ANIMALS.map((emoji, i) => {
      const pad = Math.ceil(S * 0.08);
      const size = S + pad * 2;
      const c = document.createElement('canvas');
      c.width = Math.ceil(size * DPR);
      c.height = Math.ceil(size * DPR);
      const g = c.getContext('2d');
      g.scale(DPR, DPR);
      const x = pad;
      const y = pad;
      const r = S * 0.3;

      // 아래쪽 입체 테두리
      squirclePath(g, x, y + S * 0.05, S, S * 0.95, r);
      g.fillStyle = shade(COLORS[i], -0.22);
      g.fill();
      // 본체
      squirclePath(g, x, y, S, S * 0.92, r);
      g.fillStyle = COLORS[i];
      g.fill();
      g.lineWidth = Math.max(1, S * 0.025);
      g.strokeStyle = shade(COLORS[i], -0.12);
      g.stroke();
      // 하이라이트
      g.globalAlpha = 0.55;
      squirclePath(g, x + S * 0.14, y + S * 0.07, S * 0.72, S * 0.2, S * 0.1);
      g.fillStyle = '#ffffff';
      g.fill();
      g.globalAlpha = 1;
      // 이모지
      g.font = `${Math.round(S * 0.62)}px ${EMOJI_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(emoji, x + S / 2, y + S * 0.5);
      return { c, pad, size };
    });
  }

  function buildGradients() {
    gradField = ctx.createLinearGradient(0, 0, 0, H);
    gradField.addColorStop(0, '#4FB6FF');
    gradField.addColorStop(0.65, '#9EDBFF');
    gradField.addColorStop(1, '#D8F3FF');

    gradSunset = ctx.createLinearGradient(0, 0, 0, H);
    gradSunset.addColorStop(0, '#3A1D6E');
    gradSunset.addColorStop(0.45, '#C24A7A');
    gradSunset.addColorStop(0.75, '#FF8457');
    gradSunset.addColorStop(1, '#FFC27A');

    gradSpace = ctx.createLinearGradient(0, 0, 0, H);
    gradSpace.addColorStop(0, '#02021A');
    gradSpace.addColorStop(0.6, '#0A1040');
    gradSpace.addColorStop(1, '#141A5C');

    gradGround = ctx.createLinearGradient(0, groundY, 0, groundY + H * 0.5);
    gradGround.addColorStop(0, '#86DB62');
    gradGround.addColorStop(1, '#3F9631');
  }

  function buildScenery() {
    clouds = [];
    for (let i = 0; i < 9; i++) {
      clouds.push({ x: Math.random(), y: Math.random(), s: rand(0.6, 1.4), v: rand(0.05, 0.18) });
    }
    stars = [];
    for (let i = 0; i < 150; i++) {
      stars.push({ x: Math.random(), y: Math.random(), r: rand(0.4, 1.8), tw: rand(1, 4), ph: rand(0, TAU) });
    }
    hills = [];
    for (let i = -6; i <= 6; i++) {
      hills.push({ dx: i * S * 1.6 + rand(-S * 0.4, S * 0.4), rx: rand(S * 1.2, S * 2.2), ry: rand(S * 0.5, S * 1.0) });
    }
    tufts = [];
    flowers = [];
    const spanX = W * 1.5;
    for (let i = 0; i < 70; i++) {
      tufts.push({ x: W / 2 + rand(-spanX, spanX), y: groundY + rand(S * 0.1, H * 0.17), s: rand(0.7, 1.3) });
    }
    const flowerColors = ['#FF7BAC', '#FFE066', '#FFFFFF', '#B28DFF', '#FF9F68'];
    for (let i = 0; i < 40; i++) {
      flowers.push({ x: W / 2 + rand(-spanX, spanX), y: groundY + rand(S * 0.2, H * 0.17), c: flowerColors[i % flowerColors.length], s: rand(0.7, 1.2) });
    }

    // 들판에 모인 12간지 동물들 (받침대 양옆 뒷줄 4, 앞줄 8)
    const prevHop = crowd.map((c) => ({ h: c.h, vh: c.vh }));
    crowd = [];
    const sideSpan = Math.max(S * 0.9, Math.min(S * 2.4, W / 2 - S * 0.3 - S * 0.95));
    for (let k = 0; k < 2; k++) {
      const off = S * 0.95 + (sideSpan * (k + 0.5)) / 2;
      crowd.push({ dx: -off, dy: S * 0.12, size: S * 0.5, a: k * 2 });
      crowd.push({ dx: off, dy: S * 0.12, size: S * 0.5, a: k * 2 + 1 });
    }
    const frontW = Math.min(W, S * 9);
    for (let k = 0; k < 8; k++) {
      crowd.push({ dx: (frontW * (k + 0.5)) / 8 - frontW / 2, dy: S * 0.85, size: S * 0.56, a: 4 + k, front: true });
    }
    crowd.forEach((c, i) => {
      c.h = prevHop[i] ? prevHop[i].h : 0;
      c.vh = prevHop[i] ? prevHop[i].vh : 0;
      c.face = c.dx < 0 ? 1 : -1;
    });
  }

  // ===================== 게임 상태 =====================
  let state = STATE.PROLOGUE;
  let time = 0;
  let typeT = 0;

  let blocks = [];       // { u: 중심 x 오프셋(블록 단위), a: 동물 인덱스, squash }
  let mover = { u: 0, dir: 1, active: false, appear: 0 };
  let faller = null;     // { x, y, vy }
  let spawnTimer = 0;

  let lean = 0;          // 누적 기울기(부호 있음)
  let wobble = 0;        // 흔들림 진폭
  let sway = 0;          // 현재 프레임의 탑 꼭대기 흔들림 값
  let dangerShown = 0;
  let combo = 0;

  let camX = 0;
  let camY = 0;
  let shake = 0;

  let mixSunset = 0.65;
  let mixSpace = 0.4;

  let particles = [];
  let floaters = [];
  let banners = [];
  let shootingStars = [];

  let bodies = [];       // 붕괴 시 물리 바디
  let goT = 0;
  let goCamStart = 0;
  let goCamXStart = 0;
  let goCamDur = 1;
  let panelT = 1.5;
  let finalScore = 0;
  let newBest = false;
  let best = parseInt(storage.get(BEST_KEY), 10) || 0;

  // ===================== 난이도 =====================
  function moverSpeed(f) { // 블록/초
    if (f <= 50) return 2.0 + f * 0.012;
    if (f <= 120) return 2.6 + (f - 50) * 0.025;
    return Math.min(6.5, 4.6 + (f - 120) * 0.02);
  }

  function sensitivity(f) {
    if (f <= 50) return 1;
    if (f <= 120) return 1 + ((f - 50) / 70) * 0.6;
    return Math.min(2.0, 1.7 + (f - 120) * 0.005);
  }

  function stageOf(f) {
    return f <= 50 ? 0 : f <= 120 ? 1 : 2;
  }

  const danger = () => Math.abs(lean) + wobble * 0.5;

  // ===================== 탑 좌표 계산 =====================
  function computeSway() {
    const n = blocks.length;
    if (n < 2) return 0;
    const grow = Math.min(1, (n - 1) / 6);
    return (lean * 0.55 + wobble * 0.5 * Math.sin(time * 2.4)) * grow;
  }

  // 꼭대기 쪽 블록일수록 크게 휘어지며 흔들림
  function blockVisual(i) {
    const n = blocks.length;
    const b = blocks[i];
    let off = 0;
    let rot = 0;
    if (n >= 2) {
      const L = Math.min(14, n - 1);
      const k = n - 1 - i;
      const r = Math.max(0, 1 - k / L);
      off = sway * S * r * r;
      rot = clamp(Math.atan((sway * 2 * r) / L), -0.35, 0.35);
    }
    return { x: W / 2 + b.u * S + off, y: baseTopY - S * (i + 0.5), rot };
  }

  const moverY = () => baseTopY - S * (blocks.length + 0.5) - S * HOVER_GAP;

  function moverBounds() {
    const half = Math.min((W / 2 - S * 0.6) / S, MAX_SWING_RANGE);
    const c = camX / S;
    return [c - half, c + half];
  }

  // ===================== 게임 흐름 =====================
  function resetRun() {
    blocks = [];
    faller = null;
    bodies = [];
    lean = 0;
    wobble = 0;
    sway = 0;
    combo = 0;
    particles = [];
    floaters = [];
    banners = [];
    spawnTimer = 0;
    spawnMover();
  }

  function startGame() {
    resetRun();
    state = STATE.PLAYING;
    Sound.startBgm(0);
  }

  function spawnMover() {
    const [lo, hi] = moverBounds();
    mover.dir = Math.random() < 0.5 ? 1 : -1;
    mover.u = mover.dir > 0 ? lo : hi;
    mover.active = true;
    mover.appear = 0;
  }

  function drop() {
    if (!mover.active || faller) return;
    faller = { x: W / 2 + mover.u * S, y: moverY(), vy: S * 3 };
    mover.active = false;
    Sound.drop();
  }

  function land() {
    const n = blocks.length;
    const fx = faller.x;
    let dx;
    let half;
    if (n === 0) {
      dx = fx - W / 2;
      half = BASE_SUPPORT_HALF * S;
    } else {
      dx = fx - blockVisual(n - 1).x;
      half = SUPPORT_HALF * S;
    }

    if (Math.abs(dx) > half) {
      startCollapse(Math.sign(dx) || 1, true);
      return;
    }

    const perfect = Math.abs(dx) < PERFECT_TOL * S;
    let u;
    if (n === 0) u = perfect ? 0 : dx / S;
    else u = perfect ? blocks[n - 1].u : blocks[n - 1].u + dx / S;

    const floor = n + 1;
    blocks.push({ u, a: n % 12, squash: 1 });
    const landX = W / 2 + u * S;
    const landY = faller.y;
    faller = null;

    if (perfect) {
      combo++;
      lean *= 0.45;
      wobble *= 0.35;
      Sound.perfect(combo);
      burst(landX, landY + S * 0.4, COLORS[n % 12]);
      floaters.push({
        text: combo > 1 ? `Perfect! x${combo}` : 'Perfect!',
        x: landX, y: landY - S * 0.9, vy: -S * 0.8, life: 1.1, max: 1.1,
        size: Math.round(S * 0.42), color: '#FFE45C', stroke: '#C0560A',
      });
      cheer(0.6);
    } else {
      combo = 0;
      if (n > 0) {
        const e = clamp(dx / half, -1, 1);
        const s = sensitivity(floor);
        lean = (lean + e * 0.24 * s) * 0.9;
        wobble = (wobble + Math.abs(e) * 0.22 * s) * 0.9;
      }
      Sound.land();
      if (Math.abs(dx) < GOOD_TOL * S) {
        floaters.push({
          text: 'Good!', x: landX, y: landY - S * 0.9, vy: -S * 0.6, life: 0.8, max: 0.8,
          size: Math.round(S * 0.32), color: '#FFFFFF', stroke: 'rgba(0,0,0,0.35)',
        });
      }
    }

    Sound.setStage(stageOf(floor));
    if (floor === 51) {
      banners.push({ text: '🌅 노을 구간!', sub: '조금 더 빨라져요', life: 2.6, max: 2.6 });
      Sound.fanfare();
    } else if (floor === 121) {
      banners.push({ text: '🚀 우주 도착!', sub: '별까지 가 보자!', life: 2.6, max: 2.6 });
      Sound.fanfare();
    } else if (floor % 50 === 0) {
      banners.push({ text: `🎉 ${floor}층 돌파!`, sub: '', life: 2.2, max: 2.2 });
      Sound.fanfare();
    }

    if (danger() >= 1) {
      startCollapse(Math.sign(lean) || Math.sign(dx) || 1, false);
      return;
    }
    spawnTimer = 0.18;
  }

  function startCollapse(dir, missed) {
    state = STATE.GAMEOVER;
    goT = 0;
    finalScore = blocks.length;
    newBest = finalScore > best;
    if (newBest) {
      best = finalScore;
      storage.set(BEST_KEY, String(best));
    }

    const n = blocks.length;
    const spread = Math.min(0.9, n * 0.03);
    bodies = [];
    for (let i = 0; i < n; i++) {
      const v = blockVisual(i);
      const h = n > 1 ? i / (n - 1) : 0;
      const side = Math.random() < 0.8 ? dir : -dir;
      bodies.push({
        x: v.x, y: v.y, rot: v.rot, a: blocks[i].a,
        vx: side * S * (1.8 + h * 2.6 + Math.random() * 1.4),
        vy: -S * rand(1.5, 4.5),
        vr: side * rand(1.5, 4.5),
        delay: n > 1 ? (1 - h) * spread : 0,
        rest: false,
      });
    }
    if (missed && faller) {
      bodies.push({
        x: faller.x, y: faller.y, rot: 0, a: n % 12,
        vx: dir * S * 1.5, vy: faller.vy * 0.3, vr: dir * 5, delay: 0, rest: false,
      });
    }
    faller = null;
    mover.active = false;
    spawnTimer = 0;

    goCamStart = camY;
    goCamXStart = camX;
    goCamDur = clamp(Math.sqrt((2 * Math.max(0, -camY)) / (S * 30)) + 0.4, 0.9, 3.5);
    panelT = Math.min(goCamDur + 0.2, 2.2);
    shake = S * 0.25;

    Sound.stopBgm();
    Sound.crash();
    cheer(1);
  }

  // ===================== 이펙트 =====================
  function burst(x, y, color) {
    const palette = [color, '#FFE45C', '#FFFFFF', '#FF9EC7', '#8FE3FF'];
    for (let i = 0; i < 28; i++) {
      const a = rand(0, TAU);
      const sp = rand(S * 1.5, S * 5);
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - S * 2,
        life: rand(0.6, 1.1), max: 1.1,
        color: palette[i % palette.length],
        size: rand(S * 0.05, S * 0.12),
        star: i % 2 === 0,
        rot: rand(0, TAU), vr: rand(-6, 6),
      });
    }
    particles.push({ ring: true, x, y, r: S * 0.3, life: 0.5, max: 0.5 });
  }

  function cheer(strength) {
    crowd.forEach((c) => {
      if (c.h <= 0 && Math.random() < strength + 0.2) c.vh = S * rand(2.5, 4.5) * strength;
    });
  }

  // ===================== 업데이트 =====================
  function update(dt) {
    time += dt;

    // 배경 믹스: 카메라 고도(층)에 따라 부드럽게 전환
    let tSunset;
    let tSpace;
    if (state === STATE.PROLOGUE) {
      tSunset = 0.65;
      tSpace = 0.4;
    } else {
      const camFloor = (baseTopY - H * CAM_ANCHOR - camY) / S;
      tSunset = clamp((camFloor - 50) / 6, 0, 1);
      tSpace = clamp((camFloor - 120) / 6, 0, 1);
    }
    mixSunset += (tSunset - mixSunset) * damp(1.6, dt);
    mixSpace += (tSpace - mixSpace) * damp(1.6, dt);

    // 동물 친구들 깡충깡충
    const hopRate = state === STATE.PROLOGUE ? 0.7 : 0.08;
    for (const c of crowd) {
      if (c.h <= 0 && c.vh <= 0 && Math.random() < hopRate * dt) c.vh = S * rand(1.8, 3.2);
      if (c.vh !== 0 || c.h > 0) {
        c.vh -= S * 22 * dt;
        c.h += c.vh * dt;
        if (c.h <= 0) {
          c.h = 0;
          c.vh = 0;
        }
      }
    }

    if (state === STATE.PROLOGUE) typeT += dt;
    else if (state === STATE.PLAYING) updatePlaying(dt);
    else updateGameOver(dt);

    sway = state === STATE.PLAYING ? computeSway() : sway;
    dangerShown += (danger() - dangerShown) * damp(6, dt);
    shake *= Math.exp(-6 * dt);

    for (let i = blocks.length - 1; i >= Math.max(0, blocks.length - 3); i--) {
      blocks[i].squash = Math.max(0, blocks[i].squash - dt * 4);
    }

    for (const p of particles) {
      p.life -= dt;
      if (p.ring) {
        p.r += S * 6 * dt;
      } else {
        p.vy += S * 8 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
      }
    }
    particles = particles.filter((p) => p.life > 0);

    for (const f of floaters) {
      f.life -= dt;
      f.y += f.vy * dt;
    }
    floaters = floaters.filter((f) => f.life > 0);

    for (const b of banners) b.life -= dt;
    banners = banners.filter((b) => b.life > 0);

    if (mixSpace > 0.5 && Math.random() < dt * 0.3) {
      shootingStars.push({ x: rand(0, W), y: rand(0, H * 0.5), vx: -rand(300, 600), vy: rand(120, 260), life: 0.9, max: 0.9 });
    }
    for (const s of shootingStars) {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    shootingStars = shootingStars.filter((s) => s.life > 0);
  }

  function updatePlaying(dt) {
    const n = blocks.length;

    // 카메라: 탑 꼭대기를 따라 부드럽게 패닝
    const targetCamY = Math.min(0, baseTopY - S * n - H * CAM_ANCHOR);
    camY += (targetCamY - camY) * damp(4, dt);
    const targetCamX = n ? blocks[n - 1].u * S : 0;
    camX += (targetCamX - camX) * damp(2.5, dt);

    if (spawnTimer > 0) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) spawnMover();
    }

    if (mover.active) {
      const [lo, hi] = moverBounds();
      mover.u += mover.dir * moverSpeed(n + 1) * dt;
      if (mover.u > hi) {
        mover.u = hi;
        mover.dir = -1;
      } else if (mover.u < lo) {
        mover.u = lo;
        mover.dir = 1;
      }
      mover.appear = Math.min(1, mover.appear + dt * 6);
    }

    if (faller) {
      faller.vy = Math.min(faller.vy + S * 30 * dt, S * 14);
      faller.y += faller.vy * dt;
      const landY = baseTopY - S * (n + 0.5);
      if (faller.y >= landY) {
        faller.y = landY;
        land();
      }
    }
  }

  function updateGameOver(dt) {
    goT += dt;
    const e = easeInOutCubic(clamp(goT / goCamDur, 0, 1));
    camY = goCamStart * (1 - e);
    camX = goCamXStart * (1 - e);

    const g = S * 30;
    for (const b of bodies) {
      if (b.delay > 0) {
        b.delay -= dt;
        continue;
      }
      if (b.rest) {
        b.vx *= Math.exp(-3 * dt);
        b.x += b.vx * dt;
        const target = Math.round(b.rot / (Math.PI / 2)) * (Math.PI / 2);
        b.rot += (target - b.rot) * damp(10, dt);
        if (Math.abs(b.vx) > 1 && surfaceUnder(b).y > b.y + S * 0.5 + 1) b.rest = false;
        continue;
      }
      b.vy += g * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      const { y: floor, on } = surfaceUnder(b);
      if (b.y + S * 0.5 >= floor) {
        b.y = floor - S * 0.5;
        if (on && Math.abs(b.x - on.x) > S * 0.15) {
          // 다른 블록 모서리에 걸치면 옆으로 미끄러져 떨어짐
          const s = Math.sign(b.x - on.x);
          b.vx = s * Math.max(Math.abs(b.vx), S * 2.5);
          b.vy = 0;
          b.vr = s * 3;
        } else if (b.vy > S * 4) {
          b.vy = -b.vy * 0.3;
          b.vx *= 0.7;
          b.vr = b.vr * 0.5 + rand(-1, 1);
        } else {
          b.vy = 0;
          b.vr = 0;
          b.rest = true;
        }
      }
    }
  }

  // 무너진 블록이 떨어질 바닥(받침대, 땅, 먼저 쌓인 블록 더미)
  function surfaceUnder(b) {
    let y = Math.abs(b.x - W / 2) < S * 0.85 ? baseTopY : groundY + S * 0.2;
    let on = null;
    for (const o of bodies) {
      if (o === b || !o.rest) continue;
      if (Math.abs(o.x - b.x) < S * 0.8 && o.y > b.y - S * 0.2 && o.y - S * 0.5 < y) {
        y = o.y - S * 0.5;
        on = o;
      }
    }
    return { y, on };
  }

  // ===================== 렌더링 =====================
  function drawText(str, x, y, size, color, opts = {}) {
    ctx.font = `${opts.weight || 800} ${size}px ${UI_FONT}`;
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = 'middle';
    if (opts.stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = opts.strokeWidth || size * 0.2;
      ctx.strokeStyle = opts.stroke;
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function drawBlock(a, x, y, rot, squash) {
    const sp = sprites[a];
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.translate(0, S / 2);
    if (squash) ctx.scale(1 + 0.14 * squash, 1 - 0.14 * squash);
    ctx.drawImage(sp.c, -sp.size / 2, -S - sp.pad, sp.size, sp.size);
    ctx.restore();
  }

  function circle(x, y, r) {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, TAU);
  }

  function drawSky() {
    ctx.globalAlpha = 1;
    ctx.fillStyle = gradField;
    ctx.fillRect(0, 0, W, H);
    if (mixSunset > 0.003) {
      ctx.globalAlpha = mixSunset;
      ctx.fillStyle = gradSunset;
      ctx.fillRect(0, 0, W, H);
    }
    if (mixSpace > 0.003) {
      ctx.globalAlpha = mixSpace;
      ctx.fillStyle = gradSpace;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalAlpha = 1;
  }

  function drawBackdrop() {
    // 별
    const starAlpha = Math.max(mixSpace, mixSunset * 0.25);
    if (starAlpha > 0.01) {
      ctx.fillStyle = '#FFFFFF';
      for (const s of stars) {
        const y = (((s.y * H - camY * 0.04) % H) + H) % H;
        ctx.globalAlpha = starAlpha * (0.45 + 0.55 * Math.sin(time * s.tw + s.ph) ** 2);
        ctx.fillRect(s.x * W - s.r / 2, y - s.r / 2, s.r, s.r);
      }
      ctx.globalAlpha = 1;
    }

    // 별똥별
    for (const s of shootingStars) {
      ctx.globalAlpha = (s.life / s.max) * mixSpace;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.12, s.y - s.vy * 0.12);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 노을 해
    const sunAlpha = mixSunset * (1 - mixSpace);
    if (state !== STATE.PROLOGUE && sunAlpha > 0.01) {
      const sx = W * 0.74;
      const sy = H * 0.6;
      const r = S * 1.1;
      ctx.globalAlpha = sunAlpha;
      const glow = ctx.createRadialGradient(sx, sy, r * 0.3, sx, sy, r * 2.6);
      glow.addColorStop(0, 'rgba(255,220,140,0.9)');
      glow.addColorStop(1, 'rgba(255,140,90,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sx - r * 2.6, sy - r * 2.6, r * 5.2, r * 5.2);
      ctx.fillStyle = '#FFD27A';
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 우주 행성들
    if (state !== STATE.PROLOGUE && mixSpace > 0.01) {
      ctx.globalAlpha = mixSpace;
      const px = W * 0.2;
      const py = H * 0.32 + Math.sin(time * 0.4) * S * 0.08;
      const pr = S * 0.65;
      const pg = ctx.createLinearGradient(px - pr, py - pr, px + pr, py + pr);
      pg.addColorStop(0, '#C9A2FF');
      pg.addColorStop(1, '#6D4BD1');
      ctx.strokeStyle = 'rgba(255,220,170,0.85)';
      ctx.lineWidth = S * 0.08;
      ctx.beginPath();
      ctx.ellipse(px, py, pr * 1.7, pr * 0.45, -0.3, Math.PI, TAU);
      ctx.stroke();
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(px, py, pr * 1.7, pr * 0.45, -0.3, 0, Math.PI);
      ctx.stroke();

      const mx = W * 0.82;
      const my = H * 0.16 + safeTop;
      ctx.fillStyle = '#FFF6D5';
      ctx.beginPath();
      ctx.arc(mx, my, S * 0.35, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(200,190,160,0.6)';
      ctx.beginPath();
      circle(mx - S * 0.1, my - S * 0.06, S * 0.07);
      circle(mx + S * 0.12, my + S * 0.1, S * 0.05);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 구름
    const cloudAlpha = (1 - mixSpace) * (1 - mixSunset * 0.45) * 0.9;
    if (cloudAlpha > 0.01) {
      ctx.globalAlpha = cloudAlpha;
      ctx.fillStyle = '#FFFFFF';
      const spanY = H * 1.6;
      const spanX = W * 1.4;
      for (const c of clouds) {
        const y = (((c.y * spanY - camY * 0.35) % spanY) + spanY) % spanY - H * 0.3;
        const x = (((c.x * spanX + time * c.v * S - camX * 0.3) % spanX) + spanX) % spanX - W * 0.2;
        const r = S * 0.42 * c.s;
        ctx.beginPath();
        circle(x, y, r);
        circle(x + r * 0.95, y + r * 0.18, r * 0.78);
        circle(x - r * 0.95, y + r * 0.22, r * 0.68);
        circle(x + r * 0.25, y - r * 0.45, r * 0.72);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawGround() {
    if (groundY - S * 1.5 - camY > H) return;
    const left = camX - 20;
    const right = camX + W + 20;

    // 하늘색에 맞춰 들판 톤 조정
    const tint = mixSunset * 0.35 + mixSpace * 0.3;
    const tintColor = `rgba(40,20,90,${tint})`;

    // 뒷산
    ctx.beginPath();
    for (const h of hills) {
      const x = W / 2 + h.dx;
      ctx.moveTo(x - h.rx, groundY + 2);
      ctx.ellipse(x, groundY + 2, h.rx, h.ry, 0, Math.PI, TAU);
    }
    ctx.fillStyle = '#6FCB55';
    ctx.fill();
    if (tint > 0.01) {
      ctx.fillStyle = tintColor;
      ctx.fill();
    }

    // 들판
    ctx.fillStyle = gradGround;
    ctx.fillRect(left, groundY, right - left, H * 2);

    // 풀과 꽃
    ctx.strokeStyle = '#3E9A2E';
    ctx.lineWidth = Math.max(1.5, S * 0.03);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const t of tufts) {
      const h = S * 0.14 * t.s;
      ctx.moveTo(t.x - h * 0.5, t.y - h);
      ctx.lineTo(t.x, t.y);
      ctx.lineTo(t.x + h * 0.5, t.y - h);
      ctx.moveTo(t.x, t.y);
      ctx.lineTo(t.x, t.y - h * 1.2);
    }
    ctx.stroke();
    for (const f of flowers) {
      const r = S * 0.05 * f.s;
      ctx.fillStyle = f.c;
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU;
        circle(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r, r * 0.8);
      }
      ctx.fill();
      ctx.fillStyle = '#FFB830';
      ctx.beginPath();
      circle(f.x, f.y, r * 0.6);
      ctx.fill();
    }

    if (tint > 0.01) {
      ctx.fillStyle = tintColor;
      ctx.fillRect(left, groundY, right - left, H * 2);
    }
  }

  function drawPedestal() {
    const pw = S * 1.7;
    const px = W / 2 - pw / 2;
    const ph = groundY + S * 0.25 - baseTopY;
    squirclePath(ctx, px, baseTopY, pw, ph, S * 0.18);
    ctx.fillStyle = '#B9814F';
    ctx.fill();
    ctx.fillStyle = 'rgba(120,70,30,0.35)';
    ctx.beginPath();
    circle(px + pw * 0.25, baseTopY + ph * 0.6, S * 0.06);
    circle(px + pw * 0.7, baseTopY + ph * 0.45, S * 0.05);
    ctx.fill();
    squirclePath(ctx, px - S * 0.06, baseTopY - S * 0.05, pw + S * 0.12, S * 0.18, S * 0.09);
    ctx.fillStyle = '#68C94A';
    ctx.fill();
  }

  function drawCrowd(front) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const c of crowd) {
      if (!!c.front !== front) continue;
      const x = W / 2 + c.dx;
      const y = groundY + c.dy;
      const sq = c.h > 0 ? 0 : 1;
      ctx.fillStyle = `rgba(0,0,0,${0.18 - Math.min(0.12, c.h / S * 0.1)})`;
      ctx.beginPath();
      ctx.ellipse(x, y, c.size * 0.4, c.size * 0.1, 0, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.translate(x, y - c.h);
      ctx.scale(c.face * (1 + 0.04 * sq * Math.sin(time * 6 + c.dx)), 1);
      ctx.font = `${Math.round(c.size)}px ${EMOJI_FONT}`;
      ctx.fillStyle = '#000000';
      ctx.fillText(ANIMALS[c.a], 0, c.size * 0.08);
      ctx.restore();
    }
  }

  function visibleRange() {
    const lo = Math.max(0, Math.floor((baseTopY - camY - H - S) / S - 0.5));
    const hi = Math.min(blocks.length - 1, Math.ceil((baseTopY - camY + S) / S));
    return [lo, hi];
  }

  function drawTower() {
    const [lo, hi] = visibleRange();
    for (let i = lo; i <= hi; i++) {
      const v = blockVisual(i);
      drawBlock(blocks[i].a, v.x, v.y, v.rot, blocks[i].squash);
    }
  }

  function drawBodies() {
    for (const b of bodies) {
      const sy = b.y - camY;
      if (sy < -S * 2 || sy > H + S * 2) continue;
      drawBlock(b.a, b.x, b.y, b.rot, 0);
    }
  }

  function drawMoverAndFaller() {
    const n = blocks.length;
    if (mover.active) {
      const x = W / 2 + mover.u * S;
      const y = moverY();
      const surfaceY = baseTopY - S * n;
      // 떨어질 위치 가이드
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = Math.max(2, S * 0.03);
      ctx.setLineDash([S * 0.08, S * 0.1]);
      ctx.beginPath();
      ctx.moveTo(x, y + S * 0.55);
      ctx.lineTo(x, surfaceY);
      ctx.stroke();
      ctx.restore();

      const s = 0.6 + 0.4 * mover.appear;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      drawBlock(n % 12, 0, Math.sin(time * 5) * S * 0.03, 0, 0);
      ctx.restore();
    }
    if (faller) drawBlock(n % 12, faller.x, faller.y, 0, 0);
  }

  function drawParticles() {
    for (const p of particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      if (p.ring) {
        ctx.strokeStyle = '#FFF3A0';
        ctx.lineWidth = S * 0.08 * a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.stroke();
      } else if (p.star) {
        ctx.fillStyle = p.color;
        starPath(ctx, p.x, p.y, p.size * 1.6, p.size * 0.7, p.rot);
        ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawFloaters() {
    for (const f of floaters) {
      const p = 1 - f.life / f.max;
      const scale = 1 + 0.5 * Math.max(0, 1 - p * 6);
      ctx.save();
      ctx.globalAlpha = clamp(f.life / (f.max * 0.4), 0, 1);
      ctx.translate(f.x, f.y);
      ctx.scale(scale, scale);
      drawText(f.text, 0, 0, f.size, f.color, { stroke: f.stroke, weight: 900 });
      ctx.restore();
    }
  }

  function muteButton() {
    const r = 21;
    return { x: W - r - 14, y: safeTop + r + 12, r };
  }

  function drawMuteButton() {
    const b = muteButton();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.fill();
    ctx.font = `${Math.round(b.r * 1.0)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(Sound.muted ? '🔇' : '🔊', b.x, b.y + 1);
  }

  function drawPrologue() {
    // 하늘의 커다란 별
    const sx = W / 2;
    const sy = safeTop + H * 0.12;
    const pulse = 1 + Math.sin(time * 2.2) * 0.08;
    const R = S * 0.55 * pulse;
    const glow = ctx.createRadialGradient(sx, sy, R * 0.2, sx, sy, R * 3);
    glow.addColorStop(0, 'rgba(255,240,170,0.85)');
    glow.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - R * 3, sy - R * 3, R * 6, R * 6);
    ctx.fillStyle = '#FFE873';
    starPath(ctx, sx, sy, R, R * 0.45, Math.sin(time * 0.8) * 0.15);
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      const a = time * 0.9 + (i * TAU) / 4;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 3 + i);
      starPath(ctx, sx + Math.cos(a) * R * 2, sy + Math.sin(a) * R * 1.3, S * 0.08, S * 0.035, 0);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const titleSize = Math.round(clamp(W * 0.1, 30, 52));
    drawText('Zodiac Tower', W / 2, safeTop + H * 0.24, titleSize, '#FFFFFF', { stroke: 'rgba(60,20,90,0.55)', weight: 900 });
    drawText('우주 콩콩 동물탑', W / 2, safeTop + H * 0.24 + titleSize * 0.95, Math.round(titleSize * 0.5), '#FFE873', { stroke: 'rgba(60,20,90,0.55)', weight: 800 });

    // 타이핑 텍스트
    const chars = Array.from(PROLOGUE_TEXT);
    const shown = Math.min(chars.length, Math.floor(typeT / 0.12));
    const done = shown >= chars.length;
    const cursor = !done && Math.floor(time * 3) % 2 === 0 ? '|' : '';
    const size = Math.round(clamp(W * 0.065, 20, 32));
    drawText(chars.slice(0, shown).join('') + cursor, W / 2, H * 0.43, size, '#FFFFFF', { stroke: 'rgba(30,10,60,0.6)', weight: 800 });

    if (done) {
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(time * 4);
      drawText('👆 화면을 톡! 눌러서 시작', W / 2, H * 0.43 + size * 1.8, Math.round(size * 0.72), '#FFFFFF', { stroke: 'rgba(30,10,60,0.5)' });
      ctx.globalAlpha = 1;
    }
  }

  function drawHUD() {
    const n = blocks.length;
    const top = safeTop + 12;
    const big = Math.round(clamp(W * 0.11, 34, 56));
    drawText(`${n}층`, W / 2, top + big * 0.6, big, '#FFFFFF', { stroke: 'rgba(0,0,0,0.35)', weight: 900 });
    drawText(`최고 ${best}층`, W / 2, top + big * 1.3, Math.round(big * 0.32), 'rgba(255,255,255,0.92)', { stroke: 'rgba(0,0,0,0.3)' });

    // 균형 게이지
    if (n >= 2) {
      const gw = Math.min(W * 0.42, 200);
      const gh = 10;
      const gx = W / 2 - gw / 2 + 18;
      const gy = top + big * 1.75;
      const d = clamp(dangerShown, 0, 1);
      drawText('균형', gx - 24, gy + gh / 2, 13, '#FFFFFF', { stroke: 'rgba(0,0,0,0.35)', weight: 800 });
      squirclePath(ctx, gx, gy, gw, gh, gh / 2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fill();
      if (d > 0.01) {
        const color = d < 0.4 ? '#6BE36B' : d < 0.7 ? '#FFD93D' : '#FF5E5E';
        ctx.globalAlpha = d > 0.75 ? 0.6 + 0.4 * Math.sin(time * 14) : 1;
        squirclePath(ctx, gx, gy, Math.max(gh, gw * d), gh, gh / 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // 첫 블록 안내
    if (n === 0 && mover.active) {
      const y = moverY() - camY - S * 0.95;
      ctx.globalAlpha = 0.65 + 0.35 * Math.sin(time * 4);
      drawText('화면을 톡! 눌러서 떨어뜨려요', W / 2, y, Math.round(clamp(W * 0.05, 16, 24)), '#FFFFFF', { stroke: 'rgba(20,60,120,0.6)' });
      ctx.globalAlpha = 1;
    }

    for (const b of banners) {
      const p = 1 - b.life / b.max;
      const a = Math.min(1, p * 6, b.life * 2);
      const s = 1 + 0.25 * Math.max(0, 1 - p * 8);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(W / 2, H * 0.3);
      ctx.scale(s, s);
      const size = Math.round(clamp(W * 0.08, 24, 40));
      drawText(b.text, 0, 0, size, '#FFFFFF', { stroke: 'rgba(80,20,90,0.6)', weight: 900 });
      if (b.sub) drawText(b.sub, 0, size * 1.1, Math.round(size * 0.5), '#FFF3A0', { stroke: 'rgba(80,20,90,0.5)' });
      ctx.restore();
    }
  }

  function drawGameOver() {
    if (goT < panelT) return;
    const a = clamp((goT - panelT) / 0.35, 0, 1);
    const pw = Math.min(W * 0.84, 360);
    const ph = Math.min(H * 0.42, 300);
    const px = W / 2 - pw / 2;
    const py = H * 0.4 - ph / 2;
    const s = 0.85 + 0.15 * easeInOutCubic(a);

    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H * 0.4);
    ctx.scale(s, s);
    ctx.translate(-W / 2, -H * 0.4);

    squirclePath(ctx, px, py + 6, pw, ph, 28);
    ctx.fillStyle = 'rgba(80,40,120,0.5)';
    ctx.fill();
    squirclePath(ctx, px, py, pw, ph, 28);
    ctx.fillStyle = '#FFF8EC';
    ctx.fill();

    const cx = W / 2;
    const unit = ph / 10;
    drawText('와르르~! 💥', cx, py + unit * 1.5, Math.round(unit * 0.95), '#7A4BC2', { weight: 900 });
    drawText(`${finalScore}층`, cx, py + unit * 4, Math.round(unit * 2.2), '#FF7A59', { weight: 900, stroke: '#FFFFFF', strokeWidth: 6 });
    if (newBest && finalScore > 0) {
      drawText('🎉 새로운 최고 기록!', cx, py + unit * 6.1, Math.round(unit * 0.75), '#E0559A', { weight: 900 });
    } else {
      drawText(`최고 기록 ${best}층`, cx, py + unit * 6.1, Math.round(unit * 0.7), '#8A7BA8', { weight: 800 });
    }
    if (goT > panelT + 0.35) {
      ctx.globalAlpha = a * (0.55 + 0.45 * Math.sin(time * 4));
      drawText('👆 터치하면 다시 시작!', cx, py + unit * 8.3, Math.round(unit * 0.72), '#5B4B7A', { weight: 800 });
    }
    ctx.restore();
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawSky();
    drawBackdrop();

    let sx = 0;
    let sy = 0;
    if (shake > 0.5) {
      sx = (Math.random() - 0.5) * shake;
      sy = (Math.random() - 0.5) * shake;
    }
    ctx.save();
    ctx.translate(sx - camX, sy - camY);
    drawGround();
    drawCrowd(false);
    drawPedestal();
    if (state === STATE.GAMEOVER) drawBodies();
    else drawTower();
    drawCrowd(true);
    if (state === STATE.PLAYING) drawMoverAndFaller();
    drawParticles();
    drawFloaters();
    ctx.restore();

    if (state === STATE.PROLOGUE) drawPrologue();
    else if (state === STATE.PLAYING) drawHUD();
    else drawGameOver();
    drawMuteButton();
  }

  // ===================== 입력 =====================
  function onPress(x, y) {
    Sound.unlock();
    const mb = muteButton();
    if (x >= 0 && Math.hypot(x - mb.x, y - mb.y) < mb.r + 10) {
      Sound.toggleMute();
      return;
    }
    if (state === STATE.PROLOGUE) {
      startGame();
    } else if (state === STATE.PLAYING) {
      drop();
    } else if (goT > panelT + 0.35) {
      startGame();
    }
  }

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    onPress(t.clientX, t.clientY);
  }, { passive: false });

  // touchend는 브라우저가 인정하는 사용자 제스처라 오디오 잠금 해제에 사용
  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    Sound.unlock();
  }, { passive: false });

  canvas.addEventListener('click', (e) => onPress(e.clientX, e.clientY));

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (!e.repeat) onPress(-1, -1);
    }
  });

  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) Sound.suspend();
    else Sound.resume();
  });

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));

  // ===================== 메인 루프 =====================
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  resize();
  requestAnimationFrame(frame);
})();
