# Cost — accessed 2026-10-09
USD illustrative planning, no tax/FX quotation. Account plans/billing/free allowance/spare capacity not accessed. No spend created. Setup labor/operator opportunity cost UNKNOWN. Desired GCP Tokyo asia-northeast1; observed KMS asia1. Neon selected region/residency UNKNOWN; Vercel plan prices not Tokyo compute SKU prices.

Official: [Vercel](https://vercel.com/pricing), [Hobby eligibility](https://vercel.com/docs/plans/hobby), [KMS](https://cloud.google.com/kms/pricing), [Secret Manager](https://cloud.google.com/secret-manager/pricing), [Cloud Run](https://cloud.google.com/run/pricing), [Cloud SQL](https://cloud.google.com/sql/pricing?hl=ja), [Neon October2 announcement](https://neon.com/blog/neon-free-plan-1-gb-per-project), [Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

Pro starts $20/month; eligible already-paid spare capacity could avoid incremental base fee, UNVERIFIED. Hobby $0 restricts personal/noncommercial use; product eligibility not assumed. Neon accessible official October2 announcement: 1GB/project, 100CU-hours/project/month free, six-hour restore window. Account eligibility/network quota/region unknown; pricing/plans/regions pages returned access errors, no third-party price table relied upon. Short restore may fail owner recovery requirements.

KMS software one active version $0.06/month; 1,000 wrap/unwrap operations ×$0.03/10,000=$0.003, subtotal $0.063. Two retained versions $0.123. Disabled/scheduled destruction versions still billed. No Autokey free allowance assumed for manually approved token key. Secret Manager six versions/10,000 accesses free shared by billing account; if exhausted, one version +1,000 accesses example $0.063. No remaining free capacity assumed.

| Component | A staging | B isolated | C local HTTPS |
|---|---|---|---|
| One-time setup | Cloud/DB/IAM/trust labor unknown | Reuse qualification/app/DB/key/trust labor unknown | Laptop/tunnel/cookie/custody labor unknown |
| Compute | Tokyo Run SKU quote required; request-based min=0 candidate | Conditional incremental base $0 or Pro $20; usage/seats extra | Hardware sunk cost; electricity unknown |
| Database compute | 730 × approved Tokyo SQL hourly rate | $0 only eligible free quota; reused DB cost unknown | Local PG, persistent disk required |
| Storage | 10GiB × approved Tokyo SSD rate | Within1GB free example only; excess unknown | Encrypted disk/backup unknown |
| Network | Egress/connector/NAT unknown | DB/KMS cross-provider egress unknown | Tunnel/ISP unknown |
| Logging | Volume/retention unknown | Quotas/drains/add-ons unknown | Disk/edge logs + retention unknown |
| KMS | $0.063 example, no current suitable key | Same approved separate software key | Qualified provider needed, synthetic not real $0 custody |
| Secret management | Shared remaining allowances or $0.063 excess example | Host-scoped bindings inclusion unknown; optional managed secret | Secure injection/recovery unknown |
| Backup | 10GiB × approved Tokyo backup rate | Free six-hour restore may be insufficient; backup unknown | Off-machine encrypted recovery unknown |
| Domain/HTTPS | Existing nonprod host ownership/fees unknown | Existing approved subdomain may avoid registration; protection fees unknown | Stable named host/tunnel fees unknown |
| Cleanup | Labor + retained backup/key billing | Dedicated retirement + shared assets preserved | Shutdown + credential/log/backup inventory |
| Monthly total | UNKNOWN, fixed SQL likely dominates (inference) | Conditional hosting+DB+KMS base subtotal $0.063 or $20.063; NOT full total | UNKNOWN, lower cloud compute may increase supervision |

Cloud Run/SQL expose Iowa default tables with region selectors. Independently selected Tokyo SKU values not verified: neither default SQL $0.0105/h nor default Run rate is used as Tokyo quote. A formula: 730r_DB +10r_SSD +10r_backup +billed_Run +network +logs +$0.063 KMS +secrets +domain +labor. Scale-to-zero hosting cannot remove persistent DB charge. Excludes taxes/FX/HA/IPv4/build/registry/cross-region transfer/attacks/excess quota/operator effort/recovery/retention. Budget alerts not hard spending caps. Exact regional quote/account quotas owner-approved before purchase. B lowest conditional recurring-cost design candidate, not proven globally cheapest.
