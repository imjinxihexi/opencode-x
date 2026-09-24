import { For, Show, createMemo } from "solid-js"
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { useModels } from "@/context/models"
import { useLanguage } from "@/context/language"

export type PickedModel = { providerID: string; modelID: string }

export function ModelPicker(props: {
  value?: PickedModel
  disabled?: boolean
  onChange: (value: PickedModel | undefined) => void
}) {
  const models = useModels()
  const language = useLanguage()

  const options = createMemo(() =>
    models
      .list()
      .filter((item) => models.visible({ providerID: item.provider.id, modelID: item.id }))
      .toSorted((a, b) => `${a.provider.id}/${a.id}`.localeCompare(`${b.provider.id}/${b.id}`)),
  )

  const label = () => {
    const value = props.value
    if (!value) return language.t("shell.model.auto")
    const found = models.find(value)
    if (!found) return language.t("shell.model.auto")
    const provider = found.provider.name || found.provider.id
    return `${provider} / ${found.name}`
  }

  return (
    <MenuV2 placement="bottom-end" gutter={4}>
      <MenuV2.Trigger
        class="flex h-7 min-w-0 max-w-[220px] shrink-0 items-center gap-1.5 rounded-sm border-[0.5px] border-v2-border-border-muted px-2 text-[12px] leading-5 text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:outline-none disabled:opacity-40"
        disabled={props.disabled}
      >
        <Icon name="robot" size="small" class="shrink-0" />
        <span class="min-w-0 flex-1 truncate">{label()}</span>
        <Icon name="outline-chevron-down" size="small" class="shrink-0" />
      </MenuV2.Trigger>
      <MenuV2.Portal>
        <MenuV2.Content class="max-h-[280px] w-[260px] overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-v2-border-border-muted">
          <MenuV2.Item onSelect={() => props.onChange(undefined)}>
            <Icon name="reset" size="small" />
            <span class="min-w-0 flex-1 truncate">{language.t("shell.model.auto")}</span>
          </MenuV2.Item>
          <MenuV2.Separator />
          <For each={options()}>
            {(item) => (
              <MenuV2.Item
                onSelect={() => props.onChange({ providerID: item.provider.id, modelID: item.id })}
              >
                <span class="min-w-0 flex-1 truncate">
                  {item.provider.name || item.provider.id} / {item.name}
                </span>
                <Show when={props.value?.providerID === item.provider.id && props.value?.modelID === item.id}>
                  <Icon name="check" size="small" />
                </Show>
              </MenuV2.Item>
            )}
          </For>
        </MenuV2.Content>
      </MenuV2.Portal>
    </MenuV2>
  )
}
