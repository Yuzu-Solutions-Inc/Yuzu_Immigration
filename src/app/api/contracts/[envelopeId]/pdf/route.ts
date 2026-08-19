import { NextResponse } from "next/server";

import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership } from "@/lib/auth/session";
import { CONTRACT_ENVELOPES_BUCKET } from "@/lib/contracts/types";
import { decryptDocument } from "@/lib/documents/crypto";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ envelopeId: string }> },
) {
  const { envelopeId } = await context.params;
  const membership = await getPrimaryMembership();
  if (!membership || !canCreateRecords(membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const supabase = await createClient();
  const { data: envelope } = await supabase
    .from("contract_envelopes")
    .select("id, title, signed_pdf_storage_path, status")
    .eq("id", envelopeId)
    .eq("organization_id", membership.organization.id)
    .maybeSingle();
  if (!envelope?.signed_pdf_storage_path || envelope.status !== "completed") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const admin = createServiceClient();
  const { data, error } = await admin.storage
    .from(CONTRACT_ENVELOPES_BUCKET)
    .download(envelope.signed_pdf_storage_path);
  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const dek = await getOrgDataKey(membership.organization.id);
  const bytes = decryptDocument(Buffer.from(await data.arrayBuffer()), dek);
  const filename = `${String(envelope.title).replace(/[^\w.-]+/g, "_").slice(0, 60)}-signed.pdf`;
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
