# Staging Cloud SQL cost assessment — proposal only
Reviewed official pricing2026-10-09; USD,730-hour example month; tax/JPY conversion/credits/negotiated rates excluded. Live Tokyo selector not verified. Official extracted default tables are Iowa/us-central1 examples: NEVER a Tokyo quote. Final regional SKU/calculator/billing-owner approval required.
[Cloud SQL pricing](https://cloud.google.com/sql/pricing) lists compute/storage/backup/network, no separate API-enablement or creation-setup tariff. $0 direct enable/create operation fee is an INFERENCE from tariff, not free resource usage. API enable alone does not create an instance; instance creation starts provisioned charges. No API enabled. [API prerequisites](https://docs.cloud.google.com/sql/docs/postgres/admin-api) separately require serviceusage.services.enable.

| Cost | Official example / labeled estimate | Conditions |
|---|---|---|
| API enable alone | No separately listed direct charge; inferred $0 | Approval remains required; no billed resource included |
| Creation setup | No separate operation setup price listed | Compute/storage begin immediately after provisioning |
| micro compute | $0.0105/hour -> $7.665/730h | Iowa example,0.6GiB shared core,no SLA; NOT Tokyo |
| small compute | $0.035/hour -> $25.55/730h | Iowa example,1.7GiB shared core,no SLA; NOT Tokyo |
| SSD10GiB allocated | $0.000232877/GiB-hour -> about $1.70/month | Iowa example; allocated/growth costs,not used-row size |
| Backups10GiB used | $0.000109589/GiB-hour -> about $0.80/month | Iowa example; actual retained incremental usage variable |
| Network | UNKNOWN final Tokyo/destination rate | Internet/workstation/Vercel/cross-region traffic not presumed free |
| Supporting infrastructure | UNKNOWN until approved design | IP,NAT,VPC connectors,proxy VM/Cloud Run,logs/metrics,secrets,KMS,object storage |

Illustrative subtotal micro=$10.17/month; small=$28.05/month, excludes network/key/secret/log/host costs. These are not Tokyo budget quotes. HA/dedicated CPU is costlier and must be quoted separately. Storage auto-growth can be irreversible to shrink. Stopping compute retains storage/backup/IP costs. Hidden costs: retained backups after deletion, restores/clones, replicas, major-version extended support, idle proxy hosts. Budget alerts do not cap spending; do not assume a free Cloud SQL tier.
[Secret Manager](https://cloud.google.com/secret-manager/pricing): illustrative $0.06/active-version-month beyond6 shared free versions; $0.03/10,000 accesses beyond10,000. Allowances are billing-account-wide,current consumption UNKNOWN; disabled retained versions may bill and replication location affects totals. Add exact later [KMS](https://cloud.google.com/kms/pricing),[VPC](https://cloud.google.com/vpc/network-pricing),[observability](https://cloud.google.com/stackdriver/pricing) and [calculator](https://cloud.google.com/products/calculator) figures; no invented quotes.

| Alternative | One-time/incremental recurring cost | Tradeoff |
|---|---|---|
| Qualified existing non-Production reuse | No new fixed instance charge; setup effort and storage/backup/egress/load costs | Potential lowest cloud option only after inventory/owner/isolation proof; no Production reuse |
| Local disposable PostgreSQL | No new GCP charge; existing workstation power/time/disk | Lowest currently executable option; real SQL but no Cloud SQL IAM/network/refresh proof |
| Minimum dedicated Cloud SQL | No listed setup fee; regional recurring compute/storage/backup plus extras | Needed for genuine qualification if reuse unavailable; paid-resource approval required |
| Other available project resources | UNKNOWN availability/capacity/billing | MAC/service accounts are not relational DB; no free host/database assumed |

Recommendation now: local PostgreSQL acceptance, then scoped API-enable/inventory approval WITHOUT resource creation. Prefer qualified non-Production reuse, else quote minimal single-zone Tokyo tier and bounded active rehearsal window. Owner approves region/tier/storage cap+growth/backups/connectivity/security/workload hours/budget alerts/cleanup owner/deletion+retention. No cost-incurring action performed.
