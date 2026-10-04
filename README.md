# agmsg-inbox

A [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview) that delivers the [agmsg](https://github.com/fujibee/agmsg) inbox to a Claude Code session without the Monitor tool.

Status: **experimental proof of concept** for [fujibee/agmsg#1559](https://github.com/fujibee/agmsg/issues/1559). Verified on one machine (see [Verified](#verified)).

## Why

In `monitor` delivery mode, agmsg asks Claude to run `watch.sh` under the Monitor tool. A Monitor task always ends at 30 minutes, so:

- With `AGMSG_CC_MONITOR_KEEP_ALIVE`, Claude re-arms the watch every 30 minutes. Each re-arm uses a model turn, even while nothing arrives.
- Without it, a watch that delivered nothing stops (`agmsg watch: stopping - ...`), and an idle seat receives nothing until the next session.

agmsg 1.5.2 (#1553) made the renew-or-stop decision deterministic, but the re-arm itself still goes through the model.

A mod runs inside the Claude Code process, and a child started with `$.process.spawn` lives as long as the mod's loop, with no time cap. So the watcher can stay up for the whole session, and the model is woken only when a message actually arrives.

## How it works

1. agmsg's SessionStart hook tells the model to start a Monitor for `watch.sh`, as it does today.
2. `tool.call` on `Monitor`: when the call is agmsg's (description starting with `agmsg inbox stream`, command running `scripts/watch.sh`), the mod answers it instead of the Monitor tool. It starts the same command with `$.process.spawn`, dropping `--max-seconds` (which exists only for the Monitor cap), and returns a Monitor-shaped result with a note that the watch needs no re-arming.
3. Each stdout line in the message format `<ts> | <team> | <from> → <to> | <body>` is passed to the model with `$.prompt.submit`. Status lines (`agmsg watch: ...`) and stderr go to the debug log.
4. A later agmsg Monitor call (after `/clear` or resume) replaces the running watcher. `session.end` stops it.

agmsg itself is not modified. Session id, role resume and seat ownership are still decided by agmsg's `session-start.sh`, and the command comes from the Monitor call's own input, so no directive text is parsed.

The model still makes one Monitor call per session start. Rewriting the SessionStart directive from a `classic.SessionStart` hook would remove that call, but on an organization (Team) plan the built-in plugin `cc-plugin-sec-default` sits outermost and skipped this mod's `classic.SessionStart` hook (`classic.SessionStart bypassed by cc-plugin-sec-default (tier user)` in the debug log), so this mod does not rely on it.

## Verified

Claude Code 2.1.289 (CLI, Team plan, WSL2, herdr pane), agmsg 1.5.2, `delivery set monitor`, one receiver seat:

| Check | Result |
| --- | --- |
| agmsg's Monitor call is answered by the mod | `tool.call Monitor ...: resolved by a hooks module (result)`; the transcript shows `Monitor started · task agmsg-inbox · persistent` |
| Watcher runs without `--max-seconds` | one `watch.sh` process for the session |
| Delivery while idle | each message reached the model 3–5 s after `send.sh` (the 5 s poll) and the model replied |
| Delivery while busy | a message sent during a 45 s foreground command was queued and handled after that turn ended, without interrupting it |
| Past the 30-minute Monitor cap | the same watcher process was alive at 32 min, a message sent then was delivered and answered, and no re-arm turn happened in between |

## Requirements

- Claude Code 2.1.287 or later (mods enabled by default), CLI or Desktop. In Desktop, plugins do not run in WSL sessions.
- agmsg 1.5.x with `delivery set monitor` for the project.

## Install

```
/plugin marketplace add tsukimiya/agmsg-inbox
/plugin install agmsg-inbox@tsukimiya
```

Or load it for one session from a clone:

```
claude --plugin-dir /path/to/agmsg-inbox
```

## Known limits

- The takeover is keyed on the Monitor description `agmsg inbox stream` and `scripts/watch.sh` in the command. If agmsg changes either, the mod lets the call through and Monitor delivery continues as before.
- The watcher does not appear in TaskList, which agmsg's directive names as its success check; the note returned with the result tells the model so.
- One message is one prompt; a burst is not batched.
- `watch.sh` advances the read cursor when it prints a line, while `$.prompt.submit` waits until the session is idle. A message counts as delivered before the model has read it.
- A plugin message is shown as "The agmsg-inbox plugin sent a message:" and starts its own turn.
- A hot reload of the mod stops the watcher until the model makes agmsg's Monitor call again (`/clear`, resume or a new session).

## Development

```
claude plugin validate .
claude plugin test .
```

## License

MIT
