import { LoaderV2 } from "@opencode-ai/ui/v2/loader-v2"

export function Spinner(props: { class?: string }) {
  return <LoaderV2 class={`shrink-0 ${props.class ?? ""}`} width={14} height={14} />
}
