import { Show, createSignal, onMount } from "solid-js"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode-ai/ui/v2/dialog-v2"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Spinner } from "@/components/shell/spinner"
import { useLanguage } from "@/context/language"

export function DialogGitRun(props: {
  title: string
  runningLabel?: string
  successLabel?: string
  run: () => Promise<unknown>
  onSettled?: () => void
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const [status, setStatus] = createSignal<"running" | "done" | "error">("running")
  const [message, setMessage] = createSignal("")

  onMount(() => {
    void props
      .run()
      .then(
        (result) => {
          if (result === "conflict") {
            dialog.close()
            return
          }
          setStatus("done")
          setTimeout(() => dialog.close(), 600)
        },
        (error) => {
          setStatus("error")
          setMessage(error instanceof Error ? error.message : String(error))
        },
      )
      .finally(() => props.onSettled?.())
  })

  const label = () =>
    status() === "running"
      ? (props.runningLabel ?? language.t("shell.git.running"))
      : status() === "done"
        ? (props.successLabel ?? language.t("shell.git.commitSuccess"))
        : language.t("shell.git.actionFailed")

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitle>{props.title}</DialogTitle>
      </DialogHeader>
      <DialogBody class="flex w-full flex-1 flex-col justify-center gap-3 px-4 py-3">
        <div class="flex items-center justify-center gap-2 text-[13px] leading-5 text-v2-text-text-base">
          <Show when={status() === "running"}>
            <Spinner />
          </Show>
          <Show when={status() === "done"}>
            <Icon name="check" size="small" class="text-[#3fb950]" />
          </Show>
          <Show when={status() === "error"}>
            <Icon name="warning" size="small" class="text-[#f85149]" />
          </Show>
          <span classList={{ "text-[#f85149]": status() === "error" }}>{label()}</span>
        </div>
        <Show when={status() === "error"}>
          <div class="max-h-40 overflow-auto rounded-md bg-v2-background-bg-layer-02 p-2 font-mono text-[11px] leading-4 text-[#f85149]">
            {message()}
          </div>
        </Show>
      </DialogBody>
      <Show when={status() === "error"}>
        <DialogFooter>
          <ButtonV2 type="button" variant="contrast" onClick={dialog.close}>
            {language.t("common.close")}
          </ButtonV2>
        </DialogFooter>
      </Show>
    </Dialog>
  )
}
