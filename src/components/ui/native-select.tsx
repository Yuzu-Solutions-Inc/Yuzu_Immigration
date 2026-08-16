import type { ComponentProps } from "react";

import {
  fieldControlVariants,
  type FieldDensity,
} from "@/lib/field-styles";
import { cn } from "@/lib/utils";

export function NativeSelect({
  className,
  density = "default",
  ...props
}: ComponentProps<"select"> & { density?: FieldDensity }) {
  return (
    <select
      data-slot="native-select"
      data-density={density}
      className={cn(fieldControlVariants({ density, control: "select" }), className)}
      {...props}
    />
  );
}
