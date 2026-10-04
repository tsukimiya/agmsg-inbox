// agmsg の SessionStart directive（scripts/session-start.sh の heredoc）の始まりと終わりの文言。
// 単一席の経路も役割再開の経路も "AGMSG monitor mode:" で始まり "directive replaces it." で終わる
const DIRECTIVE = /AGMSG monitor mode:[\s\S]*?directive replaces it\.\n?/
const MESSAGE = /^[^|]+ \| [^|]+ \| [^|]+ → [^|]+ \| /

export type Takeover = { command: string; context: string }

// directive から watch.sh の起動コマンドを取り出し、directive 部分を note に置き換える。
// --max-seconds は Monitor の 30 分上限に合わせた自己終了なので、mod から起動するときは外す
export function takeOverDirective(context: string, note: string): Takeover | undefined {
  const block = context.match(DIRECTIVE)?.[0]
  const command = block?.match(/^\s*command: (.+)$/m)?.[1]
  if (!block || !command) return undefined
  return { command: command.replace(/\s+--max-seconds=\d+/, ''), context: context.replace(block, note) }
}

export const isMessage = (line: string) => MESSAGE.test(line)

// spawn の chunk は行単位で来ないので、改行までを溜めてから返す
export function lineSplitter() {
  let rest = ''
  return (text: string): string[] => {
    const lines = (rest + text).split('\n')
    rest = lines.pop() ?? ''
    return lines
  }
}
