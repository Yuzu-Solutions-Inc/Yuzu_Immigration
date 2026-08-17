/** Current Firm DPA text version. Bump when the addendum substance changes. */
export const FIRM_DPA_VERSION = "2026-08-16";

export function formAcceptedFirmDpa(formData: FormData) {
  return (
    formData.get("dpaAccepted") === "on" &&
    formData.get("dpaAuthority") === "on"
  );
}

export function firmDpaAcceptanceColumns(userId: string, at = new Date()) {
  return {
    dpa_accepted_at: at.toISOString(),
    dpa_version: FIRM_DPA_VERSION,
    dpa_accepted_by: userId,
  };
}

export function hasCurrentFirmDpa(input: {
  dpaAcceptedAt?: string | null;
  dpaVersion?: string | null;
}) {
  return Boolean(
    input.dpaAcceptedAt && input.dpaVersion === FIRM_DPA_VERSION,
  );
}
