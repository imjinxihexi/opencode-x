import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode-ai/ui/v2/dialog-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"

export function DialogConfirm(props: {
  title: string
  description?: string
  confirmLabel: string
  onConfirm: () => Promise<unknown> | unknown
}) {
  const language = useLanguage()
  const dialog = useDialog()
  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitle>{props.title}</DialogTitle>
      </DialogHeader>
      <DialogBody class="px-4 pt-2 pb-1 text-[13px] leading-5 text-v2-text-text-muted">{props.description}</DialogBody>
      <DialogFooter>
        <ButtonV2 type="button" variant="neutral" onClick={dialog.close}>
          {language.t("common.cancel")}
        </ButtonV2>
        <ButtonV2
          type="button"
          variant="contrast"
          onClick={() => {
            void Promise.resolve(props.onConfirm()).finally(() => dialog.close())
          }}
        >
          {props.confirmLabel}
        </ButtonV2>
      </DialogFooter>
    </Dialog>
  )
}
