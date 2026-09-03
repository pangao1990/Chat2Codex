# Chat2Codex

**Use ChatGPT as the brain, Codex as the hands.**

Chat2Codex は、公式 Codex Desktop / CLI 向けのローカルな Responses 互換ブリッジです。
ログイン済みの ChatGPT Web を主な推論プロバイダーとして使い、Codex のファイル、Shell、
Git、ツール Harness はそのまま維持します。ChatGPT が利用できない場合は、後続の再試行または
継続を Native Codex に切り替えられます。

このプロジェクトは
[miuuyy/codex-chatgpt-web](https://github.com/miuuyy/codex-chatgpt-web) 4.0.8 を基盤にしています。
正確なベースコミットと同期ルールは [UPSTREAM.md](UPSTREAM.md) に記録され、上流の MIT
ライセンスと著作権表示を保持します。

## 現在の Alpha スコープ

- 独立した製品名、Application ID、コマンド、ブラウザーパーティション、データルート。
- 本番データは `~/.chat2codex/`、開発データは `~/.chat2codex-dev/`。
- ChatGPT-first ポリシーとモデル単位の Circuit Breaker。
- Quality Lock。明示的な許可なしに推論品質を下げません。
- 許可された可用性障害だけを Native Codex fallback の対象にします。
- Safety refusal、キャンセル、権限、無効なリクエスト、sandbox refusal は fallback しません。
- Provider の切り替えは turn 境界だけで行い、単一 SSE 応答を混在させません。
- Tool ledger が完了済みの副作用の再実行を防ぎます。
- Standalone と CC Switch 向け External Manager の単一書き込み所有権。

Telemetry、Savings、完全な Launcher Dashboard は後続マイルストーンです。詳細は
[実装状況](docs/chat2codex-status.md) を参照してください。

## 要件とセットアップ

ソース開発には Bun 1.4.0 が必要です。グローバル Bun がない場合は、固定した npm 配布版を
利用できます。

```bash
npx -y bun@1.4.0 install --frozen-lockfile
cd launcher && npx -y bun@1.4.0 install --frozen-lockfile && cd ..
```

検証を実行します。

```bash
npx -y bun@1.4.0 run typecheck
npx -y bun@1.4.0 test tests/*.test.ts
npm test --prefix launcher
```

Launcher を起動します。

```bash
npx -y bun@1.4.0 run app
```

統合の所有権確認、または CC Switch 用 loopback 設定の出力：

```bash
npx -y bun@1.4.0 run src/cli.ts integration status
npx -y bun@1.4.0 run src/cli.ts integration export
```

Setup では `--integration-mode standalone` または `--integration-mode external-manager` を指定
できます。External Manager モードは Codex 設定を書き換えません。

## セキュリティ境界

Responses listener は `127.0.0.1` のみに制限されます。ブラウザー session は機密性の高い
ローカルアカウントデータであり、コピーやログ記録は禁止です。Chat2Codex は非公式のブラウザー
自動化であり、利用量、安全ポリシー、権限、アクセス制御の回避には使用できません。

## ライセンス

[MIT](LICENSE)。上流の著作権と第三者通知を保持します。
