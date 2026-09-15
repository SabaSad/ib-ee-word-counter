import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyNote, classifyParenthetical, functionWordRatio } from '../src/lib/patterns.js'

const verdict = (inner, bracket, before) => classifyParenthetical(inner, bracket, before).verdict

test('author–date spans read as citations', () => {
  assert.equal(verdict('Smith, 2019'), 'citation')
  assert.equal(verdict('Smith & Jones, 2020, p. 14'), 'citation')
  assert.equal(verdict('WHO, 2021'), 'citation')
})

test('page references, URLs and Latin shorthand read as citations', () => {
  assert.equal(verdict('pp. 14-19'), 'citation')
  assert.equal(verdict('https://example.org/paper'), 'citation')
  assert.equal(verdict('ibid.'), 'citation')
  assert.equal(verdict('Smith et al.'), 'citation')
})

test('numeric markers are citations in square brackets only', () => {
  assert.equal(verdict('12', '['), 'citation')
  assert.equal(verdict('3-5', '['), 'citation')
  // A bare (3) in round brackets is a list marker or a quantity.
  assert.equal(verdict('3', '('), 'content')
})

test('measurements and quantities always count', () => {
  assert.equal(verdict('77°F'), 'content')
  assert.equal(verdict('3.5 km'), 'content')
  assert.equal(verdict('approx. 40%'), 'content')
  assert.equal(verdict('≈ 12 mol'), 'content')
})

test('explanatory asides count', () => {
  assert.equal(verdict('which is itself a contested claim'), 'content')
  assert.equal(verdict('that is, the rate of change over time'), 'content')
})

test('a bare year is reported as ambiguous rather than guessed at', () => {
  const asDate = classifyParenthetical('1919', '(', 'the war finally ended in ')
  assert.equal(asDate.verdict, 'ambiguous')
  const asCite = classifyParenthetical('2020', '(', 'as argued by Smith ')
  assert.equal(asCite.verdict, 'ambiguous')
  // The two are told apart in the wording shown to the user, not in the verdict.
  assert.match(asCite.reasons[0].label, /after a capitalised name/)
  assert.doesNotMatch(asDate.reasons[0].label, /after a capitalised name/)
})

test('an empty span is harmless', () => {
  assert.equal(verdict(''), 'content')
})

test('every verdict comes with at least one stated reason', () => {
  for (const span of ['Smith, 2019', 'a plain aside', '77°F', '1919']) {
    assert.ok(classifyParenthetical(span).reasons.length > 0, span)
  }
})

test('a pure reference note is classified as a citation', () => {
  const note = classifyNote('Smith, J. (2019). Reaction Kinetics. Oxford: Oxford University Press, pp. 14-19.')
  assert.equal(note.classification, 'citation')
  assert.equal(note.confidence, 'high')
})

test('a short cross-reference note is a citation', () => {
  assert.equal(classifyNote('Ibid., p. 22.').classification, 'citation')
})

test('an explanatory note counts', () => {
  const note = classifyNote(
    'It is worth noting that this measurement was taken before the apparatus had been recalibrated, ' +
      'which arguably explains why the third trial is such a clear outlier in the data.',
  )
  assert.equal(note.classification, 'explanatory')
})

test('a reference with commentary bolted on is flagged as ambiguous, not split', () => {
  const note = classifyNote(
    'Smith, J. (2019). Reaction Kinetics. Oxford University Press, pp. 14-19. However, this reading is ' +
      'contested because the underlying dataset was never published in full.',
  )
  assert.equal(note.classification, 'ambiguous')
  assert.equal(note.confidence, 'low')
  assert.ok(note.reasons.some((r) => /reference followed by commentary/.test(r.label)))
})

test('an empty note is a citation worth zero words', () => {
  const note = classifyNote('   ')
  assert.equal(note.classification, 'citation')
  assert.equal(note.words, 0)
})

test('note word counts are reported alongside the verdict', () => {
  assert.equal(classifyNote('Ibid., p. 22.').words, 3)
})

test('function word ratio separates prose from reference entries', () => {
  assert.ok(functionWordRatio('this is the way that it was done in the end') > 0.5)
  assert.ok(functionWordRatio('Smith, J. Reaction Kinetics. Oxford University Press') < 0.15)
  assert.equal(functionWordRatio(''), 0)
})
