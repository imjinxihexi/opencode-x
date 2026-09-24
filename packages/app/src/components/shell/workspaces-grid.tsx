import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode-ai/ui/v2/dialog-v2"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { Field } from "@opencode-ai/ui/v2/field-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogConfirm } from "@/components/shell/dialog-confirm"
import type { Workspace } from "@/components/shell/workspaces"
import { useLanguage } from "@/context/language"

export function DialogRenameWorkspace(props: { name: string; onRename: (name: string) => void }) {
  const language = useLanguage()
  const dialog = useDialog()
  const [value, setValue] = createSignal(props.name)

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitle>{language.t("shell.workspace.rename.title")}</DialogTitle>
      </DialogHeader>
      <DialogBody class="flex w-full flex-col gap-4 px-4 pt-2 pb-1">
        <Field>
          <Field.Label>{language.t("shell.workspace.create.name")}</Field.Label>
          <TextInputV2
            autofocus
            class="!w-full"
            value={value()}
            onInput={(event) => setValue(event.currentTarget.value)}
          />
        </Field>
      </DialogBody>
      <DialogFooter>
        <ButtonV2 type="button" variant="neutral" onClick={dialog.close}>
          {language.t("common.cancel")}
        </ButtonV2>
        <ButtonV2
          type="button"
          variant="contrast"
          disabled={!value().trim()}
          onClick={() => {
            props.onRename(value().trim())
            dialog.close()
          }}
        >
          {language.t("common.save")}
        </ButtonV2>
      </DialogFooter>
    </Dialog>
  )
}

function WorkspaceMenu(props: {
  workspace: Workspace
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const language = useLanguage()
  const dialog = useDialog()

  return (
    <MenuV2 placement="bottom-end" gutter={4}>
      <MenuV2.Trigger
        class="flex size-6 shrink-0 items-center justify-center rounded-sm text-v2-icon-icon-muted opacity-0 transition-opacity hover:bg-v2-overlay-simple-overlay-hover focus-visible:opacity-100 group-hover:opacity-100 data-[expanded]:opacity-100 focus-visible:outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <Icon name="outline-dots" size="small" />
      </MenuV2.Trigger>
      <MenuV2.Portal>
        <MenuV2.Content class="w-[150px]">
          <MenuV2.Item
            onSelect={() =>
              dialog.show(() => (
                <DialogRenameWorkspace name={props.workspace.name} onRename={(name) => props.onRename(name)} />
              ))
            }
          >
            <Icon name="edit" size="small" />
            <span class="min-w-0 flex-1 truncate">{language.t("common.rename")}</span>
          </MenuV2.Item>
          <MenuV2.Item
            style={{ "--menu-v2-fg": "#f85149", "--menu-v2-icon": "#f85149" } as JSX.CSSProperties}
            onSelect={() =>
              dialog.show(() => (
                <DialogConfirm
                  title={language.t("shell.workspace.delete.title")}
                  description={language.t("shell.workspace.delete.description")}
                  confirmLabel={language.t("common.delete")}
                  onConfirm={props.onDelete}
                />
              ))
            }
          >
            <Icon name="trash" size="small" />
            <span class="min-w-0 flex-1 truncate">{language.t("common.delete")}</span>
          </MenuV2.Item>
        </MenuV2.Content>
      </MenuV2.Portal>
    </MenuV2>
  )
}

export function WorkspacesGrid(props: {
  workspaces: Workspace[]
  activeId?: string
  onEnter: (workspace: Workspace) => void
  onNewProject: (workspace: Workspace) => void
  onCreate: () => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onShowDetail: (workspace: Workspace) => void
}) {
  const language = useLanguage()
  const [query, setQuery] = createSignal("")

  const filtered = createMemo(() => {
    const term = query().trim().toLowerCase()
    const list = term ? props.workspaces.filter((item) => item.name.toLowerCase().includes(term)) : props.workspaces
    return list.toSorted((a, b) => b.createdAt - a.createdAt)
  })

  const formatDate = (value: number) => new Date(value).toLocaleDateString()

  return (
    <div class="flex h-full w-full flex-col overflow-hidden bg-v2-background-bg-deep">
      <div class="flex shrink-0 items-center gap-2 px-6 pt-5 pb-3">
        <div class="relative w-[260px] max-w-[60%]">
          <TextInputV2
            class="!w-full !pe-8"
            value={query()}
            placeholder={language.t("shell.workspace.grid.search")}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
          <Icon
            name="magnifying-glass"
            size="small"
            class="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-v2-icon-icon-muted"
          />
        </div>
        <ButtonV2 type="button" variant="contrast" onClick={props.onCreate}>
          <Icon name="plus" size="small" />
          {language.t("shell.workspace.grid.create")}
        </ButtonV2>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-6 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-v2-border-border-muted [&::-webkit-scrollbar-track]:bg-transparent">
        <Show
          when={filtered().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center gap-3 py-24 text-center">
              <Icon name="folder" class="h-9 w-9 text-v2-icon-icon-muted opacity-60" />
              <span class="text-[13px] leading-5 text-v2-text-text-muted">{language.t("shell.workspace.grid.empty")}</span>
            </div>
          }
        >
          <div class="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            <For each={filtered()}>
              {(workspace) => (
                <div
                  class="group flex min-h-[188px] flex-col gap-2.5 rounded-lg border-[0.5px] bg-v2-background-bg-base p-3 transition-colors"
                  classList={{
                    "border-v2-border-border-focus": props.activeId === workspace.id,
                    "border-v2-border-border-base": props.activeId !== workspace.id,
                  }}
                >
                  <div class="flex min-w-0 items-center gap-2">
                    <Icon name="workspace" size="small" class="shrink-0 text-v2-icon-icon-muted" />
                    <span class="min-w-0 flex-1 truncate text-[13px] font-[530] leading-5 text-v2-text-text-base">
                      {workspace.name}
                    </span>
                    <WorkspaceMenu
                      workspace={workspace}
                      onRename={(name) => props.onRename(workspace.id, name)}
                      onDelete={() => props.onDelete(workspace.id)}
                    />
                  </div>
                  <div
                    class="flex min-w-0 cursor-pointer flex-col gap-2.5"
                    onClick={() => props.onShowDetail(workspace)}
                    title={language.t("shell.workspace.detail.title")}
                  >
                    <div class="text-[12px] leading-4 text-v2-text-text-muted">{formatDate(workspace.createdAt)}</div>
                    <div class="flex min-w-0 items-center gap-1.5 text-[12px] leading-4 text-v2-text-text-muted">
                      <Icon name="branch" size="small" class="shrink-0" />
                      <span class="min-w-0 truncate">
                        {language.t("shell.workspace.grid.projects", { count: workspace.repos.length })}
                      </span>
                    </div>
                    <div class="flex flex-wrap gap-1">
                      <Show
                        when={workspace.repos.length > 0}
                        fallback={
                          <span class="text-[11px] leading-4 text-v2-text-text-faint">
                            {language.t("shell.workspace.grid.noRepo")}
                          </span>
                        }
                      >
                        <For each={workspace.repos.slice(0, 4)}>
                          {(repo) => (
                            <span class="min-w-0 max-w-[160px] truncate rounded-[3px] bg-v2-background-bg-layer-02 px-1.5 py-0.5 text-[11px] leading-4 text-v2-text-text-muted">
                              {repo.name}
                            </span>
                          )}
                        </For>
                      </Show>
                    </div>
                  </div>
                  <div class="mt-auto flex items-center gap-2 pt-1">
                    <ButtonV2
                      type="button"
                      variant="contrast"
                      class="!bg-none !bg-[#6366F1] !text-[#ffffff] !shadow-none transition-opacity hover:!opacity-90"
                      onClick={() => props.onEnter(workspace)}
                    >
                      <Icon name="play" size="small" />
                      {language.t("shell.workspace.grid.enter")}
                    </ButtonV2>
                    <ButtonV2 type="button" variant="neutral" onClick={() => props.onNewProject(workspace)}>
                      <Icon name="plus" size="small" />
                      {language.t("shell.workspace.grid.newProject")}
                    </ButtonV2>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  )
}
