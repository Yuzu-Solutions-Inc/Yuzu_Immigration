import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import {
  fieldControlVariants,
  type FieldDensity,
} from "@/lib/field-styles"
import { cn } from "@/lib/utils"

function Input({
  className,
  type,
  density = "default",
  ...props
}: React.ComponentProps<"input"> & { density?: FieldDensity }) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-density={density}
      className={cn(fieldControlVariants({ density, control: "input" }), className)}
      {...props}
    />
  )
}

export { Input }
