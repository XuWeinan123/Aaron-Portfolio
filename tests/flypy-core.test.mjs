import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPracticeUnits,
  createSession,
  encodeFlypy,
  formatElapsed,
  getMetrics,
  inputKey,
} from '../src/lib/flypy-core.mjs';

test('encodes initials, compound initials and ü finals', () => {
  assert.equal(encodeFlypy({ pinyin: 'shui', initial: 'sh', final: 'ui' }), 'uv');
  assert.equal(encodeFlypy({ pinyin: 'zhi', initial: 'zh', final: 'i' }), 'vi');
  assert.equal(encodeFlypy({ pinyin: 'chi', initial: 'ch', final: 'i' }), 'ii');
  assert.equal(encodeFlypy({ pinyin: 'nü', initial: 'n', final: 'ü' }), 'nv');
  assert.equal(encodeFlypy({ pinyin: 'lüe', initial: 'l', final: 'üe' }), 'lt');
  assert.equal(encodeFlypy({ pinyin: 'yue', initial: 'y', final: 'ue' }), 'yt');
});

test('encodes zero-initial syllables with Xiaohe rules', () => {
  assert.equal(encodeFlypy({ pinyin: 'a' }), 'aa');
  assert.equal(encodeFlypy({ pinyin: 'o' }), 'oo');
  assert.equal(encodeFlypy({ pinyin: 'ai' }), 'ai');
  assert.equal(encodeFlypy({ pinyin: 'an' }), 'an');
  assert.equal(encodeFlypy({ pinyin: 'ang' }), 'ah');
});

test('builds contextual practice units and skips punctuation', () => {
  const units = buildPracticeUnits('银行，音乐。');
  assert.deepEqual(
    units.filter((unit) => unit.practice).map((unit) => [unit.char, unit.pinyin, unit.code]),
    [
      ['银', 'yin', 'yb'],
      ['行', 'hang', 'hh'],
      ['音', 'yin', 'yb'],
      ['乐', 'yue', 'yt'],
    ]
  );
  assert.equal(units.find((unit) => unit.char === '，').practice, false);
});

test('wrong input resets the current syllable and affects accuracy', () => {
  let session = createSession('水', 0);
  session = inputKey(session, 'u', 1000);
  assert.equal(session.keyIndex, 1);
  session = inputKey(session, 'x', 1500);
  assert.equal(session.keyIndex, 0);
  assert.equal(session.errors, 1);
  session = inputKey(session, 'u', 2000);
  session = inputKey(session, 'v', 3000);

  assert.equal(session.status, 'complete');
  assert.equal(session.completedChars, 1);
  assert.equal(Math.round(getMetrics(session).accuracy), 75);
});

test('formats elapsed time', () => {
  assert.equal(formatElapsed(0), '00:00');
  assert.equal(formatElapsed(65_900), '01:05');
});
