"use server";

import { z } from "zod";

import { applyContractSignature } from "@/lib/contracts/sign";

export type SignContractState = {
  error?: string;
  message?: string;
};

const schema = z.object({
  token: z.string().min(20).max(200),
  typedName: z.string().trim().max(120),
  kind: z.enum(["typed", "drawn"]),
  image: z.string().max(180_000).optional().or(z.literal("")),
  consent: z.enum(["on", "true"]).optional(),
  decline: z.enum(["on", "true"]).optional(),
});

export async function signContractPublicAction(
  _prev: SignContractState,
  formData: FormData,
): Promise<SignContractState> {
  const parsed = schema.safeParse({
    token: String(formData.get("token") || ""),
    typedName: String(formData.get("typedName") || ""),
    kind: String(formData.get("kind") || "typed"),
    image: String(formData.get("image") || ""),
    consent: formData.get("consent") ? "on" : undefined,
    decline: formData.get("decline") ? "on" : undefined,
  });
  if (!parsed.success) return { error: "invalid" };
  const result = await applyContractSignature({
    token: parsed.data.token,
    typedName: parsed.data.typedName,
    kind: parsed.data.kind,
    image: parsed.data.image || null,
    consent: Boolean(parsed.data.consent),
    decline: Boolean(parsed.data.decline),
  });
  if (result.error) return { error: result.error };
  return { message: result.message };
}
