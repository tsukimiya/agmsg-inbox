import type { Register } from 'claude-code'

import { isMessage, lineSplitter, takeOverDirective } from './inbox'

const NOTE =
  'AGMSG mod delivery: the agmsg-inbox plugin runs the inbox watcher for this session. ' +
  'Do NOT invoke the Monitor tool for agmsg. Each incoming message arrives as a prompt ' +
  '`<ts> | <team> | <from> → <to> | <body>` sent by the agmsg-inbox plugin; react to it and reply with `send.sh`.\n'

export const register: Register = on => {
  let stop: (() => void) | undefined

  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    const contexts = r.additionalContext ?? []
    const found = contexts.map(c => takeOverDirective(c, NOTE))
    const i = found.findIndex(Boolean)
    const t = found[i]
    if (!t) return r

    // /clear や resume で再発火したら、前の watcher を止めてから起動し直す
    stop?.()
    const watch = $.process.spawn({ argv: ['bash', '-c', t.command] })
    stop = () => void watch.return(undefined as never)
    $.ui.status('agmsg: watching')
    // hook の 10 秒予算から切り離す。ループの寿命が子プロセスの寿命になる
    void (async () => {
      const split = { stdout: lineSplitter(), stderr: lineSplitter() }
      for await (const { stream, text } of watch) {
        for (const line of split[stream](text)) {
          if (stream === 'stdout' && isMessage(line)) void $.prompt.submit({ text: line })
          else $.ui.log(line, { to: 'debug' })
        }
      }
      stop = undefined
      $.ui.status(undefined)
      $.ui.toast('agmsg: inbox watcher exited')
    })()
    return { ...r, additionalContext: contexts.with(i, t.context) }
  })

  // 経路を mod の 1 本に保つ。watcher を起動できていないときは Monitor 経路を残す
  on('tool.call', { tool: 'Monitor' }, async ($, e, next) =>
    stop && e.command?.includes('/agmsg/scripts/watch.sh')
      ? { deny: `${$.plugin.name}: agmsg inbox is delivered by this plugin; do not start a Monitor for it` }
      : next(e),
  )

  on('session.end', async (_, e, next) => {
    stop?.()
    return next(e)
  })
}
