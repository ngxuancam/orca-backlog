import { assert, test } from 'orca/testing'
import { backlogMarkdown, capMarkdown, inlineImages, keepLineBreaks } from './inline'

const attachments = [
  { id: 5, name: 'shot.png' },
  { id: 6, name: 'notes.pdf' }
]

test('keeps single line breaks, not blank lines or fenced code', () => {
  assert.equal(keepLineBreaks('a\nb\n\nc'), 'a  \nb\n\nc')
  assert.equal(keepLineBreaks('```\nx\ny\n```'), '```\nx\ny\n```')
  assert.equal(keepLineBreaks('a\r\nb'), 'a  \nb')
})

test('image references become attachment links; other references stay', () => {
  assert.equal(inlineImages('![image][shot.png]', attachments), '![image](attachment:5)')
  assert.equal(inlineImages('#image(shot.png)', attachments), '![shot.png](attachment:5)')
  assert.equal(inlineImages('![image][other.png]', attachments), '![image][other.png]')
  // Not an image: left for Backlog's own link text.
  assert.equal(inlineImages('![doc][notes.pdf]', attachments), '![doc][notes.pdf]')
})

test('a comment reads as Backlog shows it', () => {
  assert.equal(backlogMarkdown('Done\nEVD:\n\n![image][shot.png]', attachments), 'Done  \nEVD:\n\n![image](attachment:5)')
})

test('text over the Markdown limit is shortened and says so', () => {
  const long = 'あ'.repeat(30_000) // 90 KB of UTF-8
  const capped = capMarkdown(long)
  assert.ok(new TextEncoder().encode(capped).length < 64 * 1024)
  assert.match(capped, /open the issue in Backlog/)
  assert.ok(!capped.includes('�'))
  assert.equal(capMarkdown('short'), 'short')
})
