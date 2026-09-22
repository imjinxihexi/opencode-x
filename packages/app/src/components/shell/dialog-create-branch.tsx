import { createEffect, createMemo, createResource, createSignal, Show } from "solid-js"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode-ai/ui/v2/dialog-v2"
import { Field } from "@opencode-ai/ui/v2/field-v2"
import { SelectV2 } from "@opencode-ai/ui/v2/select-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogGitResult } from "@/components/shell/dialog-git-result"
import { gitActions, type GitBranch } from "@/components/shell/git-actions"
import { Spinner } from "@/components/shell/spinner"
import { useLanguage } from "@/context/language"

type CreateMode = "remote" | "local"

export function DialogCreateBranch(props: { directory: string; onCreated: () => void }) {
  const language = useLanguage()
  const dialog = useDialog()
  const [mode, setMode] = createSignal<CreateMode>("remote")
  const [source, setSource] = createSignal<string>()
  const [name, setName] = createSignal("")
  const [busy, setBusy] = createSignal(false)

  const [branches] = createResource(
    () => props.directory,
    async (directory) => gitActions.branches(directory).catch(() => [] as GitBranch[]),
    { initialValue: [] as GitBranch[] },
  )

  const names = createMemo(() => branches().map((branch) => branch.name))
  const currentBranch = createMemo(() => branches().find((branch) => branch.current)?.name)
  const selectedSource = createMemo(() => source() ?? currentBranch())

  createEffect(() => {
    if (source()) return
    const current = currentBranch()
    if (current) setSource(current)
  })

  const create = async () => {
    const branchName = name().trim()
    const base = selectedSource()
    if (!branchName) return
    setBusy(true)
    try {
      if (mode() === "remote" && base) {
        await gitActions.fetch(props.directory)
        await gitActions.createBranch(props.directory, branchName, `origin/${base}`)
      } else {
        await gitActions.createBranch(props.directory, branchName, base)
      }
      props.onCreated()
      dialog.close()
    } catch (error) {
      dialog.show(() => (
        <DialogGitResult
          title={language.t("shell.git.actionFailed")}
          status="error"
          message={error instanceof Error ? error.message : String(error)}
        />
      ))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitle>{language.t("shell.git.newBranch.title")}</DialogTitle>
      </DialogHeader>
      <DialogBody class="flex w-full flex-col gap-4 px-4 pt-4 pb-1">
        <div class="flex w-full flex-col gap-2">
          <div class="select-none text-[13px] font-[530] leading-none tracking-[-0.04px] text-v2-text-text-base">
            {language.t("shell.git.newBranch.method")}
          </div>
          <div class="flex gap-1 rounded-md bg-v2-background-bg-layer-02 p-1">
            <ModeButton
              active={mode() === "remote"}
              label={language.t("shell.git.newBranch.fromRemote")}
              onClick={() => setMode("remote")}
            />
            <ModeButton
              active={mode() === "local"}
              label={language.t("shell.git.newBranch.fromLocal")}
              onClick={() => setMode("local")}
            />
          </div>
        </div>

        <Field>
          <Field.Label>{language.t("shell.git.newBranch.source")}</Field.Label>
          <SelectV2
            class="!w-full"
            options={names()}
            current={selectedSource()}
            value={(value) => value}
            label={(value) => value}
            onSelect={(value) => {
              if (value) setSource(value)
            }}
          />
        </Field>

        <Field>
          <Field.Label>{language.t("shell.git.newBranch.name")}</Field.Label>
          <TextInputV2
            autofocus
            appearance="large"
            class="!w-full"
            value={name()}
            placeholder={language.t("shell.git.newBranch.namePlaceholder")}
            onInput={(event) => setName(event.currentTarget.value)}
          />
        </Field>
      </DialogBody>
      <DialogFooter>
        <ButtonV2 type="button" variant="neutral" disabled={busy()} onClick={dialog.close}>
          {language.t("common.cancel")}
        </ButtonV2>
        <ButtonV2
          type="button"
          variant="contrast"
          disabled={busy() || !name().trim()}
          onClick={() => void create()}
        >
          <Show when={busy()}>
            <Spinner class="!text-[#ffffff]" />
          </Show>
          {language.t("shell.git.newBranch.create")}
        </ButtonV2>
      </DialogFooter>
    </Dialog>
  )
}

function ModeButton(props: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      class="flex h-7 flex-1 items-center justify-center rounded-sm px-2 text-[13px] font-[440] leading-5 tracking-[-0.04px] transition-colors focus-visible:outline-none"
      classList={{
        "bg-v2-background-bg-base text-v2-text-text-base shadow-[var(--v2-elevation-button-neutral)]": props.active,
        "text-v2-text-text-muted hover:text-v2-text-text-base": !props.active,
      }}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  )
}
