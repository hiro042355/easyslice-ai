# Database decision
PREFERRED_DATABASE_PATH（現在）=承認済みLOCAL_TEST disposable PGのみ。REAL_DATABASE_READY=NO、PRODUCTION_DB_REUSE_READY=NO。実resourceを選ぶにはownerのcustody/isolation/history/recovery/cost証拠が必要です。

| 証拠がある選択肢 | 判定／残る証拠・blocker |
|---|---|
| A. Existing authorized DB | Production instanceの存在はM15独立確認。ただし現在のTikTok利用は禁止・権限不明でNOT_SELECTED。B03/B04/B05/B06/B02/C01。 |
| B. Existing free DB | actual account/resource/permission未確認。UNKNOWN、free広告を適用しない。 |
| C. Dedicated free candidate | 以前の候補は候補のみ。account/database/resource作成は未承認でNOT_SELECTED。新しい比較・signup・trialなし。 |
| D. Local disposable PG | YES development/testing only。private network、synthetic schema/data、必要な負例、owned cleanup。実tokenの永続保管・backup/restore proofではない。 |

将来の優先条件は、既に承認されisolatedなnonproduction DBが実在し、必要なschema/role/TLS/backup・key recovery/zero-incrementが証明されることです。resource名を発明せず、見つからなければ実DB選定を停止。Owner回答namespace/grants/migration UNKNOWN、restore NONE、cost UNKNOWNを維持します。新しいDB/SQL/migration/versionを作りません。
