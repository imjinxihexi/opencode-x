import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode-ai/ui/v2/dialog-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"

export function DialogDirtySwitch(props: {
  branch: string
  onContinue: () => void
  onStash: () => void
}) {
  const language = useLanguage()
  const dialog = useDialog()
  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitle>{language.t("shell.git.dirtySwitch.title")}</DialogTitle>
      </DialogHeader>
      <DialogBody class="px-4 pt-3 pb-1 text-[13px] leading-5 text-v2-text-text-muted">
        {language.t("shell.git.dirtySwitch.description", { branch: props.branch })}
      </DialogBody>
      <DialogFooter>
        <ButtonV2 type="button" variant="neutral" onClick={dialog.close}>
          {language.t("common.cancel")}
        </ButtonV2>
        <ButtonV2
          type="button"
          variant="neutral"
          onClick={() => {
            dialog.close()
            props.onStash()
          }}
        >
          {language.t("shell.git.dirtySwitch.stash")}
        </ButtonV2>
        <ButtonV2
          type="button"
          variant="contrast"
          onClick={() => {
            dialog.close()
            props.onContinue()
          }}
        >
          {language.t("shell.git.dirtySwitch.continue")}
        </ButtonV2>
      </DialogFooter>
    </Dialog>
  )
}
