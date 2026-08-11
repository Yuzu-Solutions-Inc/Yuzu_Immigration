/** Principal client email comes from `people.email`, not the questionnaire. */

type DbClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

/** Inject principal person email into questionnaire answers when known. */
export function withPrincipalEmail(
  answers: Record<string, unknown>,
  email: string | null | undefined,
): Record<string, unknown> {
  const value = String(email ?? "").trim();
  if (!value) return answers;
  return { ...answers, email: value };
}

/** Active principal's `people.email` for a project (staff or service client). */
export async function fetchPrincipalEmail(
  client: DbClient,
  projectId: string,
): Promise<string | null> {
  const { data: link } = await client
    .from("project_participants")
    .select("person_id")
    .eq("project_id", projectId)
    .eq("role", "principal")
    .is("left_at", null)
    .maybeSingle();

  const personId = link?.person_id as string | undefined;
  if (!personId) return null;

  const { data: person } = await client
    .from("people")
    .select("email")
    .eq("id", personId)
    .maybeSingle();

  const email = String(person?.email ?? "").trim();
  return email || null;
}
