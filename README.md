# Tokyo Park Availability Notifier

都立公園スポーツレクリエーション予約システムの空き状況検索を定期実行し、浮間公園の野球場に空きが出たら LINE に通知するバッチです。

予約操作は行いません。空き検索の結果を読み取り、通知だけを送ります。

## 予約開始ルール

公式案内では、空き施設予約は「利用前月の22日0:00から利用開始時刻まで」の先着順受付です。

このため、デフォルト設定では当月の第1・第3・第5土曜日を対象にし、当日が22日以降の場合だけ翌月の第1・第3・第5土曜日も対象に含めます。第5土曜日が存在しない月は自動で除外します。

参照: https://www.tokyo-park.or.jp/park/sports/h-reserv/index.html

## Setup

```bash
npm install
cp config/availability.config.json.example config/availability.config.json
cp secrets/notifications.local.json.example secrets/notifications.local.json
```

`secrets/notifications.local.json` に LINE Bot のアクセストークンと通知先 ID を設定します。

```json
{
  "line": {
    "apiUrl": "https://api.line.me/v2/bot/message/push",
    "accessToken": "SET_LOCALLY",
    "recipientId": "SET_LOCALLY"
  }
}
```

## Run

1回だけ実行:

```bash
npm run build
npm start
```

1時間ごとに常駐実行:

```bash
npm run build
npm run watch
```

間隔を変える場合:

```bash
CHECK_INTERVAL_MINUTES=30 npm run watch
```

cron や systemd timer で `npm start` を1時間ごとに起動しても運用できます。

## Duplicate Prevention

通知済みの空き枠は `data/notified.json` に保存します。

同じ `公園 / 施設 / 種目 / 日付 / 時間帯` は再通知しません。過去日の通知履歴は次回実行時に自動で整理されます。

## Default Search

- 種目: 野球
- 公園: 浮間公園
- 施設: 野球場
- 対象日: 当月の第1・第3・第5土曜日、22日以降は翌月も追加

## Dry Run

LINE送信せずに結果だけ確認したい場合は、`config/availability.config.json` の `notifications.dryRun` を `true` にしてください。
