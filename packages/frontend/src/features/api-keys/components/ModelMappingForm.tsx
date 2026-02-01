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
    field: 'platform' | 'targetModel',
    newValue: string
  ) => {
    const newMappings = [...value];
    const index = newMappings.findIndex((m) => m.claudeModel === slot);
    const current = getMappingForSlot(slot);

    let updated: ModelMappingSchema;
    if (field === 'platform') {
      const platform = newValue as PlatformId;
      const firstModel = PLATFORMS[platform].models[0].id;
      updated = { ...current, platform, targetModel: firstModel };
    } else {
      updated = { ...current, targetModel: newValue };
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
      <Label className="text-sm font-medium">模型映射</Label>
      <div className="space-y-3">
        {CLAUDE_MODEL_SLOTS.map((slot) => {
          const mapping = getMappingForSlot(slot);
          const platformModels = PLATFORMS[mapping.platform].models;

          return (
            <div key={slot} className="flex items-center gap-3">
              <div className="w-20 text-sm font-medium text-muted-foreground">
                {SLOT_LABELS[slot]}
              </div>
              <div className="flex-1 flex gap-2">
                <Select
                  value={mapping.platform}
                  onValueChange={(v: string) => updateMapping(slot, 'platform', v)}
                  disabled={disabled}
                >
                  <SelectTrigger className="w-[140px]">
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
                  value={mapping.targetModel}
                  onValueChange={(v: string) => updateMapping(slot, 'targetModel', v)}
                  disabled={disabled}
                >
                  <SelectTrigger className="flex-1">
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
