# Product Owner の最小確認手順
必要な確認は既存アカウントでの3組です。設定のSave/Apply、billing有効化、支払い情報、resource/key作成、SQL、deploy/rollback、credential表示、OAuth、review提出は行いません。

Codex確認済みの項目は再確認不要です：公開4ページ200/TLS/Vercel、Gitとtests、stagingのbilling/API状態、MAC不適合、global・東京・大阪のkeyring空、既存Production PostgreSQLのRUNNABLE/PG18/東京/tier/connector、backup/PITR、直近3件backup成功、直接project service-account role。

## 1. Vercel：配信・利用枠・rollbackをまとめて確認
| 項目 | 手順・判定 |
|---|---|
| Service | 既存Vercel team/project。local連携名はeasyslice-aiですが、実際にwww.nexcutai.comを配信するprojectを確認します。 |
| Navigation | Team dashboard→対象project→Settings→Domains。次にDeployments→現在のProduction deployment。teamのPlan/Billing概要・Usage・Spend Management概要も閲覧します。 |
| Fields | domain assignment、environment/branch、State、Git commit SHA、既知の安全なrollback artifact。Functions/route一覧が表示される場合だけcallback pathの有無。plan、残りusage、overage、auto-pause、trial expiry。bindingは名称と存在yes/noのみ。 |
| Possible values | Ready/Error/Building、割当あり/なし、実SHA、routeあり/非表示/UNKNOWN、plan名、pause/alertのみ/課金/UNKNOWN。 |
| Safe | 承認済みの隔離範囲と整合し、追加費用が出ない実際の利用枠・停止条件が証明できるもの。 |
| Blocks | cost UNKNOWN、alertのみ、未承認のProduction共有、domain/SHA不一致、route不明。Readyや残りcreditだけではSandbox準備完了になりません。 |
| Screenshot | domain/commit/stateとplan/usage/control概要をcropすると有用です。 |
| Redact | personal/account/org ID、binding values、cookie/token/query、支払い・invoice情報、他project。secretのReveal/Editを開きません。 |
| Settings change | NO。callback・Functionsを呼び出さず、redeploy/rollbackを押しません。 |
| Approval | 読取確認が目的です。後の設定・利用・deployment変更は別途承認が必要です。 |

公式navigation確認日2026-10-09：[Project settings](https://vercel.com/docs/project-configuration/project-settings)、[Spend Management](https://vercel.com/docs/spend-management)。route一覧が無ければUNKNOWNと回答し、endpointを試しません。

## 2. Google Cloud／Firebase：未解決の保管権限・回復・認証・costだけ確認
| 項目 | 手順・判定 |
|---|---|
| Service | NEXCUTの既存Google Cloud/Firebase projectと既存DB・security運用管理者。新projectは作りません。 |
| Navigation | 既存Consoleのprojectを選び、CloudSQLの既存instance metadata、既存migration運用記録の保有者、既存key metadata、FirebaseのProject settings/Authentication/Usage概要を閲覧。Cloud BillingはReports/Cost table概要のみ。 |
| Fields | TikTok保管に承認されたenvironment/namespace、実際のschema/table-grantとmigration-history authorityの保有証拠、tested restore/key recoveryと責任者。既存の適格ENCRYPT_DECRYPT/AES key・version・use権限・rotation/recovery operatorの存在。Firebaseのproject/domain/Google provider・nonprodまたは明示承認されたshared trust。追加usageのcost/overage/停止条件。 |
| Possible values | 承認済み/未承認/UNKNOWN、既存証拠あり/なし、MAC/AES/encrypt-decrypt、enabled/disabled、nonprod/Production-bound/UNKNOWN、zero-increment証拠/課金/UNKNOWN。 |
| Safe | target custody/isolation、least privilege、history authority、restoreとkey recovery、zero-incrementが証明される範囲のみ。 |
| Blocks | 存在するDBをそのまま保管許可と扱う、未証明のgrant/history/recovery、MAC、Production trustの無承認転用、cost UNKNOWN。 |
| Screenshot | metadataや既存運用記録の非秘密部分をcropすると有用です。既知のinstance/backup/IAM metadataを再撮影する必要はありません。 |
| Redact | raw DB/connection ID/IP、DSN、password/key material、personal principal、他project、支払い・invoice情報。 |
| Settings change | NO。SQL Studio/Query Editor、password/connection/secret values、IAM編集、backup実行・restoreを開きません。API Enable/createを求められたら停止しUNKNOWN/noneと報告します。 |
| Approval | 新しいDBアクセス・scope・configuration・key・migration・deploymentは別途承認。現在はSQLを実行せず、証拠が無ければUNKNOWNと既存責任者を示します。 |

Codexが取得したDB存在/version/region/tier/backup設定・成功時刻・直接GCP roleは確認不要です。GCP roleとPostgreSQL table privilegeは別です。stageの既知MACや調査済み3地域を繰り返さず、既にある適格な別keyだけを報告します。無ければnone、作成しません。

参考確認日2026-10-09：[Cloud SQL backup](https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/backups)、[Firebase plan](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)。providerの保持期間をNEXCUTのretention承認に変換しません。

## 3. TikTok：保存済みSandbox設定だけ確認
| 項目 | 手順・判定 |
|---|---|
| Service | 既存TikTok Developer PortalのNEXCUT AI Review。 |
| Navigation | Manage apps→NEXCUT AI Review→Sandbox→既存Sandbox。Login Kit→Web redirect、Content Posting→Direct Post、Scopes、Sandbox target settingsを閲覧/reload。 |
| Fields | 正しいapp/Sandbox、saved canonicalURI、saved products/Direct Post、実際に選択済みuser.info.basic・video.publish、既存target eligibility、Productionとの分離。 |
| Possible values | saved/missing/draft/UNKNOWN、selected/not selected、eligible/UNKNOWN。 |
| Safe | 正しいapp/Sandboxの保存済み一致するmetadata。 |
| Blocks | draft、URI/app/scopes不一致、importだけでSave未証明。 |
| Screenshot | 各saved画面をcropすると有用です。 |
| Redact | client secret/key values、credential QR、token/cookie/code/state/authURL、personal target IDs。 |
| Settings change | NO。Apply changes、Import、Add account、scope編集、review、OAuthを行いません。 |
| Approval | 後のURI/configuration/testは別承認。画像や設定確認だけではrealOAuth承認になりません。 |

[Sandbox保存仕様](https://developers.tiktok.com/docs/en/add-a-sandbox)、確認日2026-10-09。Production import報告はProduction Save証明ではありません。

以上3組で複数blockerを同時に解決します。credential/payment detailsを送らず、既存resourceが無ければnone/UNKNOWNで停止します。Render/Supabaseのsignupやpaid resourceは依頼しません。B08 realOAuth承認は後の独立したgateです。
