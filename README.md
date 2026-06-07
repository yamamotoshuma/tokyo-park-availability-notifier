# Tokyo Park Availability Notifier

都立公園スポーツレクリエーション予約システムの空き状況検索と、東京スカイツリーグの対戦募集検索を定期実行し、対象が見つかったら LINE に通知するバッチです。

予約・申込操作は行いません。検索結果を読み取り、通知だけを送ります。

## 予約開始ルール

公式案内では、空き施設予約は「利用前月の22日0:00から利用開始時刻まで」の先着順受付です。

このため、デフォルト設定では当月の第1・第3・第5土曜日を対象にし、当日が22日以降の場合だけ翌月の第1・第3・第5土曜日も対象に含めます。第5土曜日が存在しない月は自動で除外します。

参照: https://www.tokyo-park.or.jp/park/sports/h-reserv/index.html

## スカイツリーグ検索ルール

デフォルト設定では、対戦募集掲載済みの「募集中（グランド有り）」から、募集形式 `LG` の当月第1・第3・第5土曜日を対象にします。

当月の対象土曜日の残りが `includeNextMonthWhenRemainingTargetDatesAtMost` 以下になったら、翌月の第1・第3・第5土曜日も対象に含めます。デフォルトは `1` です。例えば第5土曜日がある月は、第3土曜日になった時点で残り対象土曜日が第5土曜日だけになるため、翌月分も検索します。

対象地域は `skytreeLeague.targetAreas` で変更できます。デフォルトは北区、板橋区、練馬区、豊島区、文京区、千代田区、新宿区、中野区、杉並区、埼玉県です。空配列の場合は地域で絞り込みません。

当日から `skytreeLeague.excludeWithinDays` 日以内の募集は通知しません。デフォルトは `7` です。

募集形式は `skytreeLeague.competitionTypes` で変更できます。デフォルトは `["LG"]` です。空配列の場合は募集形式で絞り込みません。

開始時刻が `skytreeLeague.excludeStartingAtOrAfter` 以降の募集は通知しません。デフォルトは `"19:00"` です。`null` の場合は開始時刻で絞り込みません。

募集チームが `skytreeLeague.excludedHostTeams` に含まれる募集は通知しません。デフォルトは `["ORDERMADEBASEBALLclub"]` です。大文字・小文字・空白の違いは無視します。空配列の場合はチーム名で絞り込みません。

都立公園も開始時刻が `tokyoParks.excludeStartingAtOrAfter` 以降の空き枠は通知しません。デフォルトは `"19:00"` です。`null` の場合は開始時刻で絞り込みません。

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
  },
  "skytreeLeague": {
    "userId": "SET_LOCALLY",
    "password": "SET_LOCALLY"
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

同じ都立公園の `公園 / 施設 / 種目 / 日付 / 時間帯`、または同じスカイツリーグ募集 ID は再通知しません。過去日の通知履歴は次回実行時に自動で整理されます。

## Default Search

- 種目: 野球
- 公園: 浮間公園
- 施設: 野球場
- 対象日: 当月の第1・第3・第5土曜日、22日以降は翌月も追加
- 都立公園開始時刻: 19:00以降は対象外
- スカイツリーグ: 募集中（グランド有り）
- スカイツリーグ対象日: 当月の第1・第3・第5土曜日、残り対象土曜日が1以下なら翌月も追加
- スカイツリーグ対象地域: 北区、板橋区、練馬区、豊島区、文京区、千代田区、新宿区、中野区、杉並区、埼玉県
- スカイツリーグ募集形式: LG
- スカイツリーグリードタイム: 当日から7日以内は対象外
- スカイツリーグ開始時刻: 19:00以降は対象外
- スカイツリーグ除外チーム: ORDERMADEBASEBALLclub

## Dry Run

LINE送信せずに結果だけ確認したい場合は、`config/availability.config.json` の `notifications.dryRun` を `true` にしてください。
