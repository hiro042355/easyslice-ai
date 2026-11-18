import { NextResponse } from "next/server";
import { createDurableMediaOwnershipRepository } from "@/lib/server/durableMediaOwnership";
import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";
import { withProductionMediaRuntime } from "@/lib/server/productionMediaRuntime/composition";
import {withRequestMediaWorkspace} from '@/lib/server/requestMediaWorkspace';
import {downloadRequestMedia,readBoundedMediaOutput} from '@/lib/server/requestMediaIo';

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ exportId: string }> },
) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.ok) return authentication.response;
  const { exportId } = await context.params;
  const ownerUid = authentication.context.identity.userId;

  try {
    return await withProductionMediaRuntime(async ({ pool, bucket }) => {
      const repository = createDurableMediaOwnershipRepository(pool);
      const exported = await repository.resolveOwnedExport(exportId, ownerUid);
      if (!exported) {
        return NextResponse.json({ error: "resource-not-found" }, { status: 404 });
      }
      const signal=AbortSignal.any([request.signal,AbortSignal.timeout(120000)]);
      return withRequestMediaWorkspace(async workspace=>{
      await downloadRequestMedia(bucket.file(exported.storageKey).createReadStream(),workspace.file('export.mp4'),signal,256*1024*1024);
      await workspace.assertRegular('export.mp4');
      const bytes=await readBoundedMediaOutput(workspace.file('export.mp4'));
      return new Response(Uint8Array.from(bytes).buffer, {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Disposition": "attachment; filename=nexcut-export.mp4",
          "Content-Type": "video/mp4",
        },
      });
      },signal);
    });
  } catch {
    return NextResponse.json({ error: "export-read-failed" }, { status: 500 });
  }
}
