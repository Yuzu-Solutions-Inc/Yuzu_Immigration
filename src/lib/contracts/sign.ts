import { headers } from "next/headers";

import { hashBookingToken } from "@/lib/booking/token";
import {
  CONTRACT_CONSENT_VERSION,
  MAX_SIGNATURE_IMAGE_CHARS,
  type ContractEnvelopeRow,
  type ContractSignerRow,
} from "@/lib/contracts/types";
import { decryptContractFilledHtml } from "@/lib/security/client-pii";
import {
  decryptContractSignerRow,
  encryptContractSignatureWrite,
} from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  appendContractAudit,
  completeEnvelopeIfReady,
  namesMatch,
  notifyNextSigner,
} from "@/lib/contracts/issue";

export async function requestClientMeta() {
  try {
    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      null;
    const userAgent = h.get("user-agent");
    return { ip, userAgent };
  } catch {
    return { ip: null as string | null, userAgent: null as string | null };
  }
}

export type PublicSignPayload = {
  envelopeId: string;
  signerId: string;
  role: "client" | "consultant";
  title: string;
  organizationName: string;
  filledHtml: string;
  filledSha256: string;
  locale: string;
  expiresAt: string;
  signerName: string;
  signerEmail: string;
  waitingOnPrevious: boolean;
  alreadySigned: boolean;
  declined: boolean;
  expired: boolean;
  voided: boolean;
  completed: boolean;
};

function expireIfNeeded(
  envelope: { id: string; organization_id: string; status: string; expires_at: string },
) {
  if (
    ["completed", "voided", "declined", "expired"].includes(envelope.status)
  ) {
    return envelope.status === "expired";
  }
  if (new Date(envelope.expires_at).getTime() > Date.now()) return false;
  return true;
}

export async function loadPublicSignPayload(
  token: string,
): Promise<PublicSignPayload | null> {
  const admin = createServiceClient();
  const tokenHash = hashBookingToken(token);
  const { data: signerRow, error } = await admin
    .from("contract_signers")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) {
    console.error("load sign token:", error.message);
    return null;
  }
  if (!signerRow) return null;

  const { data: envelope } = await admin
    .from("contract_envelopes")
    .select("*")
    .eq("id", signerRow.envelope_id)
    .maybeSingle();
  if (!envelope) return null;

  const dek = await getOrgDataKey(envelope.organization_id as string);
  const signer = decryptContractSignerRow(signerRow, dek);
  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", envelope.organization_id)
    .maybeSingle();
  const { data: allSigners } = await admin
    .from("contract_signers")
    .select("id, role, sort_order, status")
    .eq("envelope_id", envelope.id)
    .order("sort_order", { ascending: true });

  const expired = expireIfNeeded(envelope);
  if (expired && envelope.status !== "expired") {
    await admin
      .from("contract_envelopes")
      .update({
        status: "expired",
        updated_at: new Date().toISOString(),
      })
      .eq("id", envelope.id);
    await appendContractAudit({
      organizationId: envelope.organization_id as string,
      envelopeId: envelope.id as string,
      eventType: "expired",
    });
  }

  const waitingOnPrevious = (allSigners ?? []).some(
    (row) =>
      row.sort_order < signerRow.sort_order && row.status !== "signed",
  );

  if (
    !expired &&
    signerRow.status === "pending" &&
    !waitingOnPrevious &&
    !["voided", "declined", "completed"].includes(envelope.status)
  ) {
    const now = new Date().toISOString();
    await admin
      .from("contract_signers")
      .update({
        status: "viewed",
        viewed_at: signerRow.viewed_at ?? now,
        updated_at: now,
      })
      .eq("id", signerRow.id)
      .eq("status", "pending");
    if (envelope.status === "sent") {
      await admin
        .from("contract_envelopes")
        .update({ status: "viewed", updated_at: now })
        .eq("id", envelope.id)
        .eq("status", "sent");
    }
    await appendContractAudit({
      organizationId: envelope.organization_id as string,
      envelopeId: envelope.id as string,
      signerId: signerRow.id as string,
      eventType: "viewed",
      ...(await requestClientMeta()),
    });
  }

  return {
    envelopeId: envelope.id as string,
    signerId: signerRow.id as string,
    role: signerRow.role as "client" | "consultant",
    title: envelope.title as string,
    organizationName: org?.name ?? "Yuzu Immigration",
    filledHtml: decryptContractFilledHtml(envelope.filled_html as string, dek),
    filledSha256: envelope.filled_sha256 as string,
    locale: envelope.locale as string,
    expiresAt: envelope.expires_at as string,
    signerName: signer.full_name ?? "",
    signerEmail: signer.email ?? "",
    waitingOnPrevious,
    alreadySigned: signerRow.status === "signed",
    declined: signerRow.status === "declined" || envelope.status === "declined",
    expired: expired || envelope.status === "expired",
    voided: envelope.status === "voided",
    completed: envelope.status === "completed",
  };
}

function validDrawnSignature(image: string | null | undefined) {
  if (!image) return false;
  if (!image.startsWith("data:image/png;base64,")) return false;
  if (image.length > MAX_SIGNATURE_IMAGE_CHARS) return false;
  return true;
}

export async function applyContractSignature(input: {
  token?: string;
  envelopeId?: string;
  signerId?: string;
  typedName: string;
  kind: "typed" | "drawn";
  image?: string | null;
  consent: boolean;
  decline?: boolean;
}) {
  const admin = createServiceClient();
  let signerRow: Record<string, unknown> | null = null;

  if (input.token) {
    const { data } = await admin
      .from("contract_signers")
      .select("*")
      .eq("token_hash", hashBookingToken(input.token))
      .maybeSingle();
    signerRow = data;
  } else if (input.signerId && input.envelopeId) {
    const { data } = await admin
      .from("contract_signers")
      .select("*")
      .eq("id", input.signerId)
      .eq("envelope_id", input.envelopeId)
      .maybeSingle();
    signerRow = data;
  }
  if (!signerRow) return { error: "not_found" as const };

  const { data: envelope } = await admin
    .from("contract_envelopes")
    .select("*")
    .eq("id", signerRow.envelope_id as string)
    .maybeSingle();
  if (!envelope) return { error: "not_found" as const };
  if (["voided", "expired", "declined", "completed"].includes(envelope.status as string)) {
    return { error: "closed" as const };
  }
  if (new Date(envelope.expires_at as string).getTime() <= Date.now()) {
    return { error: "expired" as const };
  }
  if (signerRow.status === "signed") return { error: "already_signed" as const };

  const { data: allSigners } = await admin
    .from("contract_signers")
    .select("id, sort_order, status")
    .eq("envelope_id", envelope.id);
  const waiting = (allSigners ?? []).some(
    (row) =>
      (row.sort_order as number) < (signerRow!.sort_order as number) &&
      row.status !== "signed",
  );
  if (waiting) return { error: "waiting" as const };

  const dek = await getOrgDataKey(envelope.organization_id as string);
  const signer = decryptContractSignerRow(
    signerRow as unknown as ContractSignerRow,
    dek,
  );
  const meta = await requestClientMeta();
  const now = new Date().toISOString();

  if (input.decline) {
    await admin
      .from("contract_signers")
      .update({
        status: "declined",
        declined_at: now,
        updated_at: now,
        ip: meta.ip,
        user_agent: meta.userAgent,
      })
      .eq("id", signerRow.id as string);
    await admin
      .from("contract_envelopes")
      .update({ status: "declined", declined_at: now, updated_at: now })
      .eq("id", envelope.id);
    await appendContractAudit({
      organizationId: envelope.organization_id as string,
      envelopeId: envelope.id as string,
      signerId: signerRow.id as string,
      eventType: "declined",
      ...meta,
    });
    return { message: "declined" as const };
  }

  if (!input.consent) return { error: "consent_required" as const };
  const typedName = input.typedName.trim();
  if (typedName.length < 2) return { error: "name_required" as const };
  if (!namesMatch(typedName, signer.full_name ?? "")) {
    return { error: "name_mismatch" as const };
  }
  if (input.kind === "drawn" && !validDrawnSignature(input.image)) {
    return { error: "invalid_signature" as const };
  }

  const sealed = encryptContractSignatureWrite(
    {
      signature_text: typedName,
      signature_image: input.kind === "drawn" ? input.image : null,
    },
    dek,
  );

  await admin
    .from("contract_signers")
    .update({
      status: "signed",
      signed_at: now,
      signature_kind: input.kind,
      signature_text: sealed.signature_text,
      signature_image: sealed.signature_image,
      consent_accepted_at: now,
      consent_version: CONTRACT_CONSENT_VERSION,
      ip: meta.ip,
      user_agent: meta.userAgent,
      updated_at: now,
    })
    .eq("id", signerRow.id as string);

  const remaining = (allSigners ?? []).filter(
    (row) => row.id !== signerRow!.id && row.status !== "signed",
  ).length;
  await admin
    .from("contract_envelopes")
    .update({
      status: remaining > 0 ? "partially_signed" : "partially_signed",
      updated_at: now,
    })
    .eq("id", envelope.id);

  await appendContractAudit({
    organizationId: envelope.organization_id as string,
    envelopeId: envelope.id as string,
    signerId: signerRow.id as string,
    eventType: "signed",
    ...meta,
    metadata: { kind: input.kind, consent: CONTRACT_CONSENT_VERSION },
  });

  if (remaining > 0) {
    await notifyNextSigner(envelope.id as string);
    return { message: "signed" as const };
  }

  await completeEnvelopeIfReady(envelope.id as string);
  return { message: "completed" as const };
}

export type { ContractEnvelopeRow };
