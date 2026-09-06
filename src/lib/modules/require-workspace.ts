import { requireModule } from "@/lib/modules/require-module";

export async function requireImmigrationWorkspace(locale: string) {
  return requireModule(locale, "immigration");
}

export async function requireBookingsWorkspace(locale: string) {
  return requireModule(locale, "bookings");
}

export async function requireServicesWorkspace(locale: string) {
  return requireModule(locale, "services");
}
