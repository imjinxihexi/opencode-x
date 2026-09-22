import { For, Show, createMemo, createResource, createSignal, onCleanup, onMount } from "solid-js"
import { Dialog, DialogBody, DialogHeader, DialogTitle } from "@opencode-ai/ui/v2/dialog-v2"
import { Field } from "@opencode-ai/ui/v2/field-v2"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { getFilename } from "@opencode-ai/core/util/path"
import { createStore } from "solid-js/store"
import { DialogDirtySwitch } from "@/components/shell/dialog-dirty-switch"
import { DialogGitResult } from "@/components/shell/dialog-git-result"
import { DialogGitRun } from "@/components/shell/dialog-git-run"
import { gitActions, type GitBranch } from "@/components/shell/git-actions"
import { Spinner } from "@/components/shell/spinner"
import { useLanguage } from "@/context/language"
import { Persist, persisted } from "@/utils/persist"

export function DialogSwitchBranch(props: { directory: string; onSwitched: () => void }) {
  const language = useLanguage()
  const dialog = useDialog()
  const [query, setQuery] = createSignal("")
  const [open, setOpen] = createSignal(false)
  const [fetching, setFetching] = createSignal(false)
  const [tick, setTick] = createSignal(0)
  let wrap: HTMLDivElement | undefined

  const [favorites, setFavorites] = persisted(
    Persist.global("git-branch-favorites"),
    createStore<{ list: Record<string, string[]> }>({ list: {} }),
  )

  const [branches] = createResource(
    () => [props.directory, tick()] as const,
    async ([directory]) => gitActions.branches(directory).catch(() => [] as GitBranch[]),
    { initialValue: [] as GitBranch[] },
  )

  const [remotes] = createResource(
    () => [props.directory, tick()] as const,
    async ([directory]) => gitActions.remoteBranches(directory).catch(() => [] as string[]),
    { initialValue: [] as string[] },
  )

  const remoteList = createMemo(() => {
    const term = query().trim().toLowerCase()
    const list = remotes()
    return (term ? list.filter((name) => name.toLowerCase().includes(term)) : list).toSorted((a, b) =>
      a.localeCompare(b),
    )
  })

  const favNames = () => favorites.list[props.directory] ?? []
  const toggleFavorite = (name: string) => {
    const current = favNames()
    const next = current.includes(name) ? current.filter((item) => item !== name) : [...current, name]
    setFavorites("list", props.directory, next)
  }

  const filtered = createMemo(() => {
    const term = query().trim().toLowerCase()
    if (!term) return branches()
    return branches().filter((branch) => branch.name.toLowerCase().includes(term))
  })

  const sortBranches = (list: GitBranch[]) =>
    list.toSorted((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1
      return a.name.localeCompare(b.name)
    })

  const favoriteList = createMemo(() => sortBranches(filtered().filter((branch) => favNames().includes(branch.name))))
  const otherList = createMemo(() => sortBranches(filtered().filter((branch) => !favNames().includes(branch.name))))

  const openList = () => setOpen(true)

  onMount(() => {
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (wrap?.contains(target)) return
      if ((target as HTMLElement).closest?.("[data-branch-list]")) return
      setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    onCleanup(() => document.removeEventListener("mousedown", onDown))
  })

  const checkout = (branch: string, stashFirst: boolean) => {
    dialog.show(() => (
      <DialogGitRun
        title={language.t("shell.git.switch.title", { repo: getFilename(props.directory) })}
        runningLabel={language.t("shell.git.switch.switching")}
        successLabel={language.t("shell.git.switch.success")}
        run={async () => {
          try {
            if (stashFirst) await gitActions.stash(props.directory)
            await gitActions.switchBranch(props.directory, branch)
            const actual = await gitActions.currentBranch(props.directory).catch(() => "")
            if (actual && actual !== branch) {
              throw new Error(language.t("shell.git.switch.verifyFailed", { branch, actual }))
            }
          } finally {
            props.onSwitched()
          }
        }}
      />
    ))
  }

  const switchTo = async (branch: GitBranch) => {
    if (branch.current) {
      dialog.close()
      return
    }
    const dirty = await gitActions.hasChanges(props.directory).catch(() => false)
    if (dirty) {
      dialog.show(() => (
        <DialogDirtySwitch
          branch={branch.name}
          onContinue={() => void checkout(branch.name, false)}
          onStash={() => void checkout(branch.name, true)}
        />
      ))
      return
    }
    void checkout(branch.name, false)
  }

  const copy = (name: string) => {
    void navigator.clipboard?.writeText(name)
  }

  const fetchRemotes = async () => {
    setFetching(true)
    try {
      await gitActions.fetch(props.directory)
      setTick((value) => value + 1)
    } catch (error) {
      dialog.show(() => (
        <DialogGitResult
          title={language.t("shell.git.actionFailed")}
          status="error"
          message={error instanceof Error ? error.message : String(error)}
        />
      ))
    } finally {
      setFetching(false)
    }
  }

  const RemoteRow = (rowProps: { name: string }) => (
    <div
      class="mx-2 flex min-w-0 cursor-pointer items-center gap-2 rounded-md ps-3 pe-3 py-1.5 hover:bg-v2-overlay-simple-overlay-hover"
      onClick={() => void switchTo({ name: rowProps.name.replace(/^[^/]+\//, ""), current: false })}
      title={rowProps.name}
    >
      <span class="min-w-0 flex-1 truncate text-[13px] leading-5 text-v2-text-text-base">{rowProps.name}</span>
      <button
        type="button"
        class="flex size-6 shrink-0 items-center justify-center rounded-sm text-[16px] leading-none hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
        classList={{
          "text-[#d29922]": favNames().includes(rowProps.name),
          "text-v2-icon-icon-muted": !favNames().includes(rowProps.name),
        }}
        title={language.t("shell.git.switch.favorite")}
        onClick={(event) => {
          event.stopPropagation()
          toggleFavorite(rowProps.name)
        }}
      >
        {favNames().includes(rowProps.name) ? "★" : "☆"}
      </button>
      <button
        type="button"
        class="flex size-6 shrink-0 items-center justify-center rounded-sm text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
        title={language.t("shell.git.switch.copy")}
        onClick={(event) => {
          event.stopPropagation()
          copy(rowProps.name)
        }}
      >
        <Icon name="outline-copy" size="small" />
      </button>
    </div>
  )

  const Row = (rowProps: { branch: GitBranch }) => (
    <div
      class="mx-2 flex min-w-0 cursor-pointer items-center gap-2 rounded-md ps-3 pe-3 py-1.5 hover:bg-v2-overlay-simple-overlay-hover"
      classList={{ "bg-[#F0F3FF]": rowProps.branch.current }}
      onClick={() => void switchTo(rowProps.branch)}
      title={rowProps.branch.name}
    >
      <span class="min-w-0 flex-1 truncate text-[13px] leading-5 text-v2-text-text-base">{rowProps.branch.name}</span>
      <Show when={rowProps.branch.current}>
        <span class="shrink-0 rounded-[3px] border-[0.5px] border-v2-border-border-base px-1 text-[10px] leading-4 text-v2-text-text-muted">
          {language.t("shell.git.switch.current")}
        </span>
      </Show>
      <button
        type="button"
        class="flex size-6 shrink-0 items-center justify-center rounded-sm text-[16px] leading-none hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
        classList={{
          "text-[#d29922]": favNames().includes(rowProps.branch.name),
          "text-v2-icon-icon-muted": !favNames().includes(rowProps.branch.name),
        }}
        title={language.t("shell.git.switch.favorite")}
        onClick={(event) => {
          event.stopPropagation()
          toggleFavorite(rowProps.branch.name)
        }}
      >
        {favNames().includes(rowProps.branch.name) ? "★" : "☆"}
      </button>
      <button
        type="button"
        class="flex size-6 shrink-0 items-center justify-center rounded-sm text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
        title={language.t("shell.git.switch.copy")}
        onClick={(event) => {
          event.stopPropagation()
          copy(rowProps.branch.name)
        }}
      >
        <Icon name="outline-copy" size="small" />
      </button>
    </div>
  )

  return (
    <Dialog fit containerClass="!w-[660px] !max-w-[calc(100vw-32px)]">
      <DialogHeader>
        <DialogTitle>{language.t("shell.git.switch.title", { repo: getFilename(props.directory) })}</DialogTitle>
      </DialogHeader>
      <DialogBody class="flex w-full flex-col gap-3 px-4 pt-4 pb-4">
        <Field>
          <Field.Label>{language.t("shell.git.switch.target")}</Field.Label>
          <div class="relative w-full" ref={(element) => (wrap = element)}>
            <TextInputV2
              class="!w-full !pe-8"
              value={query()}
              placeholder={language.t("shell.git.switch.search")}
              onInput={(event) => setQuery(event.currentTarget.value)}
              onFocus={openList}
              onClick={openList}
            />
            <Icon
              name="magnifying-glass"
              size="small"
              class="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-v2-icon-icon-muted"
            />
          </div>
        </Field>
        <Show when={open()}>
          <div
            data-branch-list
            class="flex max-h-[320px] w-full flex-col overflow-y-auto rounded-md border-[0.5px] border-v2-border-border-base bg-v2-background-bg-base py-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-v2-border-border-muted [&::-webkit-scrollbar-track]:bg-transparent"
          >
            <Show
              when={!branches.loading}
              fallback={
                <div class="flex items-center gap-2 px-2 py-3 text-[12px] text-v2-text-text-muted">
                  <Spinner />
                  {language.t("common.loading")}
                </div>
              }
            >
              <Show when={favoriteList().length > 0}>
                <div class="mb-1 px-2 py-1 text-[10px] font-[530] uppercase leading-4 tracking-[0.08px] text-[rgba(0,0,0,0.45)]">
                  {language.t("shell.git.switch.favorites")}
                </div>
                <For each={favoriteList()}>{(branch) => <Row branch={branch} />}</For>
              </Show>
              <div class="mb-1 px-2 py-1 text-[10px] font-[530] uppercase leading-4 tracking-[0.08px] text-[rgba(0,0,0,0.45)]">
                {language.t("shell.git.switch.others")}
              </div>
              <For each={otherList()}>{(branch) => <Row branch={branch} />}</For>
              <div class="mb-1 flex items-center gap-2 px-2 py-1">
                <span class="text-[10px] font-[530] uppercase leading-4 tracking-[0.08px] text-[rgba(0,0,0,0.45)]">
                  {language.t("shell.git.switch.remote")}
                </span>
                <button
                  type="button"
                  class="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none disabled:opacity-40"
                  disabled={fetching()}
                  onClick={() => void fetchRemotes()}
                >
                  <Show when={fetching()} fallback={<Icon name="cloud" size="small" />}>
                    <Spinner />
                  </Show>
                  {language.t("shell.git.switch.fetch")}
                </button>
              </div>
              <Show
                when={remoteList().length > 0}
                fallback={
                  <div class="px-2 py-2 text-[12px] text-v2-text-text-muted">
                    {language.t("shell.git.switch.noRemote")}
                  </div>
                }
              >
                <For each={remoteList()}>{(name) => <RemoteRow name={name} />}</For>
              </Show>
              <div class="mt-1 border-t-[0.5px] border-v2-border-border-muted py-1.5 text-center text-[12px] text-v2-text-text-muted">
                {language.t("shell.git.switch.total", { count: branches().length })}
              </div>
            </Show>
          </div>
        </Show>
      </DialogBody>
    </Dialog>
  )
}
