import { For, Show, createSignal } from "solid-js"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode-ai/ui/v2/dialog-v2"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { TextareaV2 } from "@opencode-ai/ui/v2/textarea-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogConfirm } from "@/components/shell/dialog-confirm"
import { DialogRenameWorkspace } from "@/components/shell/workspaces-grid"
import type { Workspace } from "@/components/shell/workspaces"
import { useLanguage } from "@/context/language"

export function DialogWorkspaceDetail(props: {
  workspace: Workspace
  onRename: (id: string, name: string) => void
  onRemoveRepo: (id: string, directory: string) => void
  onPromptChange: (id: string, prompt: string | undefined) => void
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const [prompt, setPrompt] = createSignal(props.workspace.prompt ?? "")

  const savePrompt = () => {
    const value = prompt().trim()
    if ((props.workspace.prompt ?? "") === (value || undefined)) return
    props.onPromptChange(props.workspace.id, value || undefined)
  }

  const removeRepo = (directory: string) => {
    dialog.show(() => (
      <DialogConfirm
        title={language.t("shell.workspace.removeRepo.title")}
        description={language.t("shell.workspace.removeRepo.description")}
        confirmLabel={language.t("common.delete")}
        onConfirm={() => props.onRemoveRepo(props.workspace.id, directory)}
      />
    ))
  }

  const save = () => {
    savePrompt()
    dialog.close()
  }

  return (
    <Dialog fit containerClass="!w-[640px] !max-w-[calc(100vw-32px)]">
      <DialogHeader>
        <DialogTitle>{language.t("shell.workspace.detail.title")}</DialogTitle>
      </DialogHeader>
      <DialogBody class="flex w-full flex-col gap-4 overflow-y-auto px-4 pt-2 pb-2 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-v2-border-border-muted">
        <div class="flex min-w-0 items-center gap-2">
          <span class="min-w-0 flex-1 truncate text-[15px] font-[530] leading-5 text-v2-text-text-base">
            {props.workspace.name}
          </span>
          <button
            type="button"
            class="flex size-6 shrink-0 items-center justify-center rounded-sm text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:outline-none"
            title={language.t("common.rename")}
            onClick={() =>
              dialog.push(() => (
                <DialogRenameWorkspace
                  name={props.workspace.name}
                  onRename={(name) => props.onRename(props.workspace.id, name)}
                />
              ))
            }
          >
            <Icon name="edit" size="small" />
          </button>
        </div>
        <div class="text-[12px] leading-4 text-v2-text-text-muted">
          {language.t("shell.workspace.grid.projects", { count: props.workspace.repos.length })}
          {" · "}
          {language.t("shell.workspace.detail.created", {
            date: new Date(props.workspace.createdAt).toLocaleDateString(),
          })}
        </div>
        <div class="flex flex-col gap-1.5">
          <span class="text-[12px] font-[530] leading-5 text-v2-text-text-base">
            {language.t("shell.workspace.create.prompt")}
          </span>
          <TextareaV2
            class="!w-full"
            rows={7}
            value={prompt()}
            placeholder={language.t("shell.workspace.create.promptPlaceholder")}
            onInput={(event) => setPrompt(event.currentTarget.value)}
          />
        </div>
        <div class="flex flex-col">
          <Show
            when={props.workspace.repos.length > 0}
            fallback={
              <div class="py-4 text-center text-[12px] text-v2-text-text-muted">
                {language.t("shell.workspace.grid.noRepo")}
              </div>
            }
          >
            <For each={props.workspace.repos}>
              {(repo) => (
                <div class="flex min-w-0 items-center gap-2.5 border-b-[0.5px] border-v2-border-border-muted py-2 last:border-b-0">
                  <div class="flex size-8 shrink-0 items-center justify-center rounded-md bg-v2-background-bg-layer-02">
                    <Icon name="folder" size="small" class="text-v2-icon-icon-muted" />
                  </div>
                  <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span class="min-w-0 truncate text-[13px] leading-5 text-v2-text-text-base">{repo.name}</span>
                    <div class="flex min-w-0 items-center gap-1 text-[11px] leading-4 text-v2-text-text-faint">
                      <Icon name="branch" size="small" class="shrink-0" />
                      <span class="min-w-0 truncate">{repo.branch ?? "—"}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="flex size-6 shrink-0 items-center justify-center rounded-sm text-[#f85149] transition-colors hover:bg-[#f851491a] focus-visible:outline-none"
                    title={language.t("common.delete")}
                    onClick={() => removeRepo(repo.directory)}
                  >
                    <Icon name="trash" size="small" />
                  </button>
                </div>
              )}
            </For>
          </Show>
        </div>
      </DialogBody>
      <DialogFooter>
        <ButtonV2 type="button" variant="neutral" onClick={dialog.close}>
          {language.t("common.cancel")}
        </ButtonV2>
        <ButtonV2 type="button" variant="contrast" onClick={save}>
          <Icon name="check" size="small" />
          {language.t("common.save")}
        </ButtonV2>
      </DialogFooter>
    </Dialog>
  )
}
