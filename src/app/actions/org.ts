"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { slugifyOrganizationName } from "@/lib/org/slug";

const createOrgSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .min(2)
    .max(48)
    .optional(),
  locale: z.enum(["en", "fr", "es"]).default("en"),
});

export type CreateOrgState = {
  error?: string;
};

export async function createOrganizationAction(
  _prev: CreateOrgState,
  formData: FormData,
): Promise<CreateOrgState> {
  const name = String(formData.get("name") ?? "");
  const slugInput = String(formData.get("slug") ?? "").trim();
  const locale = (formData.get("locale") as string) || "en";

  const parsed = createOrgSchema.safeParse({
    name,
    slug: slugInput || slugifyOrganizationName(name) || undefined,
    locale,
  });

  if (!parsed.success) {
    return { error: "invalid_org" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  const { data, error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug ?? slugifyOrganizationName(parsed.data.name),
  });

  if (error) {
    console.error("create_organization rpc:", error.message, error.code);
    if (
      error.message.toLowerCase().includes("duplicate") ||
      error.code === "23505"
    ) {
      return { error: "slug_taken" };
    }
    return { error: "create_failed" };
  }

  if (!data) {
    return { error: "create_failed" };
  }

  redirect(`/${locale}/home`);
}
