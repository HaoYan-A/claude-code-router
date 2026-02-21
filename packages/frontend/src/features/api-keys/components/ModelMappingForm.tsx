import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  PLATFORMS,
  CLAUDE_MODEL_SLOTS,
  DEFAULT_MODEL_MAPPINGS,
  type ClaudeModelSlot,
  type PlatformId,
  type ModelMappingSchema,
  type ReasoningEffort,
} from '@claude-code-router/shared';

interface ModelMappingFormProps {
  value: ModelMappingSchema[];
  onChange: (mappings: ModelMappingSchema[]) => void;
  disabled?: boolean;
}

const SLOT_LABELS: Record<ClaudeModelSlot, string> = {
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
};

interface Preset {
  label: string;
  mappings: ModelMappingSchema[];
}

const PRESETS: Preset[] = [
  {
    label: 'AG Claude',
    mappings: [
      { claudeModel: 'opus', platform: 'antigravity', targetModel: 'claude-opus-4-6-thinking' },
      { claudeModel: 'sonnet', platform: 'antigravity', targetModel: 'claude-sonnet-4-6-thinking' },
      { claudeModel: 'haiku', platform: 'antigravity', targetModel: 'gemini-3-flash' },
    ],
  },
  {
    label: 'AG Gemini',
    mappings: [
      { claudeModel: 'opus', platform: 'antigravity', targetModel: 'gemini-3-pro-high' },
      { claudeModel: 'sonnet', platform: 'antigravity', targetModel: 'gemini-3-pro-high' },
      { claudeModel: 'haiku', platform: 'antigravity', targetModel: 'gemini-3-flash' },
    ],
  },
  {
    label: 'Kiro Claude',
    mappings: [
      { claudeModel: 'opus', platform: 'kiro', targetModel: 'claude-opus-4.6' },
      { claudeModel: 'sonnet', platform: 'kiro', targetModel: 'claude-sonnet-4.5' },
      { claudeModel: 'haiku', platform: 'kiro', targetModel: 'claude-haiku-4.5' },
    ],
  },
  {
    label: 'Codex',
    mappings: [
      { claudeModel: 'opus', platform: 'openai', targetModel: 'gpt-5.3-codex', reasoningEffort: 'high' },
      { claudeModel: 'sonnet', platform: 'openai', targetModel: 'gpt-5.3-codex', reasoningEffort: 'high' },
      { claudeModel: 'haiku', platform: 'openai', targetModel: 'gpt-5.1-codex-mini', reasoningEffort: 'auto' },
    ],
  },
];

function getReasoningEfforts(platform: PlatformId, modelId: string): readonly ReasoningEffort[] | undefined {
  if (platform !== 'openai') return undefined;
  const model = PLATFORMS.openai.models.find((m) => m.id === modelId);
  return model?.reasoningEfforts;
}

export function ModelMappingForm({ value, onChange, disabled }: ModelMappingFormProps) {
  const getMappingForSlot = (slot: ClaudeModelSlot): ModelMappingSchema => {
    const existing = value.find((m) => m.claudeModel === slot);
    if (existing) return existing;
    const defaultMapping = DEFAULT_MODEL_MAPPINGS[slot];
    return {
      claudeModel: slot,
      platform: defaultMapping.platform,
      targetModel: defaultMapping.model,
    };
  };

  const updateMapping = (
    slot: ClaudeModelSlot,
    field: 'platform' | 'targetModel' | 'reasoningEffort',
    newValue: string
  ) => {
    const newMappings = [...value];
    const index = newMappings.findIndex((m) => m.claudeModel === slot);
    const current = getMappingForSlot(slot);

    let updated: ModelMappingSchema;
    if (field === 'platform') {
      const platform = newValue as PlatformId;
      const firstModel = PLATFORMS[platform].models[0].id;
      const efforts = getReasoningEfforts(platform, firstModel);
      updated = {
        ...current,
        platform,
        targetModel: firstModel,
        reasoningEffort: efforts ? 'high' : undefined,
      };
    } else if (field === 'targetModel') {
      updated = { ...current, targetModel: newValue };
      // Check if current reasoningEffort is valid for new model
      const efforts = getReasoningEfforts(current.platform, newValue);
      if (efforts && current.reasoningEffort) {
        if (!efforts.includes(current.reasoningEffort as ReasoningEffort)) {
          updated.reasoningEffort = 'high';
        }
      } else if (!efforts) {
        updated.reasoningEffort = undefined;
      }
    } else {
      updated = { ...current, reasoningEffort: newValue as ReasoningEffort };
    }

    if (index >= 0) {
      newMappings[index] = updated;
    } else {
      newMappings.push(updated);
    }

    onChange(newMappings);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">模型映射</Label>
        <div className="flex gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="px-2 py-0.5 text-xs rounded border border-border hover:bg-accent hover:text-accent-foreground transition-colors"
              onClick={() => !disabled && onChange(preset.mappings)}
              disabled={disabled}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {CLAUDE_MODEL_SLOTS.map((slot) => {
          const mapping = getMappingForSlot(slot);
          const platformModels = PLATFORMS[mapping.platform].models;

          const reasoningEfforts = getReasoningEfforts(mapping.platform, mapping.targetModel);

          return (
            <div key={slot} className="flex items-center gap-2">
              <div className="w-16 text-sm font-medium text-muted-foreground shrink-0">
                {SLOT_LABELS[slot]}
              </div>
              <div className="flex-1 flex gap-2 min-w-0">
                <Select
                  key={`${slot}-plat-${mapping.platform}`}
                  value={mapping.platform}
                  onValueChange={(v: string) => updateMapping(slot, 'platform', v)}
                  disabled={disabled}
                >
                  <SelectTrigger className="w-[110px] shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(PLATFORMS).map((platform) => (
                      <SelectItem key={platform.id} value={platform.id}>
                        {platform.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  key={`${slot}-model-${mapping.platform}-${mapping.targetModel}`}
                  value={mapping.targetModel}
                  onValueChange={(v: string) => updateMapping(slot, 'targetModel', v)}
                  disabled={disabled}
                >
                  <SelectTrigger className="flex-1 min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {platformModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {reasoningEfforts && (
                  <Select
                    key={`${slot}-effort-${mapping.reasoningEffort}`}
                    value={mapping.reasoningEffort || 'high'}
                    onValueChange={(v: string) => updateMapping(slot, 'reasoningEffort', v)}
                    disabled={disabled}
                  >
                    <SelectTrigger className="w-[90px] shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {reasoningEfforts.map((effort) => (
                        <SelectItem key={effort} value={effort}>
                          {effort}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium">💡 建议：</span>
        Haiku 在 Claude Code 中主要用于子 Agent 调查代码，建议映射到 Gemini 3 Flash 等快速模型，以避免影响整体执行速度。
      </p>
    </div>
  );
}
