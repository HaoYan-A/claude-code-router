/**
 * 费用计算工具
 *
 * 根据模型定价配置计算请求费用
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ModelPricing {
  description: string;
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  cacheStorage?: number;
}

interface PricingConfig {
  version: string;
  lastUpdated: string;
  currency: string;
  unit: string;
  models: Record<string, ModelPricing>;
}

export interface CostInput {
  targetModel: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

// 定价配置缓存
let pricingConfig: PricingConfig | null = null;

/**
 * 加载定价配置
 */
function loadPricingConfig(): PricingConfig {
  const configPath = resolve(__dirname, '../config/model-pricing.json');
  const content = readFileSync(configPath, 'utf-8');
  return JSON.parse(content) as PricingConfig;
}

/**
 * 获取定价配置（带缓存）
 */
function getPricingConfig(): PricingConfig {
  if (!pricingConfig) {
    pricingConfig = loadPricingConfig();
    logger.info(
      { version: pricingConfig.version, modelCount: Object.keys(pricingConfig.models).length },
      'Loaded model pricing config'
    );
  }
  return pricingConfig;
}

/**
 * 获取模型定价
 *
 * @param modelName 模型名称（targetModel）
 * @returns 模型定价信息，如果模型不存在则返回 null
 */
export function getModelPricing(modelName: string): ModelPricing | null {
  const config = getPricingConfig();
  return config.models[modelName] || null;
}

/**
 * 计算请求费用
 *
 * 费用计算公式：
 * - 输入费用 = inputTokens * input_price / 1_000_000
 * - 输出费用 = outputTokens * output_price / 1_000_000
 * - 缓存读取费用 = cacheReadTokens * cacheRead_price / 1_000_000
 * - 缓存写入费用 = cacheCreationTokens * cacheWrite_price / 1_000_000
 *
 * 注意：缓存读取的 token 不计入输入 token，需要单独计算
 *
 * @param input 费用计算输入
 * @returns 总费用（USD），保留 8 位小数。如果模型不存在返回 0
 */
export function calculateCost(input: CostInput): number {
  const pricing = getModelPricing(input.targetModel);
  if (!pricing) {
    logger.warn({ model: input.targetModel }, 'Model pricing not found, cost will be 0');
    return 0;
  }

  const MILLION = 1_000_000;

  // 输入 token 费用（不包含缓存读取的 token）
  const inputCost = (input.inputTokens * pricing.input) / MILLION;

  // 输出 token 费用
  const outputCost = (input.outputTokens * pricing.output) / MILLION;

  // 缓存读取费用
  const cacheReadCost = input.cacheReadTokens && pricing.cacheRead
    ? (input.cacheReadTokens * pricing.cacheRead) / MILLION
    : 0;

  // 缓存写入费用
  const cacheWriteCost = input.cacheCreationTokens && pricing.cacheWrite
    ? (input.cacheCreationTokens * pricing.cacheWrite) / MILLION
    : 0;

  const totalCost = inputCost + outputCost + cacheReadCost + cacheWriteCost;

  // 保留 8 位小数，避免浮点精度问题
  return Math.round(totalCost * 100_000_000) / 100_000_000;
}

/**
 * 重新加载定价配置
 *
 * 用于热更新定价配置
 */
export function reloadPricing(): void {
  pricingConfig = null;
  getPricingConfig();
  logger.info('Model pricing config reloaded');
}

/**
 * 获取所有模型名称
 */
export function getAllModelNames(): string[] {
  const config = getPricingConfig();
  return Object.keys(config.models);
}
