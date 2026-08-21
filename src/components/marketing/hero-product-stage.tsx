import {
  AppCalendarPreview,
  ClientPortalPreview,
} from "@/components/marketing/product-previews";

export async function HeroProductStage({
  chips,
}: {
  chips: readonly { key: string; label: string }[];
}) {
  return (
    <div className="landing-stage relative mx-auto w-full max-w-xl pt-4 pb-6 lg:max-w-none lg:pt-8">
      <div className="lp-stage-glow" />
      <div className="lp-stage-main">
        <AppCalendarPreview />
      </div>
      <div className="lp-stage-card">
        <ClientPortalPreview />
      </div>
      <ul className="lp-stage-chips">
        {chips.map((chip, index) => (
          <li
            key={chip.key}
            className={`lp-stage-chip lp-stage-chip-${index + 1}`}
          >
            {chip.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
