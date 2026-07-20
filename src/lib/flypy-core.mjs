import { pinyin } from 'pinyin-pro';

export const FLYPY_KEYS = [
  [
    ['q', 'iu'],
    ['w', 'ei'],
    ['e', 'e'],
    ['r', 'uan / er'],
    ['t', 'ue / üe'],
    ['y', 'un / ün'],
    ['u', 'sh / u'],
    ['i', 'ch / i'],
    ['o', 'uo / o'],
    ['p', 'ie'],
  ],
  [
    ['a', 'a'],
    ['s', 'ong / iong'],
    ['d', 'ai'],
    ['f', 'en'],
    ['g', 'eng'],
    ['h', 'ang'],
    ['j', 'an'],
    ['k', 'ing / uai'],
    ['l', 'iang / uang'],
  ],
  [
    ['z', 'ou'],
    ['x', 'ua / ia'],
    ['c', 'ao'],
    ['v', 'zh / ui / ü'],
    ['b', 'in'],
    ['n', 'iao'],
    ['m', 'ian'],
  ],
];

export const FALLBACK_TEXTS = [
  '清晨的风穿过街角，树叶轻轻摇晃。',
  '学会新的输入方式，需要耐心，也需要重复。',
  '保持放松，注意节奏，不必急着追求速度。',
];

const FINAL_KEYS = {
  a: 'a',
  ai: 'd',
  an: 'j',
  ang: 'h',
  ao: 'c',
  e: 'e',
  ei: 'w',
  en: 'f',
  eng: 'g',
  er: 'r',
  i: 'i',
  ia: 'x',
  ian: 'm',
  iang: 'l',
  iao: 'n',
  ie: 'p',
  in: 'b',
  ing: 'k',
  iong: 's',
  iu: 'q',
  o: 'o',
  ong: 's',
  ou: 'z',
  u: 'u',
  ua: 'x',
  uai: 'k',
  uan: 'r',
  uang: 'l',
  ue: 't',
  ui: 'v',
  un: 'y',
  uo: 'o',
  v: 'v',
  ve: 't',
  van: 'r',
  vn: 'y',
};

const INITIAL_KEYS = { zh: 'v', ch: 'i', sh: 'u' };
const normalizeFinal = (value = '') => value.toLowerCase().replaceAll('ü', 'v');

export function encodeFlypy({ pinyin: fullPinyin = '', initial = '', final = '' }) {
  const full = normalizeFinal(fullPinyin);
  const normalizedInitial = normalizeFinal(initial);
  const normalizedFinal = normalizeFinal(final);

  if (!full) return null;

  if (!normalizedInitial) {
    if (full.length === 1) return full + full;
    if (full.length === 2) return full;
    const finalKey = FINAL_KEYS[full];
    return finalKey ? full[0] + finalKey : null;
  }

  const initialKey = INITIAL_KEYS[normalizedInitial] ?? normalizedInitial[0];
  const finalKey = FINAL_KEYS[normalizedFinal];
  return initialKey && finalKey ? initialKey + finalKey : null;
}

export function buildPracticeUnits(text) {
  const source = String(text ?? '').slice(0, 1000);
  const details = pinyin(source, { toneType: 'none', type: 'all' });
  return details.map((item, index) => {
    const code = item.isZh ? encodeFlypy(item) : null;
    return {
      index,
      char: item.origin,
      pinyin: item.pinyin,
      code,
      practice: Boolean(code),
    };
  });
}

export function shufflePracticeUnits(units, random = Math.random) {
  const shuffled = units.filter((unit) => unit.practice).map((unit) => ({ ...unit }));
  for (let index = shuffled.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled.map((unit, index) => ({ ...unit, index }));
}

export function createSession(text, { now = 0, randomize = false, random = Math.random } = {}) {
  const sourceUnits = buildPracticeUnits(text);
  const units = randomize ? shufflePracticeUnits(sourceUnits, random) : sourceUnits;
  const practiceIndexes = units.filter((unit) => unit.practice).map((unit) => unit.index);
  if (!practiceIndexes.length) throw new Error('请输入至少一个可练习的汉字');

  return {
    text: units.map((unit) => unit.char).join(''),
    units,
    practiceIndexes,
    cursor: 0,
    keyIndex: 0,
    attempts: 0,
    correctKeys: 0,
    errors: 0,
    completedChars: 0,
    status: 'idle',
    startedAt: null,
    completedAt: null,
    lastInput: null,
    lastKey: null,
    createdAt: now,
  };
}

export function getCurrentUnit(session) {
  const unitIndex = session.practiceIndexes[session.cursor];
  return Number.isInteger(unitIndex) ? session.units[unitIndex] : null;
}

export function inputKey(session, rawKey, now = Date.now()) {
  const key = String(rawKey ?? '').toLowerCase();
  if (!/^[a-z]$/.test(key) || session.status === 'complete') return session;

  const current = getCurrentUnit(session);
  if (!current) return session;

  const startedAt = session.startedAt ?? now;
  const expected = current.code[session.keyIndex];
  const base = {
    ...session,
    attempts: session.attempts + 1,
    status: 'running',
    startedAt,
    lastKey: key,
  };

  if (key !== expected) {
    return {
      ...base,
      errors: session.errors + 1,
      keyIndex: 0,
      lastInput: 'error',
    };
  }

  const nextKeyIndex = session.keyIndex + 1;
  if (nextKeyIndex < current.code.length) {
    return {
      ...base,
      correctKeys: session.correctKeys + 1,
      keyIndex: nextKeyIndex,
      lastInput: 'correct',
    };
  }

  const nextCursor = session.cursor + 1;
  const complete = nextCursor >= session.practiceIndexes.length;
  return {
    ...base,
    correctKeys: session.correctKeys + 1,
    completedChars: session.completedChars + 1,
    cursor: nextCursor,
    keyIndex: 0,
    lastInput: 'correct',
    status: complete ? 'complete' : 'running',
    completedAt: complete ? now : null,
  };
}

export function getMetrics(session, now = Date.now()) {
  const end = session.completedAt ?? now;
  const elapsedMs = session.startedAt !== null ? Math.max(0, end - session.startedAt) : 0;
  const elapsedSeconds = elapsedMs / 1000;
  return {
    elapsedMs,
    elapsedSeconds,
    accuracy: session.attempts ? (session.correctKeys / session.attempts) * 100 : 100,
    cpm: elapsedSeconds ? session.completedChars / (elapsedSeconds / 60) : 0,
  };
}

export function formatElapsed(elapsedMs) {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
