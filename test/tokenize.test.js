import test from 'node:test'
import assert from 'node:assert/strict'
import { countWords, normalize, tokenize } from '../src/lib/tokenize.js'

test('counts plain prose', () => {
  assert.equal(countWords('The reaction proceeded quickly'), 4)
})

test('a hyphenated compound is one word, as Word counts it', () => {
  assert.equal(countWords('a well-known result'), 3)
})

test('standalone punctuation contributes nothing', () => {
  assert.equal(countWords('yes — no : maybe'), 3)
  assert.equal(countWords('— : ; ...'), 0)
})

test('each unit of a multi-unit measurement counts separately', () => {
  assert.equal(countWords('25°C (77°F)'), 2)
})

test('a multi-unit measurement splits even with no space before the bracket', () => {
  assert.equal(countWords('25°C(77°F)'), 2)
})

test('brackets are split off their neighbours', () => {
  assert.deepEqual(tokenize('rate(fast)'), ['rate', 'fast'])
  assert.deepEqual(tokenize('[see]note'), ['see', 'note'])
})

test('empty and nullish input yields no tokens', () => {
  assert.deepEqual(tokenize(''), [])
  assert.deepEqual(tokenize(null), [])
  assert.deepEqual(tokenize(undefined), [])
})

test('non-breaking and narrow spaces are treated as spaces', () => {
  assert.equal(countWords('one\u00a0two\u2009three\u202ffour'), 4)
})

test('digits alone still count as a word', () => {
  assert.equal(countWords('trial 3 of 6'), 4)
})

test('normalize collapses whitespace and trims', () => {
  assert.equal(normalize('  a \n\n b\t c  '), 'a b c')
  assert.equal(normalize(null), '')
})
