import { For, createSignal } from "solid-js"
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogConfirm } from "@/components/shell/dialog-confirm"
import { DialogCreateBranch } from "@/components/shell/dialog-create-branch"
import { DialogGitResult } from "@/components/shell/dialog-git-result"
import { DialogStash } from "@/components/shell/dialog-stash"
import { DialogSwitchBranch } from "@/components/shell/dialog-switch-branch"
import { gitActions, type GitBranch } from "@/components/shell/git-actions"
import { useLanguage } from "@/context/language"

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

  const act = async (title: string, successLabel: string, run: () => Promise<unknown>) => {
    try {
      await run()
      props.onRefresh()
      dialog.show(() => <DialogGitResult title={title} status="done" successLabel={successLabel} />)
    } catch (error) {
      dialog.show(() => (
        <DialogGitResult
          title={title}
          status="error"
          message={error instanceof Error ? error.message : String(error)}
        />
      ))
    }
  }

  const removeBranch = async (branch: GitBranch) => {
    try {
      await gitActions.deleteBranch(props.directory, branch.name)
      props.onRefresh()
      dialog.show(() => (
        <DialogGitResult
          title={language.t("shell.git.menu.delete")}
          status="done"
          successLabel={language.t("shell.git.deleteBranchSuccess")}
        />
      ))
    } catch {
      dialog.show(() => (
        <DialogConfirm
          title={language.t("shell.git.deleteBranchForce.title")}
          description={language.t("shell.git.deleteBranchForce.description", { name: branch.name })}
          confirmLabel={language.t("shell.git.deleteBranchForce.confirm")}
          onConfirm={() =>
            act(language.t("shell.git.menu.delete"), language.t("shell.git.deleteBranchSuccess"), () =>
              gitActions.deleteBranch(props.directory, branch.name, true),
            )
          }
        />
      ))
    }
  }

  const pullRemote = async () => {
    try {
      const result = await gitActions.pull(props.directory)
      props.onRefresh()
      if (result.conflicted) {
        dialog.show(() => (
          <DialogGitResult
            title={language.t("shell.git.menu.pull")}
            status="error"
            message={language.t("shell.git.pullConflict")}
          />
        ))
        return
      }
      dialog.show(() => (
        <DialogGitResult
          title={language.t("shell.git.menu.pull")}
          status="done"
          successLabel={language.t("shell.git.pullSuccess")}
        />
      ))
    } catch (error) {
      dialog.show(() => (
        <DialogGitResult
          title={language.t("shell.git.menu.pull")}
          status="error"
          message={error instanceof Error ? error.message : String(error)}
        />
      ))
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

          <MenuV2.Item onSelect={() => void pullRemote()}>
            <Icon name="outline-share" size="small" />
            <span class="min-w-0 flex-1 truncate">{language.t("shell.git.menu.pull")}</span>
          </MenuV2.Item>

          <MenuV2.Item
            onSelect={() =>
              dialog.show(() => <DialogStash directory={props.directory} onChanged={props.onRefresh} />)
            }
          >
            <Icon name="archive" size="small" />
            <span class="min-w-0 flex-1 truncate">{language.t("shell.git.menu.stash")}</span>
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
                    <MenuV2.Item onSelect={() => void removeBranch(branch)}>
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
