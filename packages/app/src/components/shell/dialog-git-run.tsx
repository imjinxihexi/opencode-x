import { For, Show, createSignal, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode-ai/ui/v2/dialog-v2"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Spinner } from "@/components/shell/spinner"
import { useLanguage } from "@/context/language"

export type GitRunStep = {
  label: string
  /** Returns the git command output to show under the step, if any */
  run: () => Promise<unknown>
}

type StepState = "pending" | "running" | "done" | "error"

export function DialogGitRun(props: {
  title: string
  runningLabel?: string
  successLabel?: string
  /** Ordered steps shown with their own status and git output */
  steps?: GitRunStep[]
  /** Work to run after the steps (or instead of them when no steps) */
  run?: () => Promise<unknown>
  onSettled?: () => void
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const [status, setStatus] = createSignal<"running" | "done" | "error">("running")
  const [message, setMessage] = createSignal("")
  const [stepList, setStepList] = createStore(
    (props.steps ?? []).map((step) => ({ label: step.label, state: "pending" as StepState, output: "" })),
  )

  onMount(() => {
    void (async () => {
      const steps = props.steps
      if (steps) {
        for (let index = 0; index < steps.length; index++) {
          setStepList(index, "state", "running")
          try {
            const output = await steps[index].run()
            setStepList(index, "state", "done")
            const text = typeof output === "string" ? output.trim() : ""
            if (text) setStepList(index, "output", text)
          } catch (error) {
            setStepList(index, "state", "error")
            throw error
          }
        }
      }
      if (props.run) {
        const result = await props.run()
        if (result === "conflict") {
          dialog.close()
          return "conflict"
        }
      }
      return undefined
    })().then(
      (result) => {
        if (result === "conflict") return
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
        <Show when={props.steps && props.steps.length > 0}>
          <div class="flex flex-col gap-2">
            <For each={stepList}>
              {(step) => (
                <div class="flex flex-col gap-1">
                  <div class="flex items-center gap-2 text-[13px] leading-5">
                    <Show when={step.state === "pending"}>
                      <span class="size-1.5 shrink-0 rounded-full bg-v2-text-text-faint" />
                    </Show>
                    <Show when={step.state === "running"}>
                      <Spinner />
                    </Show>
                    <Show when={step.state === "done"}>
                      <Icon name="check" size="small" class="shrink-0 text-[#3fb950]" />
                    </Show>
                    <Show when={step.state === "error"}>
                      <Icon name="warning" size="small" class="shrink-0 text-[#f85149]" />
                    </Show>
                    <span class="min-w-0 truncate" classList={{ "text-[#f85149]": step.state === "error" }}>
                      {step.label}
                    </span>
                  </div>
                  <Show when={step.output}>
                    <pre class="max-h-24 overflow-auto rounded-md bg-v2-background-bg-layer-02 p-2 font-mono text-[11px] leading-4 whitespace-pre-wrap text-v2-text-text-muted">
                      {step.output}
                    </pre>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
        <Show when={status() === "error" || !props.steps || props.steps.length === 0}>
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
        </Show>
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
