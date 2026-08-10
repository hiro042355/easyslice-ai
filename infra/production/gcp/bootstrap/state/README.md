# Production Terraform state bootstrap

This isolated root owns only the GCS bucket required by the Production
workload backend. The exact project ID and globally unique bucket candidate
must be externally validated before use. A conflict requires Owner Decision;
this root does not generate or select an alternate name.

The root declares only the Cloud Storage API required to own that bucket. It
does not create the project, link billing, or enable application APIs.

The bucket enforces uniform bucket-level access and public access prevention,
keeps object versions for recovery, disables force deletion, and has Terraform
deletion protection. Only the explicitly supplied state administrator and
recovery owner receive bucket-scoped object administration. If both duties are
temporarily held by the same approved Owner, the binding is deduplicated.

This bootstrap root intentionally has no remote backend because that backend
does not exist yet. Controlled local bootstrap state is sensitive operational
material: keep it outside Git, restrict access, back it up securely, and retain
it until the remote backend and recovery procedure are verified. No application
secret, static credential, local tfvars file, state file, or plan belongs in
the repository.

This implementation does not authorize project creation, bucket availability
reservation, billing linkage, planning against or reading Production, or
`terraform apply`. After a separately authorized bootstrap, initialize the
parent workload root against the existing bucket and review backend migration
as its own controlled operation.
