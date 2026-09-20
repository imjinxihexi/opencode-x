import { For, createSignal } from "solid-js"
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogCreateBranch } from "@/components/shell/dialog-create-branch"
import { DialogSwitchBranch } from "@/components/shell/dialog-switch-branch"
import { gitActions, type GitBranch } from "@/components/shell/git-actions"
import { useLanguage } from "@/context/language"
import { showToast } from "@/utils/toast"

export function RepoMenu(props: { directory: string; onRefresh: () => void }) {
  const language = useLanguage()
  const dialog = useDialog()
  const [branches, setBranches] = createSignal<GitBranch[]>([])
  const [loading, setLoading] = createSignal(false)

  const loadBranches = async () => {
    setLoading(true)
    try {
      setBranches(await gitActions.branches(props.directory))
    } catch {
      setBranches([])
    } finally {
      setLoading(false)
    }
  }

  const act = async (run: () => Promise<unknown>) => {
    try {
      await run()
      props.onRefresh()
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("shell.git.actionFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <MenuV2
      placement="bottom-end"
      gutter={4}
      onOpenChange={(open) => {
        if (open) void loadBranches()
      }}
    >
      <MenuV2.Trigger
        class="flex size-6 shrink-0 items-center justify-center rounded-sm text-v2-icon-icon-muted opacity-0 transition-opacity hover:bg-v2-overlay-simple-overlay-hover focus-visible:opacity-100 group-hover:opacity-100 data-[expanded]:opacity-100 focus-visible:outline-none"
        onClick={(event: MouseEvent) => event.stopPropagation()}
      >
        <Icon name="outline-dots" size="small" />
      </MenuV2.Trigger>
      <MenuV2.Portal>
        <MenuV2.Content class="w-[180px]">
          <MenuV2.Item
            onSelect={() =>
              dialog.show(() => <DialogSwitchBranch directory={props.directory} onSwitched={props.onRefresh} />)
            }
          >
            <Icon name="branch" size="small" />
            <span class="min-w-0 flex-1 truncate">{language.t("shell.git.menu.switch")}</span>
          </MenuV2.Item>

          <MenuV2.Item
            onSelect={() =>
              dialog.show(() => <DialogCreateBranch directory={props.directory} onCreated={props.onRefresh} />)
            }
          >
            <Icon name="plus" size="small" />
            <span class="min-w-0 flex-1 truncate">{language.t("shell.git.menu.newBranch")}</span>
          </MenuV2.Item>

          <MenuV2.Item onSelect={() => void act(() => gitActions.pull(props.directory))}>
            <Icon name="outline-share" size="small" />
            <span class="min-w-0 flex-1 truncate">{language.t("shell.git.menu.pull")}</span>
          </MenuV2.Item>

          <MenuV2.Item onSelect={() => props.onRefresh()}>
            <Icon name="reset" size="small" />
            <span class="min-w-0 flex-1 truncate">{language.t("shell.git.menu.refresh")}</span>
          </MenuV2.Item>

          <MenuV2.Separator />

          <MenuV2.Sub gutter={0} overlap overflowPadding={8}>
            <MenuV2.SubTrigger>
              <Icon name="archive" size="small" />
              <span class="min-w-0 flex-1 truncate">{language.t("shell.git.menu.delete")}</span>
            </MenuV2.SubTrigger>
            <MenuV2.Portal>
              <MenuV2.SubContent class="max-w-[260px]">
                <For each={branches().filter((branch) => !branch.current)}>
                  {(branch) => (
                    <MenuV2.Item
                      onSelect={() => void act(() => gitActions.deleteBranch(props.directory, branch.name))}
                    >
                      <Icon name="branch" size="small" />
                      <span class="min-w-0 flex-1 truncate">{branch.name}</span>
                    </MenuV2.Item>
                  )}
                </For>
              </MenuV2.SubContent>
            </MenuV2.Portal>
          </MenuV2.Sub>
        </MenuV2.Content>
      </MenuV2.Portal>
    </MenuV2>
  )
}
