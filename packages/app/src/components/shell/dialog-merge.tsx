import { createEffect, createMemo, createResource, createSignal } from "solid-js"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode-ai/ui/v2/dialog-v2"
import { Field } from "@opencode-ai/ui/v2/field-v2"
import { SelectV2 } from "@opencode-ai/ui/v2/select-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { gitActions, type GitBranch } from "@/components/shell/git-actions"
import { useLanguage } from "@/context/language"
import { showToast } from "@/utils/toast"

export function DialogMerge(props: { directory: string; onMerged: () => void }) {
  const language = useLanguage()
  const dialog = useDialog()
  const [source, setSource] = createSignal<string>()
  const [busy, setBusy] = createSignal(false)

  const [branches] = createResource(
    () => props.directory,
    async (directory) => gitActions.branches(directory).catch(() => [] as GitBranch[]),
    { initialValue: [] as GitBranch[] },
  )

  const current = createMemo(() => branches().find((branch) => branch.current)?.name)
  const options = createMemo(() => branches().map((branch) => branch.name).filter((name) => name !== current()))

  const confirm = async () => {
    const from = source()
    const target = current()
    if (!from || !target || from === target) return
    setBusy(true)
    try {
      if (await gitActions.hasChanges(props.directory)) {
        showToast({ variant: "error", title: language.t("shell.git.actionFailed"), description: language.t("shell.git.merge.dirty") })
        return
      }
      const verified = await gitActions.currentBranch(props.directory)
      if (verified !== target) {
        showToast({ variant: "error", title: language.t("shell.git.actionFailed"), description: language.t("shell.git.merge.checkoutFailed") })
        return
      }
      await gitActions.merge(props.directory, from)
      props.onMerged()
      dialog.close()
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("shell.git.actionFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitle>{language.t("shell.git.merge.title")}</DialogTitle>
      </DialogHeader>
      <DialogBody class="flex w-full flex-col gap-4 px-4 pt-4 pb-1">
        <div class="rounded-md bg-v2-background-bg-layer-02 px-3 py-2 text-[12px] leading-5 text-v2-text-text-muted">
          {language.t("shell.git.merge.hint", { target: current() ?? "" })}
        </div>
        <Field>
          <Field.Label>{language.t("shell.git.merge.source")}</Field.Label>
          <SelectV2
            class="!w-full"
            options={options()}
            current={source()}
            placeholder={language.t("shell.git.merge.pickSource")}
            value={(value) => value}
            label={(value) => value}
            onSelect={(value) => {
              if (value) setSource(value)
            }}
          />
        </Field>
        <Field>
          <Field.Label>{language.t("shell.git.merge.target")}</Field.Label>
          <div class="flex h-9 w-full items-center justify-between rounded-md border-[0.5px] border-v2-border-border-base bg-v2-background-bg-layer-02 px-3 text-[13px] text-v2-text-text-base">
            <span class="min-w-0 truncate">{current() ?? "—"}</span>
            <span class="shrink-0 rounded-[3px] border-[0.5px] border-v2-border-border-base px-1 text-[10px] text-v2-text-text-muted">
              {language.t("shell.git.switch.current")}
            </span>
          </div>
        </Field>
      </DialogBody>
      <DialogFooter>
        <ButtonV2 type="button" variant="neutral" disabled={busy()} onClick={dialog.close}>
          {language.t("common.cancel")}
        </ButtonV2>
        <ButtonV2
          type="button"
          variant="contrast"
          disabled={busy() || !source() || source() === current()}
          onClick={() => void confirm()}
        >
          {language.t("shell.git.merge.confirm")}
        </ButtonV2>
      </DialogFooter>
    </Dialog>
  )
}
