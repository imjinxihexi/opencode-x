import { createEffect, createSignal, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode-ai/ui/v2/dialog-v2"
import { Field } from "@opencode-ai/ui/v2/field-v2"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { TextareaV2 } from "@opencode-ai/ui/v2/textarea-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { Persist, persisted } from "@/utils/persist"
import { safeFolderName } from "@/components/shell/workspaces"

export function DialogCreateWorkspace(props: {
  onCreate: (name: string, prompt?: string, root?: string, folder?: string) => void
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const platform = usePlatform()
  const [name, setName] = createSignal("")
  const [prompt, setPrompt] = createSignal("")
  const [identifier, setIdentifier] = createSignal("")
  const [identifierTouched, setIdentifierTouched] = createSignal(false)
  const [remembered, setRemembered] = persisted(
    Persist.global("git-workspace-root"),
    createStore<{ last?: string }>({}),
  )
  const [override, setOverride] = createSignal<string | undefined>(undefined)
  const [locationOpen, setLocationOpen] = createSignal(false)
  const root = () => override() ?? remembered.last ?? ""

  createEffect(() => {
    if (remembered.last) setLocationOpen(true)
  })

  const isSafeName = (value: string) => /^[a-zA-Z0-9._-]+$/.test(value)

  createEffect(() => {
    const value = name().trim()
    if (identifierTouched()) return
    setIdentifier(isSafeName(value) ? safeFolderName(value) : "")
  })

  const identifierInvalid = () => {
    const value = identifier().trim()
    if (!value) return false
    if (value.length > 64) return true
    if (!/^[a-zA-Z0-9._-]+$/.test(value)) return true
    if (/^[.\-]+$/.test(value)) return true
    if (/[.\- ]$/.test(value)) return true
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value)) return true
    return false
  }

  const nameInvalid = () => {
    const value = name().trim()
    if (!value) return false
    if (value.length > 64) return true
    if (/[/\\:*?"<>|\p{C}]/u.test(value)) return true
    if (/^[.\s]+$/.test(value)) return true
    if (/[.\s]$/.test(value)) return true
    return false
  }

  const canCreate = () => Boolean(name().trim() && identifier().trim()) && !nameInvalid() && !identifierInvalid()

  const pickFolder = async () => {
    if (platform.platform !== "desktop" || !platform.openDirectoryPickerDialog) return
    const result = await platform.openDirectoryPickerDialog({
      title: language.t("shell.workspace.create.pickFolder"),
      multiple: false,
    })
    if (!result) return
    const path = Array.isArray(result) ? result[0] : result
    if (!path) return
    setOverride(path)
    setRemembered("last", path)
    setLocationOpen(true)
  }

  const clearRoot = () => {
    setOverride("")
    setRemembered("last", undefined)
  }

  const create = () => {
    const value = name().trim()
    if (!canCreate()) return
    try {
      props.onCreate(value, prompt().trim() || undefined, root().trim() || undefined, identifier().trim())
    } finally {
      dialog.close()
    }
  }

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitle>{language.t("shell.workspace.create.title")}</DialogTitle>
        <Show when={platform.platform === "desktop" && platform.openDirectoryPickerDialog}>
          <button
            type="button"
            class="flex size-7 shrink-0 items-center justify-center rounded-sm text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:outline-none"
            title={language.t("shell.workspace.create.pickFolder")}
            aria-label={language.t("shell.workspace.create.pickFolder")}
            onClick={() => void pickFolder()}
          >
            <Icon name="folder" />
          </button>
        </Show>
      </DialogHeader>
      <DialogBody class="flex w-full flex-col gap-4 px-4 pt-2 pb-1">
        <div class="text-[12px] leading-5 text-v2-text-text-muted">
          {language.t("shell.workspace.create.description")}
        </div>
        <Show when={root().trim()}>
          <div class="flex flex-col gap-1.5 rounded-md bg-v2-background-bg-layer-02 px-3 py-2">
            <button
              type="button"
              class="flex min-w-0 items-center gap-1.5 focus-visible:outline-none"
              onClick={() => setLocationOpen((value) => !value)}
            >
              <Icon
                name="outline-chevron-down"
                size="small"
                class={`shrink-0 text-v2-icon-icon-muted transition-transform ${locationOpen() ? "" : "-rotate-90"}`}
              />
              <span class="text-[12px] font-[530] leading-5 text-v2-text-text-muted">
                {language.t("shell.workspace.create.location")}
              </span>
            </button>
            <Show when={locationOpen()}>
              <div class="flex min-w-0 items-center gap-2 ps-[22px]">
                <Icon name="folder" size="small" class="shrink-0 text-v2-icon-icon-muted" />
                <span class="min-w-0 flex-1 truncate text-[12px] leading-5 text-v2-text-text-muted" title={root()}>
                  {root()}
                </span>
                <button
                  type="button"
                  class="shrink-0 rounded-sm px-1 py-0.5 text-[11px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:outline-none"
                  onClick={clearRoot}
                >
                  {language.t("shell.workspace.create.clearLocation")}
                </button>
              </div>
            </Show>
          </div>
        </Show>
        <Field>
          <Field.Label>
            {language.t("shell.workspace.create.name")}
            <span class="ml-0.5 text-[#f85149]">*</span>
          </Field.Label>
          <TextInputV2
            autofocus
            appearance="large"
            class="!w-full"
            invalid={nameInvalid()}
            value={name()}
            placeholder={language.t("shell.workspace.create.namePlaceholder")}
            onInput={(event) => setName(event.currentTarget.value)}
          />
          <Show when={nameInvalid()}>
            <div class="text-[11px] leading-4 text-[#f85149]">{language.t("shell.workspace.create.nameInvalid")}</div>
          </Show>
        </Field>
        <Field>
          <Field.Label>
            {language.t("shell.workspace.create.identifier")}
            <span class="ml-0.5 text-[#f85149]">*</span>
          </Field.Label>
          <TextInputV2
            class="!w-full"
            invalid={identifierInvalid()}
            value={identifier()}
            placeholder={language.t("shell.workspace.create.identifierPlaceholder")}
            onInput={(event) => {
              setIdentifierTouched(true)
              setIdentifier(event.currentTarget.value)
            }}
          />
          <Show when={identifierInvalid()}>
            <div class="text-[11px] leading-4 text-[#f85149]">
              {language.t("shell.workspace.create.identifierInvalid")}
            </div>
          </Show>
          <Show when={!identifierInvalid()}>
            <Field.Prefix>
              {language.t("shell.workspace.create.identifierHint", {
                path: `${root().trim() || language.t("shell.workspace.create.locationPlaceholder")}/${identifier().trim() || "—"}`,
              })}
            </Field.Prefix>
          </Show>
        </Field>
        <Field>
          <Field.Label>{language.t("shell.workspace.create.prompt")}</Field.Label>
          <TextareaV2
            class="!w-full"
            rows={4}
            value={prompt()}
            placeholder={language.t("shell.workspace.create.promptPlaceholder")}
            onInput={(event) => setPrompt(event.currentTarget.value)}
          />
          <Field.Prefix>{language.t("shell.workspace.create.promptHint")}</Field.Prefix>
        </Field>
      </DialogBody>
      <DialogFooter>
        <ButtonV2 type="button" variant="neutral" onClick={dialog.close}>
          {language.t("common.cancel")}
        </ButtonV2>
        <ButtonV2 type="button" variant="contrast" disabled={!canCreate()} onClick={create}>
          {language.t("shell.workspace.create.submit")}
        </ButtonV2>
      </DialogFooter>
    </Dialog>
  )
}
