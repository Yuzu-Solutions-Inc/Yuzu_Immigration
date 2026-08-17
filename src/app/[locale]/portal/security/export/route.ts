import { NextResponse } from "next/server";

import { getPortalSession } from "@/lib/portal/auth";
import { buildPortalHouseholdExport } from "@/lib/privacy/export-portal-household";
import { recordAuditEvent } from "@/lib/security/audit";

export const maxDuration = 60;

export async function GET() {
  const session = await getPortalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await buildPortalHouseholdExport({
      organizationId: session.organizationId,
      personId: session.personId,
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    await recordAuditEvent({
      organizationId: session.organizationId,
      actorKind: "portal",
      action: "portal.export_household",
      resourceType: "person",
      resourceId: session.personId,
      metadata: {
        personCount: result.personCount,
        projectCount: result.projectCount,
        documentCount: result.documentCount,
      },
    });

    const filename = result.filename.replace(/[^\w.\-]+/g, "_");
    return new NextResponse(Buffer.from(result.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("portal household export:", error);
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }
}
