import { expect, test } from 'claude-code/testing'

import { isMessage, lineSplitter, takeOverDirective } from '../hooks/inbox'

// agmsg 1.5.2 の session-start.sh（単一席の経路）が出す directive。前後に他の hook の出力が付く
const CONTEXT = `terminal: plain
team: demo
AGMSG monitor mode: invoke the Monitor tool now with the following parameters,
before any other action in this session.

  command: /home/u/.agents/skills/agmsg/scripts/watch.sh sid-1:4242 /tmp/my\\ proj claude-code --max-seconds=1790
  description: agmsg inbox stream
  persistent: true
  timeout_ms: 1800000
This watch renews itself.

Note: On a /clear or --continue/--resume re-fire, you may shortly see a
"Monitor … stopped" notification for an earlier 'agmsg inbox stream'
task. That is the previous watcher being cleaned up to avoid duplicates
— it is expected. Do NOT relaunch it; the Monitor you invoke from this
directive replaces it.
other hook output
`

test('directive から watch コマンドを取り出し、directive だけを置き換える', () => {
  const t = takeOverDirective(CONTEXT, 'NOTE\n')
  expect(t?.command).toEqual('/home/u/.agents/skills/agmsg/scripts/watch.sh sid-1:4242 /tmp/my\\ proj claude-code')
  expect(t?.context).toEqual('terminal: plain\nteam: demo\nNOTE\nother hook output\n')
})

test('command の無い directive（既に watcher がいる・席を控える）には触らない', () => {
  const ctx = 'AGMSG monitor mode: a watch.sh is already streaming for this session (pid 1).\n'
  expect(takeOverDirective(ctx, 'NOTE')).toEqual(undefined)
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
