import { createSignal } from "solid-js"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode-ai/ui/v2/dialog-v2"
import { Field } from "@opencode-ai/ui/v2/field-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { TextareaV2 } from "@opencode-ai/ui/v2/textarea-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"

export function DialogCreateWorkspace(props: { onCreate: (name: string, prompt?: string) => void }) {
  const language = useLanguage()
  const dialog = useDialog()
  const [name, setName] = createSignal("")
  const [prompt, setPrompt] = createSignal("")

  const create = () => {
    const value = name().trim()
    if (!value) return
    props.onCreate(value, prompt().trim() || undefined)
    dialog.close()
  }

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitle>{language.t("shell.workspace.create.title")}</DialogTitle>
      </DialogHeader>
      <DialogBody class="flex w-full flex-col gap-4 px-4 pt-4 pb-1">
        <div class="text-[12px] leading-5 text-v2-text-text-muted">
          {language.t("shell.workspace.create.description")}
        </div>
        <Field>
          <Field.Label>{language.t("shell.workspace.create.name")}</Field.Label>
          <TextInputV2
            autofocus
            appearance="large"
            class="!w-full"
            value={name()}
            placeholder={language.t("shell.workspace.create.namePlaceholder")}
            onInput={(event) => setName(event.currentTarget.value)}
          />
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
        <ButtonV2 type="button" variant="contrast" disabled={!name().trim()} onClick={create}>
          {language.t("shell.workspace.create.submit")}
        </ButtonV2>
      </DialogFooter>
    </Dialog>
  )
}
