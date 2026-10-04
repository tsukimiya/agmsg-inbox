# agmsg-inbox

[agmsg](https://github.com/fujibee/agmsg) の inbox を、Monitor ツールを使わずに Claude Code のセッションへ届ける [Claude Code mod](https://code.claude.com/docs/ja/plugins/mods/overview) です。

状態: [fujibee/agmsg#1559](https://github.com/fujibee/agmsg/issues/1559) のための**実験的な PoC** です。単体テストは通っていて、実機での検証を進めています。

## 作った理由

agmsg の `monitor` 配信では、Claude に Monitor ツールで `watch.sh` を動かすよう指示します。Monitor のタスクは 30 分で必ず終わるので、次のことが起きます。

- `AGMSG_CC_MONITOR_KEEP_ALIVE` があると、Claude が 30 分ごとに watch を張り直す。何も届いていなくても、張り直しのたびにターンを 1 回使う
- 無ければ、何も配達しなかった watch はそこで止まり（`agmsg watch: stopping - ...`）、待機中の席には次のセッションまで何も届かない

agmsg 1.5.2（#1553）で、張り直すか止めるかの判断は watcher 側で決まるようになりました。ただ、張り直しそのものは今もモデルが行います。

mod は Claude Code のプロセスの中で動きます。`$.process.spawn` で起動した子プロセスは mod のループが続くかぎり生きていて、時間の上限がありません。そのため watcher をセッションのあいだずっと動かしておけて、モデルが起こされるのはメッセージが実際に届いたときだけになります。

## 仕組み

1. `classic.SessionStart` で、agmsg 自身の SessionStart hook を先に動かす。その `additionalContext` から Monitor の directive を探し、`watch.sh` の起動コマンドを取り出す。Monitor の上限のためだけにある `--max-seconds` は外す。directive は「Monitor を起動しないこと」という 1 行に差し替える
2. そのコマンドを `$.process.spawn` で起動し、セッションのあいだ動かし続ける
3. stdout のうち `<ts> | <team> | <from> → <to> | <body>` の形の行だけを、`$.prompt.submit` でモデルに渡す。状態行（`agmsg watch: ...`）と stderr は debug ログに回す
4. `Monitor` の `tool.call` では、mod の watcher が動いているあいだ、agmsg の `watch.sh` を起動しようとする Monitor 呼び出しを拒否する。こうして 1 つの席に配達経路を 1 本だけにする。mod が受け取りに失敗したときは、Monitor 配信をそのまま残す
5. `session.end` で watcher を止める

agmsg 自体には手を入れていません。セッション ID、役割の再開、席の所有は、これまでどおり agmsg の `session-start.sh` が決めます。mod が変えるのは「誰がコマンドを動かすか」だけです。

## 動作条件

- Claude Code 2.1.287 以降（mods が既定で有効）。CLI または Desktop で動く。Desktop の WSL セッションでは plugin 自体が動かない
- agmsg 1.5.x で、プロジェクトに `delivery set monitor` を設定してあること

## インストール

```
/plugin marketplace add tsukimiya/agmsg-inbox
/plugin install agmsg-inbox@tsukimiya
```

clone したものを 1 セッションだけ読み込むこともできます。

```
claude --plugin-dir /path/to/agmsg-inbox
```

## 既知の制限

- コマンドは directive の文面（`command: ...`）から読み取っている。agmsg の文言が変わると受け取りに失敗する。その場合 mod は何もせず、Monitor 配信が続く。`session-start.sh` が機械で読める 1 行を出すようになれば、この依存は無くなる
- 1 通につき 1 回のプロンプトになる。続けて届いたメッセージをまとめることはしない
- `watch.sh` は行を出力した時点で既読カーソルを進めるが、`$.prompt.submit` はセッションが待機状態になるまで待つ。そのため、モデルが読む前に配達済みとして扱われる
- mod をホットリロードすると、次の SessionStart（`/clear`、resume、新しいセッション）まで watcher が止まる

## 開発

```
claude plugin validate .
claude plugin test .
```

## ライセンス

MIT
