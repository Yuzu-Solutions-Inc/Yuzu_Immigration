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
    <div className="landing-stage relative mx-auto w-full max-w-xl px-2 pt-8 pb-10 lg:max-w-none lg:px-4 lg:pt-10 lg:pb-12">
      <div className="lp-stage-glow" />
      <div className="lp-stage-shots">
        <div className="lp-stage-main">
          <AppCalendarPreview />
        </div>
        <div className="lp-stage-card">
          <ClientPortalPreview />
        </div>
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
