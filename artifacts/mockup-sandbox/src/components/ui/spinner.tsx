import { Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const { ref: _ref, ...svgProps } = props
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...svgProps}
    />
  )
}

export { Spinner }
