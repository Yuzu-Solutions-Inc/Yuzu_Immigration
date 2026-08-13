import { NextResponse } from "next/server";

import { requireOrganizationId } from "@/lib/crm/queries";
import { getSessionUser } from "@/lib/auth/session";
import { buildProjectFileZip } from "@/lib/privacy/export-project-file";
import { recordAuditEvent } from "@/lib/security/audit";

export const maxDuration = 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ locale: string; id: string }> },
) {
  const { id } = await context.params;
  const orgId = await requireOrganizationId();
  if (!orgId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await buildProjectFileZip(id);
    if ("error" in result) {
      const status = result.error === "unauthorized" ? 401 : 404;
      return NextResponse.json({ error: result.error }, { status });
    }

    const user = await getSessionUser();
    await recordAuditEvent({
      organizationId: orgId,
      actorUserId: user?.id,
      actorKind: "staff",
      action: "project.export_file",
      resourceType: "immigration_project",
      resourceId: id,
      metadata: {
        personCount: result.personCount,
        documentCount: result.documentCount,
        formPdfCount: result.formPdfCount,
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
    console.error("file-export:", error);
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }
}
