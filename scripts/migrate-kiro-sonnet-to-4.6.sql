-- 批量更新 Kiro Sonnet 4.5 → 4.6
-- 影响范围：api_key_model_mappings 表

BEGIN;

-- 1. 更新模型映射表
UPDATE api_key_model_mappings
SET
  target_model = 'claude-sonnet-4.6',
  updated_at = NOW()
WHERE
  platform = 'kiro'
  AND claude_model = 'sonnet'
  AND target_model = 'claude-sonnet-4.5';

-- 2. 输出影响的记录数
SELECT
  COUNT(*) as "已迁移的 API Key 数量"
FROM api_key_model_mappings
WHERE
  platform = 'kiro'
  AND claude_model = 'sonnet'
  AND target_model = 'claude-sonnet-4.6';

COMMIT;

-- 验证：确认没有遗留的 4.5 映射
SELECT
  ak.id as api_key_id,
  ak.name as api_key_name,
  akm.claude_model,
  akm.target_model
FROM api_key_model_mappings akm
JOIN api_keys ak ON akm.api_key_id = ak.id
WHERE
  akm.platform = 'kiro'
  AND akm.target_model = 'claude-sonnet-4.5';
-- 应该返回 0 行
