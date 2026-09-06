'use client'

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
      {message}
    </div>
  )
}
