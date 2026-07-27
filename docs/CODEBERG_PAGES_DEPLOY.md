# トマトオク Codeberg Pages自動公開

- 文書種別: GitHub `main`からCodeberg Pagesへの公開契約
- 対象: `chameleonjp-lab/tomatooku`
- Codeberg: `chameleonjp/tomatooku`
- 公開URL: `https://chameleonjp.codeberg.page/tomatooku/`
- 更新日: 2026-07-27
- 状態: **implemented / external prerequisites pending**

## 1. 目的

GitHubの`main`を正式な開発基準とし、更新された公開用ファイルだけをCodebergの`pages`ブランチへ反映する。Codebergの`main`、GitHubの開発文書、テスト、レビュー画面は公開物へ混ぜない。

## 2. 公開対象

```text
index.html
src/
generated/variable-stage-bank-v2.json
```

練習モードは実行時に`generated/variable-stage-bank-v2.json`を取得するため、このJSONが欠けた公開物は不合格とする。

次は公開しない。

```text
.github/
docs/
review/
scripts/
package.json
package-lock.json
playwright.config.js
Supabaseの設定資料
アクセストークン
```

`scripts/prepare-codeberg-pages.js`が公開物を`_site`へ作り、HTML、CSS、JavaScriptから参照するローカルファイルが欠けていないことを検査する。`scripts/codeberg-pages.test.js`は公開対象、84問バンク、認証方法、送信条件を固定する。

## 3. 起動条件

```text
GitHub mainへのpush
GitHub Actions画面からの手動実行
```

Pull RequestではCodebergへ送信しない。Draft PRの検査中に公開版が変わることはない。

## 4. 外部の前提条件

マージ前に次を人間が設定する。

1. Codebergへ公開リポジトリ`chameleonjp/tomatooku`を作成する。
2. Codeberg Pages用の通知を`pages`ブランチのpushへ設定する。
3. GitHub Repository Secretsへ`CODEBERG_USERNAME`を登録する。
4. GitHub Repository Secretsへ`CODEBERG_TOKEN`を登録する。

`CODEBERG_USERNAME`の想定値は`chameleonjp`である。`CODEBERG_TOKEN`はCodebergで発行したアクセストークンを使う。トークン本文をIssue、Pull Request、コミット、ログへ貼らない。

2026年7月27日の確認時点では、`https://codeberg.org/chameleonjp/tomatooku`と公開URLが404を返している。この状態でワークフローを`main`へ入れるとCodebergへのpushが失敗するため、リポジトリ作成と秘密情報の登録をマージ条件とする。

## 5. 送信方法

- 対象ブランチはCodebergの`pages`
- `pages`がない初回は独立した履歴として作成
- 2回目以降は既存`pages`を取得して通常push
- `rsync --checksum --delete`で公開対象から外れた古いファイルも除去
- 内容に差がなければcommitとpushを行わない
- 強制pushを使わない
- Codebergの`main`を変更しない

認証情報は実行中だけ`GIT_ASKPASS`からGitへ渡す。トークンを接続先URLへ埋め込まない。

## 6. 失敗時

- `CODEBERG_USERNAME`または`CODEBERG_TOKEN`が空なら、送信前に明示的に失敗する。
- 公開必須ファイルや参照先が欠けていれば、Codebergへ接続する前に失敗する。
- Codebergへの接続・権限・通知に問題があれば、同じワークフロー内で原因を確認し、別PRへ回避しない。
- 公開内容を戻す場合はGitHubで復元用PRを作り、`main`へ統合後に通常の公開を行う。Codebergへ手作業で異なる版を上書きしない。

## 7. 完了条件

- GitHub Actionsの公開契約テストが成功する。
- Codebergの`chameleonjp/tomatooku`が存在する。
- GitHubの2つの秘密情報が利用できる。
- `main`更新後の公開ワークフローが成功する。
- Codebergの`pages`先端がGitHubの対象SHAを示すcommitになる。
- 公開URLが`index.html`と84問JSONを返す。

実機確認とSupabaseランキング再登録は、この自動公開契約とは別の工程として扱う。
