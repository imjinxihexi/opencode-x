import { For, Show, createResource, createSignal } from "solid-js"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode-ai/ui/v2/dialog-v2"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { gitActions } from "@/components/shell/git-actions"
import { Spinner } from "@/components/shell/spinner"
import { useLanguage } from "@/context/language"

export function DialogStash(props: { directory: string; onChanged: () => void }) {
  const language = useLanguage()
  const dialog = useDialog()
  const [rev, setRev] = createSignal(0)
  const [busy, setBusy] = createSignal<string>()
  const [error, setError] = createSignal<string>()

  const [stashes] = createResource(
    () => [props.directory, rev()] as const,
    async ([directory]) => gitActions.stashList(directory).catch(() => [] as { ref: string; message: string }[]),
    { initialValue: [] as { ref: string; message: string }[] },
  )

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key)
    setError(undefined)
    try {
      await action()
      props.onChanged()
      setRev((value) => value + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(undefined)
    }
  }

  const btnClass =
    "flex shrink-0 items-center gap-1 rounded-sm border-[0.5px] border-v2-border-border-muted px-2 py-0.5 text-[11px] text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none disabled:opacity-40"

  return (
    <Dialog fit containerClass="!w-[560px] !max-w-[calc(100vw-32px)]">
      <DialogHeader>
        <DialogTitle>{language.t("shell.git.stash.title")}</DialogTitle>
      </DialogHeader>
      <DialogBody class="flex w-full flex-col gap-3 px-4 pt-4 pb-2">
        <Show
          when={stashes().length > 0}
          fallback={
            <div class="py-6 text-center text-[12px] text-v2-text-text-muted">{language.t("shell.git.stash.empty")}</div>
          }
        >
          <div class="flex max-h-[320px] flex-col overflow-y-auto rounded-md border-[0.5px] border-v2-border-border-muted [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-v2-border-border-muted">
            <For each={stashes()}>
              {(item) => (
                <div class="flex min-w-0 items-center gap-2 border-b-[0.5px] border-v2-border-border-muted px-3 py-2 last:border-b-0">
                  <div class="flex min-w-0 flex-1 flex-col">
                    <span class="min-w-0 truncate text-[13px] leading-5 text-v2-text-text-base">{item.message}</span>
                    <span class="shrink-0 font-mono text-[11px] text-v2-text-text-muted">{item.ref}</span>
                  </div>
                  <button
                    type="button"
                    class={btnClass}
                    disabled={busy() !== undefined}
                    onClick={() => void run(`apply:${item.ref}`, () => gitActions.stashApply(props.directory, item.ref))}
                  >
                    {language.t("shell.git.stash.apply")}
                  </button>
                  <button
                    type="button"
                    class={btnClass}
                    disabled={busy() !== undefined}
                    onClick={() => void run(`pop:${item.ref}`, () => gitActions.stashPop(props.directory, item.ref))}
                  >
                    <Show when={busy() === `pop:${item.ref}`}>
                      <Spinner />
                    </Show>
                    {language.t("shell.git.stash.pop")}
                  </button>
                  <button
                    type="button"
                    class={btnClass}
                    disabled={busy() !== undefined}
                    onClick={() => void run(`drop:${item.ref}`, () => gitActions.stashDrop(props.directory, item.ref))}
                  >
                    <Icon name="outline-xmark" size="small" />
                    {language.t("shell.git.stash.drop")}
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
        <Show when={error()}>
          <div class="rounded-md border-[0.5px] border-[#f85149] bg-[#f851491a] px-3 py-2 text-[12px] leading-5 text-[#f85149]">
            {error()}
          </div>
        </Show>
      </DialogBody>
      <DialogFooter>
        <ButtonV2
          type="button"
          variant="neutral"
          disabled={busy() !== undefined}
          onClick={() => void run("stash", () => gitActions.stash(props.directory))}
        >
          <Show when={busy() === "stash"}>
            <Spinner />
          </Show>
          {language.t("shell.git.stash.create")}
        </ButtonV2>
        <ButtonV2 type="button" variant="contrast" onClick={dialog.close}>
          {language.t("common.close")}
        </ButtonV2>
      </DialogFooter>
    </Dialog>
  )
}
