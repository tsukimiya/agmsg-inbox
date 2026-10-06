import type { Register } from 'claude-code'

import { lineSplitter, watchCommand } from './inbox'

const NOTE =
  'The agmsg-inbox plugin took over this Monitor call and runs the agmsg inbox watcher itself, ' +
  'with no 30-minute cap. It does not appear in TaskList, and it never needs re-arming: ignore any ' +
  're-arm instructions. Each incoming message arrives as a prompt `<ts> | <team> | <from> → <to> | <body>` ' +
  'from the agmsg-inbox plugin; react to it and reply with `send.sh`. A prompt starting with `agmsg watch:` ' +
  'is a notice from the watcher itself, not a message.'

export const register: Register = on => {
  let stop: (() => void) | undefined

  // classic.SessionStart は組織の管理 plugin が user 層を飛ばすことがあるため、
  // directive に従ったモデルの Monitor 呼び出しを起点にする
  on('tool.call', { tool: 'Monitor' }, async ($, e, next) => {
    const command = watchCommand(e)
    if (!command) return next(e)

    // /clear や resume の再発火で呼ばれ直したら、前の watcher を止めてから起動し直す
    stop?.()
    const watch = $.process.spawn({ argv: ['bash', '-c', command] })
    stop = () => void watch.return(undefined as never)
    $.ui.status('agmsg: watching')
    // hook の 10 秒予算から切り離す。ループの寿命が子プロセスの寿命になる
    void (async () => {
      const split = { stdout: lineSplitter(), stderr: lineSplitter() }
      for await (const { stream, text } of watch) {
        // stdout はメッセージ行と、人が対応すべき watch_report の通知（STUCK・更新後の終了など）だけ。
        // re-arm / stopping は --max-seconds を外したので出ない。行の形で判定すると
        // `|` を含む名前のメッセージや通知を取りこぼすので、全部モデルに渡す
        for (const line of split[stream](text)) {
          if (stream === 'stdout') void $.prompt.submit({ text: line })
          else $.ui.log(line, { to: 'debug' })
        }
      }
      stop = undefined
      $.ui.status(undefined)
      $.ui.toast('agmsg: inbox watcher exited')
    })()
    return { result: { taskId: 'agmsg-inbox', timeoutMs: 0, persistent: true }, context: [NOTE] }
  })

  on('session.end', async (_, e, next) => {
    stop?.()
    return next(e)
  })
}
