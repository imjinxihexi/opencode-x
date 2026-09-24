import { Show, onMount } from "solid-js"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode-ai/ui/v2/dialog-v2"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Spinner } from "@/components/shell/spinner"
import { useLanguage } from "@/context/language"

export function DialogGitResult(props: {
  title: string
  status: "running" | "done" | "error"
  successLabel?: string
  message?: string
}) {
  const language = useLanguage()
  const dialog = useDialog()

  onMount(() => {
    if (props.status === "done") setTimeout(() => dialog.close(), 600)
  })

  const label = () =>
    props.status === "running"
      ? language.t("shell.git.running")
      : props.status === "done"
        ? (props.successLabel ?? language.t("shell.git.commitSuccess"))
        : language.t("shell.git.actionFailed")

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitle>{props.title}</DialogTitle>
      </DialogHeader>
      <DialogBody class="flex w-full flex-1 flex-col justify-center gap-3 px-4 py-3">
        <div class="flex items-center justify-center gap-2 text-[13px] leading-5 text-v2-text-text-base">
          <Show when={props.status === "running"}>
            <Spinner />
          </Show>
          <Show when={props.status === "done"}>
            <Icon name="check" size="small" class="text-[#3fb950]" />
          </Show>
          <Show when={props.status === "error"}>
            <Icon name="warning" size="small" class="text-[#f85149]" />
          </Show>
          <span classList={{ "text-[#f85149]": props.status === "error" }}>{label()}</span>
        </div>
        <Show when={props.status === "error" && props.message}>
          <div class="max-h-40 overflow-auto rounded-md bg-v2-background-bg-layer-02 p-2 font-mono text-[11px] leading-4 text-[#f85149]">
            {props.message}
          </div>
        </Show>
      </DialogBody>
      <Show when={props.status === "error"}>
        <DialogFooter>
          <ButtonV2 type="button" variant="contrast" onClick={dialog.close}>
            {language.t("common.close")}
          </ButtonV2>
        </DialogFooter>
      </Show>
    </Dialog>
  )
}
