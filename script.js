'use strict';

(() => {
  // ===================== 상수 =====================
  // 12간지 순서: 쥐, 소, 호랑이, 토끼, 용, 뱀, 말, 양, 원숭이, 닭, 개, 돼지
  const COLORS = [
    '#D3CCEB', // 쥐 - 라벤더 그레이
    '#FBF4E6', // 소 - 우유빛
    '#FFC27A', // 호랑이 - 살구 오렌지
    '#FFF1F5', // 토끼 - 벚꽃 화이트
    '#9EE6BE', // 용 - 민트
    '#C3E88C', // 뱀 - 라임
    '#DDA877', // 말 - 캐러멜
    '#FFFDF4', // 양 - 구름 양털
    '#C99168', // 원숭이 - 코코아
    '#FFF6DE', // 닭 - 바닐라
    '#F2CF9E', // 개 - 비스킷
    '#FFC8D5', // 돼지 - 딸기우유
  ];
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Segoe UI Symbol",sans-serif';
  const UI_FONT = '-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif';
  const PROLOGUE_TEXT = '저 별에는 무엇이 있을까?';

  const TAU = Math.PI * 2;
  const BLOCK_RATIO = 1.75;       // 블록 가로/세로 비율
  const HOVER_GAP = 2.8;          // 이동 블록과 탑 꼭대기 사이 거리(블록 높이 단위)
  const PERFECT_TOL = 0.06;       // 퍼펙트 판정 허용 오차(블록 너비 대비)
  const GOOD_TOL = 0.14;
  const SUPPORT_HALF = 0.52;      // 중심이 이 범위를 벗어나면 낙하(블록 너비 대비)
  const PEDESTAL_HALF = 0.62;     // 받침대 절반 너비(블록 너비 대비)
  const CAM_ANCHOR = 0.62;        // 탑 꼭대기가 화면 높이의 이 위치에 오도록 카메라 이동
  const MAX_SWING_RANGE = 2.4;    // 이동 블록의 최대 좌우 진폭(블록 높이 단위)
  const MUTE_KEY = 'zodiacTower.muted';
  const MODE_KEY = 'zodiacTower.mode';

  // 난이도: speed=블록 이동 속도 배율, sens=흔들림 민감도 배율, perfect=퍼펙트 판정 폭 배율, tempo=BGM 템포 배율
  const MODES = [
    {
      tier: '초보자', icon: '🐣', name: '아장아장 산책', desc: '천천히 콩콩, 처음이라면 여기!',
      color: '#5DBB63', speed: 1, sens: 1, perfect: 1, tempo: 1, bestKey: 'zodiacTower.best',
    },
    {
      tier: '전문가', icon: '🐯', name: '씽씽 질주', desc: '더 빠르게! 실력을 보여줘',
      color: '#FF9233', speed: 2, sens: 1.25, perfect: 0.85, tempo: 1.12, bestKey: 'zodiacTower.best.expert',
    },
    {
      tier: '지옥', icon: '🔥', name: '불꽃 지옥', desc: '눈 깜짝할 새! 진짜 고수만',
      color: '#E23E57', speed: 3, sens: 1.6, perfect: 0.7, tempo: 1.25, bestKey: 'zodiacTower.best.hell',
    },
  ];

  const STATE = { PROLOGUE: 'PROLOGUE', SELECT: 'SELECT', PLAYING: 'PLAYING', GAMEOVER: 'GAMEOVER' };

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
    let tempo = 1;
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

    // 메뉴 선택음: 짧은 '뾱'
    function click() {
      if (!ready()) return;
      tone({ type: 'triangle', f: 660, f2: 1320, dur: 0.12, gain: 0.18 });
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
        const stepDur = 60 / (st.bpm * tempo) / 2;
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

    function startBgm(s, tempoMul) {
      if (!ac) return;
      stage = s || 0;
      tempo = tempoMul || 1;
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
      unlock, drop, land, perfect, crash, fanfare, click,
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
  let S = 80;          // 블록 높이(px), 게임 전체의 기본 길이 단위
  let BW = 140;        // 블록 너비(px)
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

    S = Math.round(Math.min(W * 0.19, H * 0.095, 96));
    BW = Math.round(S * BLOCK_RATIO);
    groundY = H * 0.82;
    baseTopY = groundY - S * 0.35;
    safeTop = parseFloat(getComputedStyle(safeProbe).paddingTop) || 0;

    buildSprites();
    buildGradients();
    buildScenery();
  }

  // 블록 스프라이트: 가로로 긴 둥근 직사각형 몸통 + 귀·뿔·꼬리 등이 바깥으로 살짝 튀어나옴
  function buildSprites() {
    const padTop = Math.ceil(S * 0.66);
    const padSide = Math.ceil(S * 0.4);
    const padBottom = Math.ceil(S * 0.08);
    const w = BW + padSide * 2;
    const h = S + padTop + padBottom;
    sprites = COLORS.map((_, i) => {
      const c = document.createElement('canvas');
      c.width = Math.ceil(w * DPR);
      c.height = Math.ceil(h * DPR);
      const g = c.getContext('2d');
      g.scale(DPR, DPR);
      g.lineJoin = 'round';
      g.lineCap = 'round';
      drawCharacter(g, i, padSide, padTop, BW, S);
      return { c, w, h, ox: padSide + BW / 2, oy: padTop + S };
    });
  }

  function drawCharacter(g, idx, x, y, w, h) {
    const cx = x + w / 2;
    const col = COLORS[idx];
    const line = shade(col, -0.45);
    const lw = Math.max(1, h * 0.035);
    const INK = '#2E2228';

    const paint = (fill, stroke) => {
      g.fillStyle = fill;
      g.fill();
      if (stroke !== false) {
        g.lineWidth = lw;
        g.strokeStyle = stroke || line;
        g.stroke();
      }
    };
    const oval = (ex, ey, rx, ry, fill, rot = 0, stroke) => {
      g.beginPath();
      g.ellipse(ex, ey, rx, ry, rot, 0, TAU);
      paint(fill, stroke);
    };
    const poly = (pts, fill, stroke) => {
      g.beginPath();
      pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py)));
      g.closePath();
      paint(fill, stroke);
    };
    const strokePath = (build, color, width) => {
      g.beginPath();
      build();
      g.strokeStyle = color;
      g.lineWidth = width;
      g.stroke();
    };
    const bodyPath = () => squirclePath(g, x, y, w, h * 0.92, h * 0.36);
    const clipBody = (fn) => {
      g.save();
      bodyPath();
      g.clip();
      fn();
      g.restore();
    };
    const body = () => {
      squirclePath(g, x, y + h * 0.06, w, h * 0.94, h * 0.36);
      paint(shade(col, -0.2));
      bodyPath();
      paint(col);
      g.globalAlpha = 0.45;
      squirclePath(g, x + h * 0.32, y + h * 0.07, w * 0.28, h * 0.08, h * 0.04);
      paint('#FFFFFF', false);
      g.globalAlpha = 1;
    };
    const eyes = (ey, dx, r = h * 0.085) => {
      for (const s of [-1, 1]) {
        oval(cx + s * dx, ey, r * 0.82, r, INK, 0, false);
        oval(cx + s * dx - r * 0.25, ey - r * 0.38, r * 0.32, r * 0.32, '#FFFFFF', 0, false);
      }
    };
    const blush = (by, dx, color = 'rgba(255,110,140,0.4)') => {
      for (const s of [-1, 1]) oval(cx + s * dx, by, h * 0.1, h * 0.055, color, 0, false);
    };
    // 'ω' 모양 입
    const mouth = (my, size = h * 0.065) => {
      const r = size / 2;
      const a0 = 0.1 * Math.PI;
      const a1 = 0.9 * Math.PI;
      strokePath(() => {
        g.arc(cx - r, my, r, a0, a1);
        g.moveTo(cx + r + r * Math.cos(a0), my + r * Math.sin(a0));
        g.arc(cx + r, my, r, a0, a1);
      }, '#4A3530', lw);
    };

    switch (idx) {
      case 0: { // 쥐: 큰 동그란 귀, 앞니, 수염, 분홍 꼬리
        for (const s of [-1, 1]) {
          oval(cx + s * h * 0.52, y + h * 0.04, h * 0.27, h * 0.26, col);
          oval(cx + s * h * 0.52, y + h * 0.06, h * 0.16, h * 0.15, '#F7B6C8', 0, false);
        }
        strokePath(() => {
          g.moveTo(x + w - h * 0.08, y + h * 0.66);
          g.quadraticCurveTo(x + w + h * 0.32, y + h * 0.72, x + w + h * 0.24, y + h * 0.34);
        }, '#E79AB0', h * 0.055);
        body();
        eyes(y + h * 0.4, h * 0.28);
        blush(y + h * 0.56, h * 0.52);
        g.beginPath();
        g.rect(cx - h * 0.06, y + h * 0.6, h * 0.12, h * 0.1);
        paint('#FFFFFF', '#9C8F9F');
        strokePath(() => {
          g.moveTo(cx, y + h * 0.6);
          g.lineTo(cx, y + h * 0.7);
        }, '#9C8F9F', lw * 0.8);
        oval(cx, y + h * 0.54, h * 0.075, h * 0.055, '#F48FB1', 0, false);
        strokePath(() => {
          for (const s of [-1, 1]) {
            g.moveTo(cx + s * h * 0.17, y + h * 0.53);
            g.lineTo(cx + s * h * 0.52, y + h * 0.46);
            g.moveTo(cx + s * h * 0.17, y + h * 0.59);
            g.lineTo(cx + s * h * 0.52, y + h * 0.64);
          }
        }, '#7D7393', lw * 0.8);
        break;
      }
      case 1: { // 소: 뿔, 얼룩무늬, 분홍 코, 코뚜레
        for (const s of [-1, 1]) {
          g.beginPath();
          g.moveTo(cx + s * h * 0.36, y + h * 0.12);
          g.quadraticCurveTo(cx + s * h * 0.8, y + h * 0.08, cx + s * h * 0.76, y - h * 0.32);
          g.quadraticCurveTo(cx + s * h * 0.62, y - h * 0.02, cx + s * h * 0.2, y + h * 0.04);
          g.closePath();
          paint('#F5DFA8');
          oval(cx + s * (w / 2 + h * 0.02), y + h * 0.3, h * 0.18, h * 0.09, '#E9D6C3', s * 0.3);
        }
        body();
        clipBody(() => {
          oval(x + h * 0.12, y + h * 0.12, h * 0.34, h * 0.26, '#7A5238', 0.3, false);
          oval(x + w - h * 0.12, y + h * 0.8, h * 0.32, h * 0.22, '#7A5238', 0, false);
          oval(cx + h * 0.45, y + h * 0.02, h * 0.15, h * 0.1, '#7A5238', 0, false);
        });
        eyes(y + h * 0.36, h * 0.3);
        blush(y + h * 0.5, h * 0.56);
        oval(cx, y + h * 0.66, h * 0.38, h * 0.19, '#F8BBB0');
        for (const s of [-1, 1]) oval(cx + s * h * 0.13, y + h * 0.66, h * 0.045, h * 0.06, '#9C4F4A', 0, false);
        strokePath(() => g.arc(cx, y + h * 0.79, h * 0.08, 0.15 * Math.PI, 0.85 * Math.PI), '#F2B83A', lw * 1.6);
        break;
      }
      case 2: { // 호랑이: 줄무늬, 이마의 王, 하얀 주둥이
        for (const s of [-1, 1]) {
          oval(cx + s * h * 0.5, y + h * 0.05, h * 0.21, h * 0.2, col);
          oval(cx + s * h * 0.5, y + h * 0.07, h * 0.11, h * 0.1, '#FFF1DC', 0, false);
        }
        body();
        clipBody(() => {
          g.fillStyle = '#5C3A1E';
          for (const s of [-1, 1]) {
            const ex = s < 0 ? x : x + w;
            for (const yy of [0.3, 0.56]) {
              g.beginPath();
              g.moveTo(ex, y + h * (yy - 0.08));
              g.lineTo(ex - s * h * 0.36, y + h * yy);
              g.lineTo(ex, y + h * (yy + 0.08));
              g.fill();
            }
            const tx = cx + s * h * 0.62;
            g.beginPath();
            g.moveTo(tx - h * 0.07, y);
            g.lineTo(tx, y + h * 0.22);
            g.lineTo(tx + h * 0.07, y);
            g.fill();
          }
        });
        strokePath(() => {
          for (const yy of [0.1, 0.17, 0.24]) {
            g.moveTo(cx - h * 0.1, y + h * yy);
            g.lineTo(cx + h * 0.1, y + h * yy);
          }
          g.moveTo(cx, y + h * 0.1);
          g.lineTo(cx, y + h * 0.24);
        }, '#5C3A1E', lw * 1.3);
        eyes(y + h * 0.42, h * 0.3);
        blush(y + h * 0.6, h * 0.56);
        for (const s of [-1, 1]) oval(cx + s * h * 0.11, y + h * 0.67, h * 0.15, h * 0.11, '#FFF7EC', 0, false);
        poly([[cx - h * 0.07, y + h * 0.55], [cx + h * 0.07, y + h * 0.55], [cx, y + h * 0.63]], '#E8606E', false);
        for (const s of [-1, 1]) {
          for (const [dx, dy] of [[0.1, 0.66], [0.16, 0.7], [0.1, 0.73]]) oval(cx + s * h * dx, y + h * dy, h * 0.012, h * 0.012, '#8A6A50', 0, false);
        }
        break;
      }
      case 3: { // 토끼: 긴 귀(한쪽은 접힘), 앞니
        oval(cx - h * 0.26, y - h * 0.2, h * 0.13, h * 0.38, col, -0.15);
        oval(cx - h * 0.26, y - h * 0.18, h * 0.065, h * 0.28, '#FFB3C7', -0.15, false);
        oval(cx + h * 0.32, y - h * 0.12, h * 0.13, h * 0.34, col, 0.45);
        oval(cx + h * 0.32, y - h * 0.1, h * 0.065, h * 0.25, '#FFB3C7', 0.45, false);
        body();
        eyes(y + h * 0.4, h * 0.28);
        blush(y + h * 0.56, h * 0.5, 'rgba(255,110,150,0.55)');
        strokePath(() => {
          g.moveTo(cx, y + h * 0.56);
          g.lineTo(cx, y + h * 0.62);
        }, '#4A3530', lw);
        mouth(y + h * 0.62);
        g.beginPath();
        g.rect(cx - h * 0.045, y + h * 0.65, h * 0.09, h * 0.075);
        paint('#FFFFFF', '#B9A4AC');
        oval(cx, y + h * 0.54, h * 0.065, h * 0.045, '#FF8FB0', 0, false);
        break;
      }
      case 4: { // 용: 사슴뿔, 머리 지느러미, 긴 수염
        strokePath(() => {
          for (const s of [-1, 1]) {
            g.moveTo(cx + s * h * 0.3, y + h * 0.08);
            g.lineTo(cx + s * h * 0.44, y - h * 0.34);
            g.moveTo(cx + s * h * 0.38, y - h * 0.16);
            g.lineTo(cx + s * h * 0.6, y - h * 0.26);
          }
        }, '#C98A2B', h * 0.12);
        strokePath(() => {
          for (const s of [-1, 1]) {
            g.moveTo(cx + s * h * 0.3, y + h * 0.08);
            g.lineTo(cx + s * h * 0.44, y - h * 0.34);
            g.moveTo(cx + s * h * 0.38, y - h * 0.16);
            g.lineTo(cx + s * h * 0.6, y - h * 0.26);
          }
        }, '#FFD66B', h * 0.07);
        poly([[cx - h * 0.13, y + h * 0.05], [cx - h * 0.065, y - h * 0.15], [cx, y + h * 0.05]], '#FF9F6B');
        poly([[cx, y + h * 0.05], [cx + h * 0.065, y - h * 0.15], [cx + h * 0.13, y + h * 0.05]], '#FF9F6B');
        body();
        clipBody(() => {
          oval(cx, y + h * 0.74, h * 0.44, h * 0.24, '#DDF8C6', 0, false);
          for (const s of [-1, 1]) {
            for (const [dx, dy] of [[0.68, 0.3], [0.78, 0.5], [0.66, 0.6]]) {
              strokePath(() => g.arc(cx + s * h * dx, y + h * dy, h * 0.06, 0.1 * Math.PI, 0.9 * Math.PI), shade(col, -0.25), lw);
            }
          }
        });
        eyes(y + h * 0.38, h * 0.3, h * 0.095);
        blush(y + h * 0.55, h * 0.55);
        for (const s of [-1, 1]) oval(cx + s * h * 0.09, y + h * 0.64, h * 0.035, h * 0.025, '#3D6B4F', 0, false);
        mouth(y + h * 0.72);
        strokePath(() => {
          for (const s of [-1, 1]) {
            g.moveTo(cx + s * h * 0.24, y + h * 0.64);
            g.quadraticCurveTo(cx + s * h * 0.75, y + h * 0.88, cx + s * (w / 2 + h * 0.24), y + h * 0.48);
          }
        }, '#F2B83A', h * 0.04);
        break;
      }
      case 5: { // 뱀: 말린 꼬리, 마름모 무늬, 갈라진 혀
        const tail = () => {
          g.moveTo(x + w - h * 0.5, y + h * 0.1);
          g.quadraticCurveTo(x + w - h * 0.02, y - h * 0.06, x + w - h * 0.14, y - h * 0.34);
          g.quadraticCurveTo(x + w - h * 0.2, y - h * 0.44, x + w - h * 0.3, y - h * 0.36);
        };
        strokePath(tail, line, h * 0.17);
        strokePath(tail, col, h * 0.11);
        body();
        clipBody(() => {
          for (let k = -2; k <= 2; k++) {
            const dx = cx + k * h * 0.4;
            const dy = y + h * 0.06;
            poly([[dx, dy - h * 0.1], [dx + h * 0.1, dy], [dx, dy + h * 0.1], [dx - h * 0.1, dy]], '#8CC455', false);
          }
          oval(cx, y + h * 0.98, w * 0.5, h * 0.22, '#EAF8C4', 0, false);
        });
        eyes(y + h * 0.4, h * 0.3, h * 0.1);
        blush(y + h * 0.58, h * 0.56);
        mouth(y + h * 0.58);
        strokePath(() => {
          g.moveTo(cx, y + h * 0.63);
          g.lineTo(cx, y + h * 0.76);
          g.lineTo(cx - h * 0.05, y + h * 0.84);
          g.moveTo(cx, y + h * 0.76);
          g.lineTo(cx + h * 0.05, y + h * 0.84);
        }, '#E8445A', lw * 1.4);
        break;
      }
      case 6: { // 말: 갈기, 뾰족한 귀, 긴 주둥이
        for (const s of [-1, 1]) {
          poly([[cx + s * h * 0.64, y + h * 0.12], [cx + s * h * 0.58, y - h * 0.27], [cx + s * h * 0.38, y + h * 0.06]], col);
          poly([[cx + s * h * 0.58, y + h * 0.08], [cx + s * h * 0.56, y - h * 0.15], [cx + s * h * 0.45, y + h * 0.05]], shade(col, -0.25), false);
        }
        for (let k = 0; k < 6; k++) oval(cx - h * 0.5 + k * h * 0.2, y + h * 0.01, h * 0.13, h * 0.12, '#5E3B24', 0, false);
        body();
        oval(cx - h * 0.1, y + h * 0.06, h * 0.13, h * 0.11, '#5E3B24', 0, false);
        oval(cx + h * 0.08, y + h * 0.09, h * 0.14, h * 0.12, '#5E3B24', 0, false);
        eyes(y + h * 0.36, h * 0.32);
        oval(cx, y + h * 0.67, h * 0.42, h * 0.21, '#F3D3AE');
        for (const s of [-1, 1]) oval(cx + s * h * 0.15, y + h * 0.63, h * 0.04, h * 0.055, '#6B4430', 0, false);
        mouth(y + h * 0.74);
        blush(y + h * 0.5, h * 0.58);
        break;
      }
      case 7: { // 양: 몽실몽실 양털, 말린 뿔
        body();
        for (let k = 0; k <= 6; k++) {
          oval(x + h * 0.2 + (k * (w - h * 0.4)) / 6, y + h * 0.06, h * 0.13, h * 0.12, col, 0, '#E2DCCB');
        }
        for (const s of [-1, 1]) {
          const hx = s < 0 ? x + h * 0.06 : x + w - h * 0.06;
          oval(hx, y + h * 0.46, h * 0.19, h * 0.19, '#C99A6B');
          strokePath(() => g.arc(hx, y + h * 0.46, h * 0.09, 0, 1.5 * Math.PI), shade('#C99A6B', -0.4), lw);
          oval(cx + s * h * 0.46, y + h * 0.5, h * 0.12, h * 0.06, '#F2D2B6', s * 0.4);
        }
        oval(cx, y + h * 0.57, h * 0.4, h * 0.3, '#F2D2B6');
        for (const dx of [-0.13, 0, 0.13]) oval(cx + h * dx, y + h * 0.3, h * 0.1, h * 0.09, col, 0, '#E2DCCB');
        eyes(y + h * 0.54, h * 0.17, h * 0.07);
        blush(y + h * 0.66, h * 0.27);
        oval(cx, y + h * 0.66, h * 0.05, h * 0.03, '#8A5A4A', 0, false);
        mouth(y + h * 0.7, h * 0.05);
        break;
      }
      case 8: { // 원숭이: 양옆의 큰 귀, 하트 모양 얼굴
        for (const s of [-1, 1]) {
          const ex = s < 0 ? x : x + w;
          oval(ex, y + h * 0.45, h * 0.21, h * 0.21, col);
          oval(ex, y + h * 0.45, h * 0.12, h * 0.12, '#F6CBA2', 0, false);
        }
        body();
        poly([[cx - h * 0.12, y + h * 0.04], [cx - h * 0.05, y - h * 0.12], [cx, y + h * 0.04]], shade(col, -0.2), false);
        poly([[cx, y + h * 0.04], [cx + h * 0.07, y - h * 0.14], [cx + h * 0.12, y + h * 0.04]], shade(col, -0.2), false);
        oval(cx - h * 0.17, y + h * 0.42, h * 0.2, h * 0.2, '#F6CBA2', 0, false);
        oval(cx + h * 0.17, y + h * 0.42, h * 0.2, h * 0.2, '#F6CBA2', 0, false);
        oval(cx, y + h * 0.64, h * 0.36, h * 0.22, '#F6CBA2', 0, false);
        eyes(y + h * 0.42, h * 0.17, h * 0.075);
        for (const s of [-1, 1]) oval(cx + s * h * 0.04, y + h * 0.58, h * 0.018, h * 0.018, '#6B4430', 0, false);
        strokePath(() => g.arc(cx, y + h * 0.63, h * 0.12, 0.15 * Math.PI, 0.85 * Math.PI), '#6B4430', lw);
        blush(y + h * 0.6, h * 0.3);
        break;
      }
      case 9: { // 닭: 빨간 볏, 노란 부리, 볏주머니, 날개
        oval(cx - h * 0.16, y - h * 0.03, h * 0.11, h * 0.11, '#FF5A5A');
        oval(cx + h * 0.16, y - h * 0.03, h * 0.11, h * 0.11, '#FF5A5A');
        oval(cx, y - h * 0.08, h * 0.14, h * 0.14, '#FF5A5A');
        body();
        for (const s of [-1, 1]) {
          oval(s < 0 ? x + h * 0.2 : x + w - h * 0.2, y + h * 0.58, h * 0.2, h * 0.27, '#F3E1BC', s * 0.35, shade('#F3E1BC', -0.3));
        }
        eyes(y + h * 0.36, h * 0.27);
        blush(y + h * 0.52, h * 0.5);
        oval(cx, y + h * 0.75, h * 0.06, h * 0.1, '#FF5A5A', 0, false);
        poly([[cx, y + h * 0.42], [cx + h * 0.12, y + h * 0.53], [cx, y + h * 0.65], [cx - h * 0.12, y + h * 0.53]], '#FFB52E', '#C77A12');
        strokePath(() => {
          g.moveTo(cx - h * 0.12, y + h * 0.53);
          g.lineTo(cx + h * 0.12, y + h * 0.53);
        }, '#C77A12', lw * 0.8);
        break;
      }
      case 10: { // 개: 축 처진 귀, 한쪽 눈 얼룩, 내민 혀
        body();
        clipBody(() => oval(cx + h * 0.3, y + h * 0.38, h * 0.18, h * 0.16, '#B87A4B', 0, false));
        for (const s of [-1, 1]) {
          oval(s < 0 ? x + h * 0.08 : x + w - h * 0.08, y + h * 0.4, h * 0.16, h * 0.32, '#8B5A3C', -s * 0.3, shade('#8B5A3C', -0.3));
        }
        eyes(y + h * 0.38, h * 0.3);
        blush(y + h * 0.55, h * 0.52);
        oval(cx, y + h * 0.66, h * 0.33, h * 0.19, '#FFF6EA', 0, false);
        g.beginPath();
        g.ellipse(cx, y + h * 0.7, h * 0.065, h * 0.11, 0, 0, Math.PI);
        paint('#FF7C93', '#D9506C');
        oval(cx, y + h * 0.57, h * 0.1, h * 0.065, INK, 0, false);
        oval(cx - h * 0.03, y + h * 0.55, h * 0.025, h * 0.018, '#FFFFFF', 0, false);
        mouth(y + h * 0.66, h * 0.08);
        break;
      }
      case 11: { // 돼지: 접힌 세모 귀, 큰 코
        for (const s of [-1, 1]) {
          poly([[cx + s * h * 0.64, y + h * 0.12], [cx + s * h * 0.62, y - h * 0.22], [cx + s * h * 0.32, y + h * 0.04]], col);
          poly([[cx + s * h * 0.58, y + h * 0.07], [cx + s * h * 0.58, y - h * 0.1], [cx + s * h * 0.42, y + h * 0.04]], '#FF97B0', false);
        }
        body();
        eyes(y + h * 0.36, h * 0.33);
        blush(y + h * 0.58, h * 0.6);
        oval(cx, y + h * 0.6, h * 0.25, h * 0.17, '#FF9EB5', 0, shade('#FF9EB5', -0.3));
        for (const s of [-1, 1]) oval(cx + s * h * 0.08, y + h * 0.6, h * 0.04, h * 0.07, '#C24D6C', 0, false);
        break;
      }
      default:
        body();
    }
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

    // 들판에 모인 12간지 동물들 (받침대 양옆 뒷줄 4, 가운데 줄 4, 앞줄 4)
    const prevHop = crowd.map((c) => ({ h: c.h, vh: c.vh }));
    crowd = [];
    const sideRoom = W / 2 - BW * PEDESTAL_HALF - S * 0.1;
    const backScale = clamp(sideRoom / (BW * 2.2), 0.3, 0.42);
    const start = BW * PEDESTAL_HALF + BW * backScale * 0.58;
    const step = BW * backScale * 1.08;
    for (let k = 0; k < 2; k++) {
      crowd.push({ dx: -(start + k * step), dy: S * 0.1, scale: backScale, a: k * 2 });
      crowd.push({ dx: start + k * step, dy: S * 0.1, scale: backScale, a: k * 2 + 1 });
    }
    const span = Math.min(W, BW * 5);
    for (let k = 0; k < 4; k++) {
      crowd.push({ dx: (span * (k + 0.5)) / 4 - span / 2, dy: S * 0.78, scale: 0.46, a: 4 + k, front: true });
    }
    for (let k = 0; k < 4; k++) {
      crowd.push({ dx: (span * (k + 1)) / 5 - span / 2, dy: S * 1.5, scale: 0.5, a: 8 + k, front: true });
    }
    crowd.forEach((c, i) => {
      c.h = prevHop[i] ? prevHop[i].h : 0;
      c.vh = prevHop[i] ? prevHop[i].vh : 0;
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

  let altSunset = 0;     // 고도에 따른 노을/우주 정도(해·행성 표시용)
  let altSpace = 0;
  let twilight = 1;      // 메뉴 화면의 저녁 하늘 정도
  let mixSunset = 0.65;  // 실제 하늘색 믹스
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
  const bests = MODES.map((m) => parseInt(storage.get(m.bestKey), 10) || 0);
  let modeIdx = clamp(parseInt(storage.get(MODE_KEY), 10) || 0, 0, MODES.length - 1);
  let selectT = 0;
  const mode = () => MODES[modeIdx];
  const isMenu = () => state === STATE.PROLOGUE || state === STATE.SELECT;

  // ===================== 난이도 =====================
  function moverSpeed(f) { // 블록/초
    let v;
    if (f <= 50) v = 2.0 + f * 0.012;
    else if (f <= 120) v = 2.6 + (f - 50) * 0.025;
    else v = Math.min(6.5, 4.6 + (f - 120) * 0.02);
    return v * mode().speed;
  }

  function sensitivity(f) {
    let v;
    if (f <= 50) v = 1;
    else if (f <= 120) v = 1 + ((f - 50) / 70) * 0.6;
    else v = Math.min(2.0, 1.7 + (f - 120) * 0.005);
    return v * mode().sens;
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
    const half = Math.max(0.5, Math.min((W / 2 - BW * 0.55) / S, MAX_SWING_RANGE));
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

  function startGame(idx) {
    if (idx !== undefined) {
      modeIdx = idx;
      storage.set(MODE_KEY, String(idx));
    }
    resetRun();
    state = STATE.PLAYING;
    Sound.startBgm(0, mode().tempo);
  }

  function openSelect() {
    state = STATE.SELECT;
    selectT = 0;
    blocks = [];
    bodies = [];
    faller = null;
    mover.active = false;
    Sound.stopBgm();
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
      half = PEDESTAL_HALF * BW;
    } else {
      dx = fx - blockVisual(n - 1).x;
      half = SUPPORT_HALF * BW;
    }

    if (Math.abs(dx) > half) {
      startCollapse(Math.sign(dx) || 1, true);
      return;
    }

    const perfect = Math.abs(dx) < PERFECT_TOL * BW * mode().perfect;
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
      if (Math.abs(dx) < GOOD_TOL * BW * mode().perfect) {
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
    newBest = finalScore > bests[modeIdx];
    if (newBest) {
      bests[modeIdx] = finalScore;
      storage.set(mode().bestKey, String(finalScore));
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

    // 배경 믹스: 카메라 고도(층)에 따라 부드럽게 전환, 메뉴 화면은 별이 보이는 저녁 하늘
    const camFloor = isMenu() ? 0 : (baseTopY - H * CAM_ANCHOR - camY) / S;
    altSunset += (clamp((camFloor - 50) / 6, 0, 1) - altSunset) * damp(1.6, dt);
    altSpace += (clamp((camFloor - 120) / 6, 0, 1) - altSpace) * damp(1.6, dt);
    twilight += ((isMenu() ? 1 : 0) - twilight) * damp(1.6, dt);
    mixSunset = Math.max(altSunset, twilight * 0.65);
    mixSpace = Math.max(altSpace, twilight * 0.4);

    // 동물 친구들 깡충깡충
    const hopRate = isMenu() ? 0.7 : 0.08;
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

    if (state === STATE.PROLOGUE) {
      typeT += dt;
    } else if (state === STATE.SELECT) {
      selectT += dt;
      camX += (0 - camX) * damp(4, dt);
      camY += (0 - camY) * damp(4, dt);
    } else if (state === STATE.PLAYING) updatePlaying(dt);
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

    if (altSpace > 0.5 && Math.random() < dt * 0.3) {
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
        const target = Math.round(b.rot / Math.PI) * Math.PI;
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
        if (on && Math.abs(b.x - on.x) > BW * 0.2) {
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
    let y = Math.abs(b.x - W / 2) < BW * PEDESTAL_HALF ? baseTopY : groundY + S * 0.2;
    let on = null;
    for (const o of bodies) {
      if (o === b || !o.rest) continue;
      if (Math.abs(o.x - b.x) < BW * 0.9 && o.y > b.y - S * 0.2 && o.y - S * 0.5 < y) {
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
    const args = opts.maxWidth > 0 ? [str, x, y, opts.maxWidth] : [str, x, y];
    if (opts.stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = opts.strokeWidth || size * 0.2;
      ctx.strokeStyle = opts.stroke;
      ctx.strokeText(...args);
    }
    ctx.fillStyle = color;
    ctx.fillText(...args);
  }

  // (x, y)는 블록 중심, 스케일과 찌그러짐은 블록 바닥 중앙 기준
  function drawBlock(a, x, y, rot, squash, scale) {
    const sp = sprites[a];
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.translate(0, S / 2);
    if (scale && scale !== 1) ctx.scale(scale, scale);
    if (squash) ctx.scale(1 + 0.1 * squash, 1 - 0.14 * squash);
    ctx.drawImage(sp.c, -sp.ox, -sp.oy, sp.w, sp.h);
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
      ctx.globalAlpha = (s.life / s.max) * altSpace;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.12, s.y - s.vy * 0.12);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 노을 해
    const sunAlpha = altSunset * (1 - altSpace);
    if (!isMenu() && sunAlpha > 0.01) {
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
    if (!isMenu() && altSpace > 0.01) {
      ctx.globalAlpha = altSpace;
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
    const pw = BW * PEDESTAL_HALF * 2;
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
    for (const c of crowd) {
      if (!!c.front !== front) continue;
      const x = W / 2 + c.dx;
      const y = groundY + c.dy;
      ctx.fillStyle = `rgba(0,0,0,${0.18 - Math.min(0.12, (c.h / S) * 0.1)})`;
      ctx.beginPath();
      ctx.ellipse(x, y, BW * c.scale * 0.45, S * c.scale * 0.14, 0, 0, TAU);
      ctx.fill();
      const breathe = c.h > 0 ? 0 : 0.5 + 0.5 * Math.sin(time * 5 + c.dx);
      drawBlock(c.a, x, y - c.h - S / 2, 0, breathe * 0.4, c.scale);
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

      drawBlock(n % 12, x, y + Math.sin(time * 5) * S * 0.03, 0, 0, 0.6 + 0.4 * mover.appear);
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

  function drawTitle() {
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
  }

  function drawPrologue() {
    drawTitle();

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

  function selectButtons() {
    const bw = Math.min(W * 0.86, 380);
    const bh = clamp(H * 0.088, 58, 80);
    const gap = bh * 0.24;
    const top = Math.max(safeTop + H * 0.24 + 70, H * 0.4);
    return MODES.map((m, i) => ({ x: W / 2 - bw / 2, y: top + i * (bh + gap), w: bw, h: bh }));
  }

  function drawSelect() {
    drawTitle();
    const btns = selectButtons();
    const head = Math.round(clamp(W * 0.055, 17, 26));
    ctx.globalAlpha = clamp(selectT * 4, 0, 1);
    drawText('난이도를 골라 주세요!', W / 2, btns[0].y - head * 1.1, head, '#FFFFFF', { stroke: 'rgba(30,10,60,0.6)', weight: 900 });
    ctx.globalAlpha = 1;

    btns.forEach((b, i) => {
      const m = MODES[i];
      const t = clamp((selectT - i * 0.08) / 0.35, 0, 1);
      if (t <= 0) return;
      const e = easeInOutCubic(t);
      const r = b.h * 0.32;
      ctx.save();
      ctx.globalAlpha = e;
      ctx.translate((1 - e) * W * 0.6, 0);

      if (i === modeIdx) {
        squirclePath(ctx, b.x - 4, b.y - 4, b.w + 8, b.h + 8, r + 4);
        ctx.fillStyle = `rgba(255,255,255,${0.55 + 0.3 * Math.sin(time * 4)})`;
        ctx.fill();
      }
      squirclePath(ctx, b.x, b.y + 5, b.w, b.h, r);
      ctx.fillStyle = shade(m.color, -0.3);
      ctx.fill();
      squirclePath(ctx, b.x, b.y, b.w, b.h, r);
      ctx.fillStyle = m.color;
      ctx.fill();
      ctx.globalAlpha = e * 0.25;
      squirclePath(ctx, b.x + r * 0.6, b.y + b.h * 0.08, b.w - r * 1.2, b.h * 0.2, b.h * 0.1);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.globalAlpha = e;

      const pad = b.h * 0.3;
      ctx.font = `${Math.round(b.h * 0.46)}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000000';
      ctx.fillText(m.icon, b.x + pad + b.h * 0.22, b.y + b.h * 0.5);
      const tx = b.x + pad + b.h * 0.6;
      const chipW = b.h * 0.95;
      const chipH = b.h * 0.3;
      const chipX = b.x + b.w - pad * 0.7 - chipW;
      const textMax = chipX - tx - b.h * 0.12;
      drawText(m.name, tx, b.y + b.h * 0.36, Math.round(b.h * 0.3), '#FFFFFF', { align: 'left', weight: 900, stroke: shade(m.color, -0.35), strokeWidth: 4, maxWidth: textMax });
      drawText(m.desc, tx, b.y + b.h * 0.7, Math.round(b.h * 0.18), 'rgba(255,255,255,0.95)', { align: 'left', weight: 700, maxWidth: textMax });

      const chipY = b.y + b.h * 0.14;
      squirclePath(ctx, chipX, chipY, chipW, chipH, chipH / 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      drawText(m.tier, chipX + chipW / 2, chipY + chipH / 2, Math.round(chipH * 0.62), shade(m.color, -0.25), { weight: 900 });
      drawText(`최고 ${bests[i]}층`, chipX + chipW / 2, b.y + b.h * 0.7, Math.round(b.h * 0.18), '#FFFFFF', { weight: 800, maxWidth: chipW + b.h * 0.1 });
      ctx.restore();
    });
  }

  function drawHUD() {
    const n = blocks.length;
    const top = safeTop + 12;
    const big = Math.round(clamp(W * 0.11, 34, 56));
    drawText(`${n}층`, W / 2, top + big * 0.6, big, '#FFFFFF', { stroke: 'rgba(0,0,0,0.35)', weight: 900 });
    drawText(`${mode().icon} ${mode().tier} · 최고 ${bests[modeIdx]}층`, W / 2, top + big * 1.3, Math.round(big * 0.32), 'rgba(255,255,255,0.92)', { stroke: 'rgba(0,0,0,0.3)' });

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

  function gameOverLayout() {
    const pw = Math.min(W * 0.84, 360);
    const ph = Math.min(H * 0.5, 340);
    const px = W / 2 - pw / 2;
    const py = H * 0.42 - ph / 2;
    const unit = ph / 10;
    const bw = pw * 0.62;
    const bh = unit * 1.05;
    return { pw, ph, px, py, unit, change: { x: W / 2 - bw / 2, y: py + unit * 8.85 - bh / 2, w: bw, h: bh } };
  }

  const canRestart = () => goT > panelT + 0.35;

  function drawGameOver() {
    if (goT < panelT) return;
    const a = clamp((goT - panelT) / 0.35, 0, 1);
    const { pw, ph, px, py, unit, change } = gameOverLayout();
    const s = 0.85 + 0.15 * easeInOutCubic(a);

    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H * 0.42);
    ctx.scale(s, s);
    ctx.translate(-W / 2, -H * 0.42);

    squirclePath(ctx, px, py + 6, pw, ph, 28);
    ctx.fillStyle = 'rgba(80,40,120,0.5)';
    ctx.fill();
    squirclePath(ctx, px, py, pw, ph, 28);
    ctx.fillStyle = '#FFF8EC';
    ctx.fill();

    const cx = W / 2;
    const m = mode();
    drawText('와르르~! 💥', cx, py + unit * 1.2, Math.round(unit * 0.85), '#7A4BC2', { weight: 900 });
    const chipW = pw * 0.56;
    const chipH = unit * 0.75;
    squirclePath(ctx, cx - chipW / 2, py + unit * 2.2 - chipH / 2, chipW, chipH, chipH / 2);
    ctx.fillStyle = m.color;
    ctx.fill();
    drawText(`${m.icon} ${m.name}`, cx, py + unit * 2.2, Math.round(chipH * 0.55), '#FFFFFF', { weight: 900, maxWidth: chipW - 12 });
    drawText(`${finalScore}층`, cx, py + unit * 4.2, Math.round(unit * 2), '#FF7A59', { weight: 900, stroke: '#FFFFFF', strokeWidth: 6 });
    if (newBest && finalScore > 0) {
      drawText('🎉 새로운 최고 기록!', cx, py + unit * 6, Math.round(unit * 0.7), '#E0559A', { weight: 900 });
    } else {
      drawText(`최고 기록 ${bests[modeIdx]}층`, cx, py + unit * 6, Math.round(unit * 0.65), '#8A7BA8', { weight: 800 });
    }
    if (canRestart()) {
      ctx.save();
      ctx.globalAlpha = a * (0.55 + 0.45 * Math.sin(time * 4));
      drawText('👆 터치하면 다시 시작!', cx, py + unit * 7.3, Math.round(unit * 0.66), '#5B4B7A', { weight: 800 });
      ctx.restore();
      squirclePath(ctx, change.x, change.y, change.w, change.h, change.h / 2);
      ctx.fillStyle = '#EDE4FF';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#B9A6E8';
      ctx.stroke();
      drawText('🎚️ 난이도 바꾸기', cx, change.y + change.h / 2, Math.round(change.h * 0.45), '#6A4BB5', { weight: 900 });
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
    else if (state === STATE.SELECT) drawSelect();
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
    const inside = (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    if (state === STATE.PROLOGUE) {
      Sound.click();
      openSelect();
    } else if (state === STATE.SELECT) {
      if (selectT < 0.3) return;
      // 키보드(x < 0)는 마지막으로 고른 난이도로 바로 시작
      const idx = x < 0 ? modeIdx : selectButtons().findIndex(inside);
      if (idx >= 0) {
        Sound.click();
        startGame(idx);
      }
    } else if (state === STATE.PLAYING) {
      drop();
    } else if (canRestart()) {
      if (x >= 0 && inside(gameOverLayout().change)) {
        Sound.click();
        openSelect();
      } else {
        startGame();
      }
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
    } else if (state === STATE.SELECT && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
      Sound.unlock();
      Sound.click();
      startGame(Number(e.code.slice(-1)) - 1);
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
