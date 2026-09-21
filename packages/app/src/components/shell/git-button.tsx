import { Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { Spinner } from "@/components/shell/spinner"

export function GitButton(props: {
  icon?: string
  label?: string
  loading?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      class="flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-sm border-[0.5px] border-v2-border-border-muted px-2 text-[12px] font-[440] text-v2-text-text-base transition-opacity hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
      disabled={props.disabled || props.loading}
      onClick={props.onClick}
    >
      <Show when={props.loading} fallback={props.icon ? <Icon name={props.icon} size="small" class="shrink-0" /> : null}>
        <Spinner />
      </Show>
      <span class="truncate">{props.label}</span>
    </button>
  )
}
