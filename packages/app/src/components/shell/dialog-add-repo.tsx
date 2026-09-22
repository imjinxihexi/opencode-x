import { createSignal } from "solid-js"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode-ai/ui/v2/dialog-v2"
import { Field } from "@opencode-ai/ui/v2/field-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogGitResult } from "@/components/shell/dialog-git-result"
import { gitActions } from "@/components/shell/git-actions"
import type { WorkspaceRepo } from "@/components/shell/workspaces"
import { useLanguage } from "@/context/language"

function nameFromUrl(url: string) {
  const cleaned = url.trim().replace(/\.git$/, "").replace(/\/+$/, "")
  const segment = cleaned.split(/[/:]/).pop() ?? ""
  return segment.replace(/[^a-zA-Z0-9._-]/g, "-")
}

export function DialogAddRepo(props: { workspaceName: string; onAdded: (repo: WorkspaceRepo) => void }) {
  const language = useLanguage()
  const dialog = useDialog()
  const [url, setUrl] = createSignal("")
  const [name, setName] = createSignal("")
  const [branch, setBranch] = createSignal("")
  const [busy, setBusy] = createSignal(false)

  const submit = async () => {
    const remote = url().trim()
    const repoName = (name().trim() || nameFromUrl(remote)).trim()
    if (!remote || !repoName) return
    setBusy(true)
    try {
      const directory = await gitActions.clone(remote, props.workspaceName, repoName, branch().trim() || undefined)
      if (!directory) throw new Error(language.t("shell.workspace.addRepo.failed"))
      props.onAdded({ directory, name: repoName, remote, branch: branch().trim() || undefined })
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
        <DialogTitle>{language.t("shell.workspace.addRepo.title")}</DialogTitle>
      </DialogHeader>
      <DialogBody class="flex w-full flex-col gap-4 px-4 pt-4 pb-1">
        <div class="rounded-md bg-v2-background-bg-layer-02 px-3 py-2 text-[12px] leading-5 text-v2-text-text-muted">
          {language.t("shell.workspace.addRepo.into", { workspace: props.workspaceName })}
        </div>
        <Field>
          <Field.Label>{language.t("shell.workspace.addRepo.url")}</Field.Label>
          <TextInputV2
            autofocus
            appearance="large"
            class="!w-full"
            value={url()}
            placeholder="https://gitlab.example.com/group/project.git"
            onInput={(event) => setUrl(event.currentTarget.value)}
          />
          <Field.Prefix>{language.t("shell.workspace.addRepo.urlHint")}</Field.Prefix>
        </Field>
        <div class="grid grid-cols-2 gap-3">
          <Field>
            <Field.Label>{language.t("shell.workspace.addRepo.name")}</Field.Label>
            <TextInputV2
              class="!w-full"
              value={name()}
              placeholder={nameFromUrl(url()) || "my-project"}
              onInput={(event) => setName(event.currentTarget.value)}
            />
          </Field>
          <Field>
            <Field.Label>{language.t("shell.workspace.addRepo.branch")}</Field.Label>
            <TextInputV2
              class="!w-full"
              value={branch()}
              placeholder={language.t("shell.workspace.addRepo.branchPlaceholder")}
              onInput={(event) => setBranch(event.currentTarget.value)}
            />
          </Field>
        </div>
        <div class="text-[11px] leading-4 text-v2-text-text-muted">{language.t("shell.workspace.addRepo.nameHint")}</div>
      </DialogBody>
      <DialogFooter>
        <ButtonV2 type="button" variant="neutral" disabled={busy()} onClick={dialog.close}>
          {language.t("common.cancel")}
        </ButtonV2>
        <ButtonV2 type="button" variant="contrast" disabled={busy() || !url().trim()} onClick={() => void submit()}>
          {language.t("shell.workspace.addRepo.submit")}
        </ButtonV2>
      </DialogFooter>
    </Dialog>
  )
}
