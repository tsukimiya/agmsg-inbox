import { expect, test } from 'claude-code/testing'

import { isMessage, lineSplitter, watchCommand } from '../hooks/inbox'

const WATCH = '/home/u/.agents/skills/agmsg/scripts/watch.sh sid-1.4242 /tmp/my\\ proj claude-code'

test('agmsg の Monitor 呼び出しだけを横取りし、--max-seconds を外す', () => {
  expect(watchCommand({ description: 'agmsg inbox stream', command: `${WATCH} --max-seconds=1790` })).toEqual(WATCH)
  expect(watchCommand({ description: 'agmsg inbox stream (acting as bob)', command: `${WATCH} bob --max-seconds=1790` })).toEqual(`${WATCH} bob`)
  expect(watchCommand({ description: 'errors in deploy.log', command: 'tail -f deploy.log' })).toEqual(undefined)
  expect(watchCommand({ description: 'agmsg inbox stream' })).toEqual(undefined)
})

test('chunk を行に組み直し、メッセージ行だけを拾う', () => {
  const split = lineSplitter()
  const lines = [
    ...split('2026-10-04T01:00:00Z | demo | alice → bob | hel'),
    ...split('lo\\nworld\nagmsg watch: re-arm - x\n2026-10-04T01:00:01Z | demo | carol → bob | hi'),
    ...split('\n'),
  ]
  expect(lines.filter(isMessage)).toEqual([
    '2026-10-04T01:00:00Z | demo | alice → bob | hello\\nworld',
    '2026-10-04T01:00:01Z | demo | carol → bob | hi',
  ])
  expect(lines.length).toEqual(3)
})
