import { cn } from "@/lib/utils";

/** Stripe mark for integration UI. */
export function StripeLogo({
  className,
  title = "Stripe",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label={title}
      className={cn("size-10 shrink-0", className)}
    >
      <title>{title}</title>
      <rect width="48" height="48" rx="10" fill="#635BFF" />
      <path
        fill="#fff"
        transform="translate(12 12)"
        d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.515 6.104 1.556c-1.4 1.004-2.151 2.482-2.151 4.151 0 3.306 2.503 4.66 6.575 6.166 2.386.871 3.194 1.456 3.194 2.338 0 .945-.796 1.496-2.274 1.496-1.836 0-4.861-1.02-6.85-2.305l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-2.833 2.525-4.887 0-3.376-2.575-4.799-6.591-6.15z"
      />
    </svg>
  );
}
