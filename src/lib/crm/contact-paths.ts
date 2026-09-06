import { revalidatePath } from "next/cache";

export function partnerDetailPath(partnerId: string) {
  return `/partners/${partnerId}`;
}

export function partnerEditPath(partnerId: string) {
  return `/partners/${partnerId}/edit`;
}

export function contactHref(row: { partner_id?: string | null; id: string }) {
  return partnerDetailPath(row.partner_id || row.id);
}

export function revalidateContactPaths(
  locale: string,
  partnerId?: string | null,
) {
  revalidatePath(`/${locale}/partners`);
  if (partnerId) {
    revalidatePath(`/${locale}/partners/${partnerId}`);
    revalidatePath(`/${locale}/partners/${partnerId}/edit`);
  }
  revalidatePath(`/${locale}/home`);
  revalidatePath(`/${locale}/projects`);
}
