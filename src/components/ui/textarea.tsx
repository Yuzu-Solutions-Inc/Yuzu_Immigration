import * as React from "react"

import {
  fieldControlVariants,
  type FieldDensity,
} from "@/lib/field-styles"
import { cn } from "@/lib/utils"

function Textarea({
  className,
  density = "default",
  ...props
}: React.ComponentProps<"textarea"> & { density?: FieldDensity }) {
  return (
    <textarea
      data-slot="textarea"
      data-density={density}
      className={cn(
        fieldControlVariants({ density, control: "textarea" }),
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
