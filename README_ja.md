# agmsg-inbox

[agmsg](https://github.com/fujibee/agmsg) の inbox を、Monitor ツールを使わずに Claude Code のセッションへ届ける [Claude Code mod](https://code.claude.com/docs/ja/plugins/mods/overview) です。

状態: [fujibee/agmsg#1559](https://github.com/fujibee/agmsg/issues/1559) のための**実験的な PoC** です。1 台の環境で実機検証しました（[検証結果](#検証結果)）。

## 作った理由

agmsg の `monitor` 配信では、Claude に Monitor ツールで `watch.sh` を動かすよう指示します。Monitor のタスクは 30 分で必ず終わるので、次のことが起きます。

- `AGMSG_CC_MONITOR_KEEP_ALIVE` があると、Claude が 30 分ごとに watch を張り直す。何も届いていなくても、張り直しのたびにターンを 1 回使う
- 無ければ、何も配達しなかった watch はそこで止まり（`agmsg watch: stopping - ...`）、待機中の席には次のセッションまで何も届かない

agmsg 1.5.2（#1553）で、張り直すか止めるかの判断は watcher 側で決まるようになりました。ただ、張り直しそのものは今もモデルが行います。

mod は Claude Code のプロセスの中で動きます。`$.process.spawn` で起動した子プロセスは mod のループが続くかぎり生きていて、時間の上限がありません。そのため watcher をセッションのあいだずっと動かしておけて、モデルが起こされるのはメッセージが実際に届いたときだけになります。

## 仕組み

1. agmsg の SessionStart hook が、これまでどおりモデルに `watch.sh` の Monitor を起動するよう指示する
2. `Monitor` の `tool.call` で、agmsg の呼び出し（description が `agmsg inbox stream` で始まり、コマンドが `scripts/watch.sh` を動かすもの）だけを、Monitor ツールの代わりに mod が受ける。同じコマンドを、Monitor の上限のためだけにある `--max-seconds` を外して `$.process.spawn` で起動する。モデルには Monitor の結果の形で返し、張り直しが要らないことを書き添える
3. stdout の行をすべて `$.prompt.submit` でモデルに渡す。`watch.sh` が stdout に出すのは、メッセージ（`<ts> | <team> | <from> → <to> | <body>`）と、人が対応すべき通知（`agmsg watch: ...`。カーソルが進まなくなった、agmsg の更新で終了した、など）だけ。行の形で選り分けないので、名前に `|` を含むメッセージも落ちない。`re-arm` と `stopping` の通知は `--max-seconds` があるときだけ出るもので、mod はこれを外している。stderr は debug ログに回す
4. `/clear` や resume のあとで agmsg の Monitor 呼び出しがもう一度来たら、動いている watcher を置き換える。`session.end` で止める

agmsg 自体には手を入れていません。セッション ID、役割の再開、席の所有は、これまでどおり agmsg の `session-start.sh` が決めます。コマンドは Monitor 呼び出しの引数から受け取るので、directive の文面は解析しません。

セッションの開始時には、今もモデルが Monitor を 1 回呼びます。`classic.SessionStart` の hook で directive を書き換えればこの 1 回も無くせますが、組織（Team プラン）では組み込みの `cc-plugin-sec-default` が一番外側に置かれ、この mod の `classic.SessionStart` hook を飛ばしました（debug ログに `classic.SessionStart bypassed by cc-plugin-sec-default (tier user)`）。そのため、この方式には頼っていません。

## 検証結果

Claude Code 2.1.289（CLI、Team プラン、WSL2、herdr のペイン）、agmsg 1.5.2、`delivery set monitor`、受信側の席は 1 つで確かめました。

| 確認したこと | 結果 |
| --- | --- |
| agmsg の Monitor 呼び出しを mod が受ける | debug ログに `tool.call Monitor ...: resolved by a hooks module (result)`。画面には `Monitor started · task agmsg-inbox · persistent` |
| `--max-seconds` なしで watcher が動く | セッションに `watch.sh` のプロセスが 1 つ |
| 待機中の配達 | `send.sh` から 3〜5 秒（5 秒間隔のポーリング）でモデルに届き、モデルが返信した |
| 作業中の配達 | 45 秒かかるフォアグラウンドのコマンドの最中に送ったメッセージは、割り込まずにキューに入り、そのターンが終わってから処理された |
| Monitor の 30 分上限を過ぎた後 | 32 分の時点で同じ watcher のプロセスが動いていて、そのとき送ったメッセージも届いて返信があった。その間に張り直しのターンは 1 回も無かった |
| `AGMSG_CC_MONITOR_KEEP_ALIVE` を空にし、何も届かないまま上限を過ぎた後 | 32 分間メッセージが無くても同じ watcher が動いていた（Monitor なら `stopping` で止まる条件）。そのあと送ったメッセージも届いて返信があり、その間のモデルへのリクエストは Claude Code 自身の離席時要約の 1 件だけだった |

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

- 横取りの判定には、Monitor の description `agmsg inbox stream` と、コマンド中の `scripts/watch.sh` を使っている。agmsg がどちらかを変えると mod は呼び出しをそのまま通し、これまでどおり Monitor で配達される
- watcher は TaskList に出ない。agmsg の directive は TaskList を成功の確認方法に挙げているので、結果に添える説明でモデルにそのことを伝えている
- 1 通につき 1 回のプロンプトになる。続けて届いたメッセージをまとめることはしない
- `watch.sh` は行を出力した時点で既読カーソルを進めるが、`$.prompt.submit` はセッションが待機状態になるまで待つ。そのため、モデルが読む前に配達済みとして扱われ、その間にセッションが終わるとメッセージは失われる。agmsg には既読にせずに inbox を読む手段が無いので、mod の側では直せない。[fujibee/agmsg#1559](https://github.com/fujibee/agmsg/issues/1559) で予定されている常駐デーモン agmsgd がこの経路を置き換える予定
- plugin からのメッセージは「The agmsg-inbox plugin sent a message:」と表示され、それ自体で 1 回のターンになる
- mod をホットリロードすると、モデルがもう一度 agmsg の Monitor を呼ぶ（`/clear`、resume、新しいセッション）まで watcher が止まる

## 開発

```
claude plugin validate .
claude plugin test .
```

## ライセンス

MIT
