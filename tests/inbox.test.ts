import { expect, test } from 'claude-code/testing'

import { lineSplitter, watchCommand } from '../hooks/inbox'

const WATCH = '/home/u/.agents/skills/agmsg/scripts/watch.sh sid-1.4242 /tmp/my\\ proj claude-code'

test('agmsg の Monitor 呼び出しだけを横取りし、--max-seconds を外す', () => {
  expect(watchCommand({ description: 'agmsg inbox stream', command: `${WATCH} --max-seconds=1790` })).toEqual(WATCH)
  expect(watchCommand({ description: 'agmsg inbox stream (acting as bob)', command: `${WATCH} bob --max-seconds=1790` })).toEqual(`${WATCH} bob`)
  expect(watchCommand({ description: 'errors in deploy.log', command: 'tail -f deploy.log' })).toEqual(undefined)
  expect(watchCommand({ description: 'agmsg inbox stream' })).toEqual(undefined)
})

test('chunk を行に組み直す', () => {
  const split = lineSplitter()
  expect([...split('2026-10-04T01:00:00Z | demo | alice → bob | hel'), ...split('lo\\nworld\nagmsg watch: x\n'), ...split('tail')]).toEqual([
    '2026-10-04T01:00:00Z | demo | alice → bob | hello\\nworld',
    'agmsg watch: x',
  ])
})

test('watcher の stdout は名前に `|` があっても通知でも全部モデルに渡し、stderr は渡さない', async ($, on) => {
  const submitted: string[] = []
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  on('process.spawn', async function* () {
    yield { stream: 'stdout' as const, text: '2026-10-04T01:00:00Z | demo | a|b → bob | hi\nagmsg watch: delivery for demo/bob is STUCK\n' }
    yield { stream: 'stderr' as const, text: 'agmsg watch: debug only\n' }
    return { value: { code: 0, signal: null } }
  })
  await $.tool.call({ tool: 'Monitor', description: 'agmsg inbox stream', command: `${WATCH} --max-seconds=1790`, persistent: true, timeout_ms: 1800000 })
  for (let i = 0; i < 100 && submitted.length < 2; i++) await new Promise(r => setTimeout(r, 10))
  expect(submitted).toEqual(['2026-10-04T01:00:00Z | demo | a|b → bob | hi', 'agmsg watch: delivery for demo/bob is STUCK'])
})
