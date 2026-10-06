// agmsg の SessionStart directive が指示する Monitor 呼び出し（description は役割再開時に
// "agmsg inbox stream (acting as <name>)" になる）なら、mod で起動するコマンドを返す。
// --max-seconds は Monitor の 30 分上限に合わせた自己終了なので外す
export function watchCommand(input: { description?: string; command?: string }): string | undefined {
  if (!input.description?.startsWith('agmsg inbox stream') || !input.command?.includes('/scripts/watch.sh')) return undefined
  return input.command.replace(/\s+--max-seconds=\d+/, '')
}

// spawn の chunk は行単位で来ないので、改行までを溜めてから返す
export function lineSplitter() {
  let rest = ''
  return (text: string): string[] => {
    const lines = (rest + text).split('\n')
    rest = lines.pop() ?? ''
    return lines
  }
}
