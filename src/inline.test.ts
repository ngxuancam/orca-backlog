import { assert, test } from 'orca/testing'
import { backlogMarkdown, inlineImages, keepLineBreaks } from './inline'

test('keeps single line breaks, not blank lines or fenced code', () => {
  assert.equal(keepLineBreaks('a\nb\n\nc'), 'a  \nb\n\nc')
  assert.equal(keepLineBreaks('```\nx\ny\n```'), '```\nx\ny\n```')
  assert.equal(keepLineBreaks('a\r\nb'), 'a  \nb')
})

test('points Backlog image references at the cached files', () => {
  const src = new Map([['shot.png', '.cache/inline/APP-1/5-shot.png']])
  assert.equal(inlineImages('![image][shot.png]', src), '![image](.cache/inline/APP-1/5-shot.png)')
  assert.equal(inlineImages('#image(shot.png)', src), '![shot.png](.cache/inline/APP-1/5-shot.png)')
  assert.equal(inlineImages('![image][other.png]', src), '![image][other.png]')
  assert.match(inlineImages('![image][big.png]', new Map([['big.png', '']])), /too large to show here/)
})

test('a comment reads as Backlog shows it', () => {
  const src = new Map([['e.png', 'x/e.png']])
  assert.equal(backlogMarkdown('Done\nEVD:\n\n![image][e.png]', src), 'Done  \nEVD:\n\n![image](x/e.png)')
})
