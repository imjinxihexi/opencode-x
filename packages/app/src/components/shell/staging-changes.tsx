import { For, Show, createEffect, createMemo, createResource, createSignal } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogConfirm } from "@/components/shell/dialog-confirm"
import { DialogGitResult } from "@/components/shell/dialog-git-result"
import { Spinner } from "@/components/shell/spinner"
import { gitActions, type GitFileStatus } from "@/components/shell/git-actions"
import { useLanguage } from "@/context/language"

type Tone = "add" | "del" | "mod"
type StageItem = { file: string; letter: string; tone: Tone }
type Selection = { file: string; staged: boolean }
type TreeDir = { name: string; path: string; dirs: Map<string, TreeDir>; files: StageItem[] }

export type GitTone = Tone

export function toneOf(code: string): Tone {
  if (code === "?" || code === "A") return "add"
  if (code === "D") return "del"
  return "mod"
}

function toItems(list: GitFileStatus[], side: "index" | "worktree"): StageItem[] {
  return list
    .filter((entry) => (side === "index" ? entry.index !== " " && entry.index !== "?" : entry.worktree !== " " || entry.untracked))
    .map((entry) => {
      const code = side === "index" ? entry.index : entry.untracked ? "?" : entry.worktree
      return { file: entry.file, letter: entry.untracked ? "A" : code, tone: toneOf(code) }
    })
    .toSorted((a, b) => a.file.localeCompare(b.file))
}

function buildTree(items: StageItem[]): TreeDir {
  const root: TreeDir = { name: "", path: "", dirs: new Map(), files: [] }
  for (const item of items) {
    const parts = item.file.split("/")
    let node = root
    for (let index = 0; index < parts.length - 1; index++) {
      const name = parts[index]!
      let next = node.dirs.get(name)
      if (!next) {
        next = { name, path: node.path ? `${node.path}/${name}` : name, dirs: new Map(), files: [] }
        node.dirs.set(name, next)
      }
      node = next
    }
    node.files.push(item)
  }
  return root
}

/* Git status colors: added/deleted follow the pierre trees palette (light scheme);
   modified keeps the amber tone. */
export function toneColor(tone: Tone) {
  return tone === "add" ? "bg-[#16a994]" : tone === "del" ? "bg-[#ff2e3f]" : "bg-[#FFAB00]"
}

// Filled status badge (colored square + white glyph), matching the legacy web app.
// The pencil is an inline path: the shared "edit" icon draws its own frame,
// which looks muddy inside a filled square.
function ToneBadge(props: { tone: Tone }) {
  return (
    <span class={`flex size-3.5 shrink-0 items-center justify-center rounded-[3px] text-[#ffffff] ${toneColor(props.tone)}`}>
      <Show
        when={props.tone !== "add"}
        fallback={<Icon name="plus" size="small" class="[stroke-width:2.5]" />}
      >
        <Show
          when={props.tone !== "del"}
          fallback={<Icon name="outline-minus" size="small" class="[stroke-width:2.5]" />}
        >
          <svg
            viewBox="0 0 16 16"
            class="size-2"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M11.1 2.6a1.7 1.7 0 0 1 2.4 2.4L6 12.5l-3 .7.7-3 7.4-7.6Z" />
          </svg>
        </Show>
      </Show>
    </span>
  )
}

export function toneTextColor(tone: Tone) {
  return tone === "add" ? "text-[#16a994]" : tone === "del" ? "text-[#ff2e3f]" : "text-[#FFAB00]"
}

export function splitHunks(patch: string) {
  const lines = patch.split("\n")
  const header: string[] = []
  const hunks: string[][] = []
  let current: string[] | null = null
  for (const line of lines) {
    if (line.startsWith("@@")) {
      if (current) hunks.push(current)
      current = [line]
    } else if (current) {
      current.push(line)
    } else {
      header.push(line)
    }
  }
  if (current) hunks.push(current)
  return { header, hunks }
}

export type UnifiedRow = { left?: number; right?: number; text: string; kind: "ctx" | "add" | "del" }
export type SplitRow = { left?: UnifiedRow; right?: UnifiedRow }

export function parseHunkHeader(line: string) {
  const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line ?? "")
  return { left: match ? Number(match[1]) : 1, right: match ? Number(match[2]) : 1 }
}

export function toUnified(hunk: string[]): UnifiedRow[] {
  const { left, right } = parseHunkHeader(hunk[0] ?? "")
  let l = left
  let r = right
  const rows: UnifiedRow[] = []
  for (const text of hunk.slice(1)) {
    if (text.startsWith("+")) rows.push({ right: r++, text, kind: "add" })
    else if (text.startsWith("-")) rows.push({ left: l++, text, kind: "del" })
    else rows.push({ left: l++, right: r++, text, kind: "ctx" })
  }
  return rows
}

export function toSplit(hunk: string[]): SplitRow[] {
  const { left, right } = parseHunkHeader(hunk[0] ?? "")
  let l = left
  let r = right
  const rows: SplitRow[] = []
  let dels: UnifiedRow[] = []
  let adds: UnifiedRow[] = []
  const flush = () => {
    const count = Math.max(dels.length, adds.length)
    for (let index = 0; index < count; index++) rows.push({ left: dels[index], right: adds[index] })
    dels = []
    adds = []
  }
  for (const text of hunk.slice(1)) {
    if (text.startsWith("+")) {
      adds.push({ right: r++, text: text.slice(1), kind: "add" })
      continue
    }
    if (text.startsWith("-")) {
      dels.push({ left: l++, text: text.slice(1), kind: "del" })
      continue
    }
    flush()
    rows.push({
      left: { left: l++, text: text.slice(1), kind: "ctx" },
      right: { right: r++, text: text.slice(1), kind: "ctx" },
    })
  }
  flush()
  return rows
}

export function rowClass(kind: UnifiedRow["kind"]) {
  if (kind === "add") return "text-[#3fb950] bg-[#3fb9501a]"
  if (kind === "del") return "text-[#f85149] bg-[#f851491a]"
  return "text-v2-text-text-base"
}

export function StagingChanges(props: {
  directory?: string
  refresh?: number
  revision: number
  onCount?: (count: number) => void
  onTotal?: (count: number) => void
  conflicts: string[]
  activeFile?: string
  view?: "flat" | "tree"
  onOpenDiff?: (target: { directory: string; file: string; staged: boolean }) => void
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const [busy, setBusy] = createSignal(false)
  const [pending, setPending] = createSignal<string>()
  const [rev, setRev] = createSignal(0)
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>({})
  // Right-click menu on a change row: item + viewport position.
  const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number; item: StageItem }>()
  const copyPath = (item: StageItem) => void navigator.clipboard.writeText(item.file)

  const isCollapsed = (path: string) => Boolean(collapsed()[path])
  const toggleDir = (path: string) => setCollapsed((prev) => ({ ...prev, [path]: !prev[path] }))

  // Rendered from a reconciled store so the periodic refresh only re-renders
  // rows whose status actually changed.
  const [statusStore, setStatusStore] = createStore<{ items: GitFileStatus[] }>({ items: [] })
  const [status] = createResource(
    () => [props.directory, props.refresh, props.revision, rev()] as const,
    async ([directory]) => {
      const items = directory ? await gitActions.status(directory).catch(() => [] as GitFileStatus[]) : []
      if (directory === props.directory) {
        setStatusStore("items", reconcile(items, { key: "file" }))
      }
      return { directory: directory ?? "", items }
    },
  )

  const items = createMemo(() => {
    const value = status()
    if (!value || value.directory !== (props.directory ?? "")) return [] as GitFileStatus[]
    return statusStore.items
  })

  const staged = createMemo(() => toItems(items(), "index"))
  const unstaged = createMemo(() => toItems(items(), "worktree"))

  createEffect(() => props.onCount?.(staged().length))
  createEffect(() => props.onTotal?.(staged().length + unstaged().length))

  const act = async (key: string, run: () => Promise<unknown>) => {
    setPending(key)
    setBusy(true)
    try {
      await run()
      setRev((value) => value + 1)
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
      setPending(undefined)
    }
  }

  const toggleFile = (item: StageItem, isStaged: boolean) => {
    const directory = props.directory
    if (!directory) return
    void act("file", () =>
      isStaged ? gitActions.unstageFile(directory, item.file) : gitActions.stageFile(directory, item.file),
    )
  }

  const discardFile = (item: StageItem) => {
    const directory = props.directory
    if (!directory) return
    dialog.show(() => (
      <DialogConfirm
        title={language.t("shell.git.discardFile.title")}
        description={language.t("shell.git.discardConfirm.description")}
        confirmLabel={language.t("shell.git.discard")}
        onConfirm={() => void act("discard", () => gitActions.discardFile(directory, item.file))}
      />
    ))
  }

  const openDiff = (item: StageItem, isStaged: boolean) => {
    const directory = props.directory
    if (!directory) return
    props.onOpenDiff?.({ directory, file: item.file, staged: isStaged })
  }

  return (
    <div class="flex max-h-[40vh] flex-col gap-2 overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-v2-border-border-muted [&::-webkit-scrollbar-track]:bg-transparent">
      <Show when={staged().length > 0}>
        <div class="flex flex-col">
          <div class="flex items-center gap-1 px-1">
            <span class="flex-1 text-[11px] font-[530] uppercase leading-4 tracking-[0.05px] text-v2-text-text-muted">
              {language.t("shell.git.staged")} · {staged().length}
            </span>
            <button
              type="button"
              class="flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:outline-none disabled:opacity-40"
              disabled={busy() || !props.directory}
              onClick={() =>
                void act("unstageAll", () =>
                  gitActions.unstageAll(props.directory!, staged().map((item) => item.file)),
                )
              }
            >
              <Show when={pending() === "unstageAll"}>
                <Spinner />
              </Show>
              {language.t("shell.git.unstageAll")}
            </button>
          </div>
          <Show
            when={props.view === "tree"}
            fallback={
              <FileList
                items={staged()}
                actionLabel={language.t("shell.git.unstage")}
                busy={busy()}
                selected={props.activeFile ? { file: props.activeFile, staged: true } : undefined}
                staged={true}
                onSelect={(item) => openDiff(item, true)}
                onAction={(item) => toggleFile(item, true)}
                conflicts={props.conflicts}
                onContextMenu={(item, event) => {
                  event.preventDefault()
                  setContextMenu({ x: event.clientX, y: event.clientY, item })
                }}
              />
            }
          >
          <FileTree
            items={staged()}
            actionLabel={language.t("shell.git.unstage")}
            busy={busy()}
            selected={props.activeFile ? { file: props.activeFile, staged: true } : undefined}
            staged={true}
            onSelect={(item) => openDiff(item, true)}
            onAction={(item) => toggleFile(item, true)}
            isCollapsed={isCollapsed}
            toggleDir={toggleDir}
            conflicts={props.conflicts}
            onContextMenu={(item, event) => {
              event.preventDefault()
              setContextMenu({ x: event.clientX, y: event.clientY, item })
            }}
          />
          </Show>
        </div>
      </Show>

      <Show when={unstaged().length > 0}>
        <div class="flex flex-col">
          <div class="flex items-center gap-1 px-1">
            <span class="flex-1 text-[11px] font-[530] uppercase leading-4 tracking-[0.05px] text-v2-text-text-muted">
              {language.t("shell.git.unstaged")} · {unstaged().length}
            </span>
            <button
              type="button"
              class="flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:outline-none disabled:opacity-40"
              disabled={busy() || !props.directory}
              onClick={() =>
                void act("stageAll", () => gitActions.stageAll(props.directory!, unstaged().map((item) => item.file)))
              }
            >
              <Show when={pending() === "stageAll"}>
                <Spinner />
              </Show>
              {language.t("shell.git.stageAll")}
            </button>
          </div>
          <Show
            when={props.view === "tree"}
            fallback={
              <FileList
                items={unstaged()}
                actionLabel={language.t("shell.git.stage")}
                discardLabel={language.t("shell.git.discard")}
                busy={busy()}
                selected={props.activeFile ? { file: props.activeFile, staged: false } : undefined}
                staged={false}
                onSelect={(item) => openDiff(item, false)}
                onAction={(item) => toggleFile(item, false)}
                onDiscard={(item) => discardFile(item)}
                conflicts={props.conflicts}
                onContextMenu={(item, event) => {
                  event.preventDefault()
                  setContextMenu({ x: event.clientX, y: event.clientY, item })
                }}
              />
            }
          >
          <FileTree
            items={unstaged()}
            actionLabel={language.t("shell.git.stage")}
            discardLabel={language.t("shell.git.discard")}
            busy={busy()}
            selected={props.activeFile ? { file: props.activeFile, staged: false } : undefined}
            staged={false}
            onSelect={(item) => openDiff(item, false)}
            onAction={(item) => toggleFile(item, false)}
            onDiscard={(item) => discardFile(item)}
            isCollapsed={isCollapsed}
            toggleDir={toggleDir}
            conflicts={props.conflicts}
            onContextMenu={(item, event) => {
              event.preventDefault()
              setContextMenu({ x: event.clientX, y: event.clientY, item })
            }}
          />
          </Show>
        </div>
      </Show>

      <Show when={unstaged().length === 0 && staged().length === 0}>
        <div class="px-1 py-6 text-center text-[12px] leading-5 text-v2-text-text-muted">
          {language.t("shell.git.noChanges")}
        </div>
      </Show>

      <DropdownMenu open={!!contextMenu()} onOpenChange={(open) => !open && setContextMenu(undefined)}>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            class="fixed"
            style={{ left: `${contextMenu()?.x ?? 0}px`, top: `${contextMenu()?.y ?? 0}px` }}
          >
            <DropdownMenu.Item onSelect={() => copyPath(contextMenu()!.item)}>
              <Icon name="outline-copy" class="w-4 h-4 mr-2" />
              {language.t("shell.git.changes.copyPath")}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu>
    </div>
  )
}

function FileTree(props: {
  items: StageItem[]
  actionLabel: string
  discardLabel?: string
  busy: boolean
  selected?: Selection
  staged: boolean
  onSelect: (item: StageItem) => void
  onAction: (item: StageItem) => void
  onDiscard?: (item: StageItem) => void
  isCollapsed: (path: string) => boolean
  toggleDir: (path: string) => void
  conflicts: string[]
  onContextMenu?: (item: StageItem, event: MouseEvent) => void
}) {
  const tree = createMemo(() => buildTree(props.items))
  return <FileDir {...props} node={tree()} depth={0} />
}

function FileList(props: {
  items: StageItem[]
  actionLabel: string
  discardLabel?: string
  busy: boolean
  selected?: Selection
  staged: boolean
  onSelect: (item: StageItem) => void
  onAction: (item: StageItem) => void
  onDiscard?: (item: StageItem) => void
  conflicts: string[]
  onContextMenu?: (item: StageItem, event: MouseEvent) => void
}) {
  return (
    <For each={props.items}>
      {(item) => <FileRow {...props} item={item} depth={0} label={item.file} />}
    </For>
  )
}

function FileRow(props: {
  item: StageItem
  depth: number
  label: string
  actionLabel: string
  discardLabel?: string
  busy: boolean
  selected?: Selection
  staged: boolean
  onSelect: (item: StageItem) => void
  onAction: (item: StageItem) => void
  onDiscard?: (item: StageItem) => void
  conflicts: string[]
  onContextMenu?: (item: StageItem, event: MouseEvent) => void
}) {
  const active = () => props.selected?.file === props.item.file && props.selected?.staged === props.staged
  return (
    <div
      class="group flex min-w-0 cursor-pointer items-center gap-2 rounded-sm py-0 pe-1.5 hover:bg-v2-overlay-simple-overlay-hover"
      classList={{ "bg-v2-overlay-simple-overlay-pressed": active() }}
      // Nested files align with their parent folder's icon (folder rows start
      // with a chevron before the icon).
      style={{ "padding-inline-start": `${props.depth * 12 + 10 + (props.depth > 0 ? 7 : 0)}px` }}
      title={props.item.file}
      onClick={() => props.onSelect(props.item)}
      onContextMenu={(event) => props.onContextMenu?.(props.item, event)}
    >
      <Show
        when={props.conflicts.includes(props.item.file)}
        fallback={<ToneBadge tone={props.item.tone} />}
      >
        <Icon name="warning" size="small" class="shrink-0 text-[#d29922]" />
      </Show>
      <span class="min-w-0 flex-1 truncate text-[12px] leading-5 text-v2-text-text-base">{props.label}</span>
      <Show when={props.onDiscard}>
        <button
          type="button"
          class="flex shrink-0 items-center text-v2-icon-icon-muted opacity-0 transition-opacity hover:text-v2-text-text-base focus-visible:opacity-100 group-hover:opacity-100"
          disabled={props.busy}
          title={props.discardLabel}
          onClick={(event) => {
            event.stopPropagation()
            props.onDiscard?.(props.item)
          }}
        >
          <Icon name="outline-reset" size="small" />
        </button>
      </Show>
      <button
        type="button"
        class="shrink-0 rounded-sm px-1 py-0.5 text-[11px] text-v2-text-text-muted opacity-0 transition-opacity hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:opacity-100 group-hover:opacity-100"
        disabled={props.busy}
        onClick={(event) => {
          event.stopPropagation()
          props.onAction(props.item)
        }}
      >
        {props.actionLabel}
      </button>
      <span
        class="shrink-0 font-mono text-[11px] font-[600]"
        classList={{ [toneTextColor(props.item.tone)]: true }}
      >
        {props.item.letter}
      </span>
    </div>
  )
}

function FileDir(props: {
  node: TreeDir
  depth: number
  items: StageItem[]
  actionLabel: string
  discardLabel?: string
  busy: boolean
  selected?: Selection
  staged: boolean
  onSelect: (item: StageItem) => void
  onAction: (item: StageItem) => void
  onDiscard?: (item: StageItem) => void
  isCollapsed: (path: string) => boolean
  toggleDir: (path: string) => void
  conflicts: string[]
  onContextMenu?: (item: StageItem, event: MouseEvent) => void
}) {
  const dirs = createMemo(() => [...props.node.dirs.values()].toSorted((a, b) => a.name.localeCompare(b.name)))
  return (
    <>
      <For each={dirs()}>
        {(dir) => (
          <DirNode
            dir={dir}
            depth={props.depth}
            actionLabel={props.actionLabel}
            discardLabel={props.discardLabel}
            busy={props.busy}
            selected={props.selected}
            staged={props.staged}
            onSelect={props.onSelect}
            onAction={props.onAction}
            onDiscard={props.onDiscard}
            isCollapsed={props.isCollapsed}
            toggleDir={props.toggleDir}
            conflicts={props.conflicts}
            onContextMenu={props.onContextMenu}
          />
        )}
      </For>
      <For each={props.node.files}>
        {(item) => (
          <FileRow
            item={item}
            depth={props.depth}
            label={item.file.split("/").pop() ?? item.file}
            actionLabel={props.actionLabel}
            discardLabel={props.discardLabel}
            busy={props.busy}
            selected={props.selected}
            staged={props.staged}
            onSelect={props.onSelect}
            onAction={props.onAction}
            onDiscard={props.onDiscard}
            conflicts={props.conflicts}
            onContextMenu={props.onContextMenu}
          />
        )}
      </For>
    </>
  )
}

function DirNode(props: {
  dir: TreeDir
  depth: number
  actionLabel: string
  discardLabel?: string
  busy: boolean
  selected?: Selection
  staged: boolean
  onSelect: (item: StageItem) => void
  onAction: (item: StageItem) => void
  onDiscard?: (item: StageItem) => void
  isCollapsed: (path: string) => boolean
  toggleDir: (path: string) => void
  conflicts: string[]
  onContextMenu?: (item: StageItem, event: MouseEvent) => void
}) {
  const open = () => !props.isCollapsed(props.dir.path)
  return (
    <>
      <div
        class="flex min-w-0 cursor-pointer items-center gap-1 rounded-sm py-0 text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover"
        style={{ "padding-inline-start": `${props.depth * 12 + 10}px` }}
        onClick={() => props.toggleDir(props.dir.path)}
      >
        <Icon
          name="outline-chevron-down"
          size="small"
          class={`shrink-0 transition-transform ${open() ? "" : "-rotate-90"}`}
        />
        <Icon name="folder" size="small" class="shrink-0" />
        <span class="min-w-0 truncate text-[12px] leading-5">{props.dir.name}</span>
      </div>
      <Show when={open()}>
        <FileDir
          node={props.dir}
          depth={props.depth + 1}
          items={[]}
          actionLabel={props.actionLabel}
          discardLabel={props.discardLabel}
          busy={props.busy}
          selected={props.selected}
          staged={props.staged}
          onSelect={props.onSelect}
          onAction={props.onAction}
          onDiscard={props.onDiscard}
          isCollapsed={props.isCollapsed}
          toggleDir={props.toggleDir}
          conflicts={props.conflicts}
          onContextMenu={props.onContextMenu}
        />
      </Show>
    </>
  )
}
