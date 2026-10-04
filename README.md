# agmsg-inbox

A [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview) that delivers the [agmsg](https://github.com/fujibee/agmsg) inbox to a Claude Code session without the Monitor tool.

Status: **experimental proof of concept** for [fujibee/agmsg#1559](https://github.com/fujibee/agmsg/issues/1559). Unit tests pass; live verification is in progress.

## Why

In `monitor` delivery mode, agmsg asks Claude to run `watch.sh` under the Monitor tool. A Monitor task always ends at 30 minutes, so:

- With `AGMSG_CC_MONITOR_KEEP_ALIVE`, Claude re-arms the watch every 30 minutes. Each re-arm uses a model turn, even while nothing arrives.
- Without it, a watch that delivered nothing stops (`agmsg watch: stopping - ...`), and an idle seat receives nothing until the next session.

agmsg 1.5.2 (#1553) made the renew-or-stop decision deterministic, but the re-arm itself still goes through the model.

A mod runs inside the Claude Code process, and a child started with `$.process.spawn` lives as long as the mod's loop, with no time cap. So the watcher can stay up for the whole session, and the model is woken only when a message actually arrives.

## How it works

1. `classic.SessionStart`: lets agmsg's own SessionStart hook run, finds its Monitor directive in `additionalContext`, and takes the `watch.sh` command from it (dropping `--max-seconds`, which exists only for the Monitor cap). The directive is replaced with a one-line note telling the model not to start a Monitor.
2. Starts that command with `$.process.spawn` and keeps it running for the session.
3. Each stdout line in the message format `<ts> | <team> | <from> → <to> | <body>` is passed to the model with `$.prompt.submit`. Status lines (`agmsg watch: ...`) and stderr go to the debug log.
4. `tool.call` on `Monitor`: while the mod's watcher is running, a Monitor call for agmsg's `watch.sh` is refused, so there is one delivery route per seat. If the mod could not take over, Monitor delivery is left as is.
5. `session.end`: stops the watcher.

agmsg itself is not modified. Session id, role resume and seat ownership are still decided by agmsg's `session-start.sh`; the mod only changes who runs the command.

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

- The command is read from the directive's prose (`command: ...`). A change in agmsg's wording breaks the takeover, in which case the mod does nothing and Monitor delivery continues. A machine-readable line from `session-start.sh` would remove this dependency.
- One message is one prompt; a burst is not batched.
- `watch.sh` advances the read cursor when it prints a line, while `$.prompt.submit` waits until the session is idle. A message counts as delivered before the model has read it.
- A hot reload of the mod stops the watcher until the next SessionStart (`/clear`, resume or a new session).

## Development

```
claude plugin validate .
claude plugin test .
```

## License

MIT
