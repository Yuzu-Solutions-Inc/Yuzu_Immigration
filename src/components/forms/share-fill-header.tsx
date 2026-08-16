import { getTranslations } from "next-intl/server";

export async function ShareFillHeader({
  projectTitle,
  expiresLabel,
}: {
  projectTitle: string;
  expiresLabel: string;
}) {
  const td = await getTranslations("documents");
  const tf = await getTranslations("forms");

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {td("clientEyebrow")}
      </p>
      <h1 className="font-heading text-2xl font-semibold text-brand sm:text-3xl">
        {projectTitle}
      </h1>
      <p className="text-sm text-muted-foreground">
        {tf("clientExpires", { date: expiresLabel })}
      </p>
    </div>
  );
}
