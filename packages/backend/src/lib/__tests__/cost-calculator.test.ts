import { describe, it, expect, beforeEach } from 'vitest';
import { calculateCost, getModelPricing, reloadPricing, getAllModelNames } from '../cost-calculator.js';

describe('cost-calculator', () => {
  beforeEach(() => {
    reloadPricing();
  });

  describe('getModelPricing', () => {
    it('should return pricing for claude-opus-4-5-thinking', () => {
      const pricing = getModelPricing('claude-opus-4-5-thinking');
      expect(pricing).not.toBeNull();
      expect(pricing?.input).toBe(5.0);
      expect(pricing?.output).toBe(25.0);
      expect(pricing?.cacheRead).toBe(0.5);
      expect(pricing?.cacheWrite).toBe(6.25);
    });

    it('should return pricing for claude-sonnet-4-5-thinking', () => {
      const pricing = getModelPricing('claude-sonnet-4-5-thinking');
      expect(pricing).not.toBeNull();
      expect(pricing?.input).toBe(3.3);
      expect(pricing?.output).toBe(16.5);
    });

    it('should return pricing for gemini-3-flash', () => {
      const pricing = getModelPricing('gemini-3-flash');
      expect(pricing).not.toBeNull();
      expect(pricing?.input).toBe(0.5);
      expect(pricing?.output).toBe(3.0);
      expect(pricing?.cacheRead).toBe(0.05);
    });

    it('should return pricing for kiro models', () => {
      const opus = getModelPricing('claude-opus-4.5');
      expect(opus).not.toBeNull();
      expect(opus?.input).toBe(5.0);

      const sonnet = getModelPricing('claude-sonnet-4.5');
      expect(sonnet).not.toBeNull();
      expect(sonnet?.input).toBe(3.3);

      const haiku = getModelPricing('claude-haiku-4.5');
      expect(haiku).not.toBeNull();
      expect(haiku?.input).toBe(1.1);
    });

    it('should return null for unknown model', () => {
      const pricing = getModelPricing('unknown-model');
      expect(pricing).toBeNull();
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost for basic input/output tokens', () => {
      // claude-opus-4-5-thinking: input $5/1M, output $25/1M
      const cost = calculateCost({
        targetModel: 'claude-opus-4-5-thinking',
        inputTokens: 1000,
        outputTokens: 500,
      });

      // 1000 * 5 / 1_000_000 + 500 * 25 / 1_000_000
      // = 0.005 + 0.0125 = 0.0175
      expect(cost).toBe(0.0175);
    });

    it('should calculate cost with cache read tokens', () => {
      // claude-opus-4-5-thinking: input $5/1M, output $25/1M, cacheRead $0.5/1M
      const cost = calculateCost({
        targetModel: 'claude-opus-4-5-thinking',
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 2000,
      });

      // 1000 * 5 / 1M + 500 * 25 / 1M + 2000 * 0.5 / 1M
      // = 0.005 + 0.0125 + 0.001 = 0.0185
      expect(cost).toBe(0.0185);
    });

    it('should calculate cost with cache creation tokens', () => {
      // claude-opus-4-5-thinking: cacheWrite $6.25/1M
      const cost = calculateCost({
        targetModel: 'claude-opus-4-5-thinking',
        inputTokens: 1000,
        outputTokens: 500,
        cacheCreationTokens: 1000,
      });

      // 1000 * 5 / 1M + 500 * 25 / 1M + 1000 * 6.25 / 1M
      // = 0.005 + 0.0125 + 0.00625 = 0.02375
      expect(cost).toBe(0.02375);
    });

    it('should calculate cost with all token types', () => {
      const cost = calculateCost({
        targetModel: 'claude-opus-4-5-thinking',
        inputTokens: 10000,
        outputTokens: 5000,
        cacheReadTokens: 20000,
        cacheCreationTokens: 5000,
      });

      // input: 10000 * 5 / 1M = 0.05
      // output: 5000 * 25 / 1M = 0.125
      // cacheRead: 20000 * 0.5 / 1M = 0.01
      // cacheWrite: 5000 * 6.25 / 1M = 0.03125
      // total = 0.21625
      expect(cost).toBe(0.21625);
    });

    it('should return 0 for unknown model', () => {
      const cost = calculateCost({
        targetModel: 'unknown-model',
        inputTokens: 1000,
        outputTokens: 500,
      });

      expect(cost).toBe(0);
    });

    it('should handle zero tokens', () => {
      const cost = calculateCost({
        targetModel: 'claude-opus-4-5-thinking',
        inputTokens: 0,
        outputTokens: 0,
      });

      expect(cost).toBe(0);
    });

    it('should handle large token counts without precision issues', () => {
      // Test with 1 million tokens
      const cost = calculateCost({
        targetModel: 'claude-opus-4-5-thinking',
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      });

      // 1M * 5 / 1M + 1M * 25 / 1M = 5 + 25 = 30
      expect(cost).toBe(30);
    });

    it('should calculate cost for gemini-3-flash correctly', () => {
      const cost = calculateCost({
        targetModel: 'gemini-3-flash',
        inputTokens: 100000,
        outputTokens: 10000,
      });

      // input: 100000 * 0.5 / 1M = 0.05
      // output: 10000 * 3.0 / 1M = 0.03
      // total = 0.08
      expect(cost).toBe(0.08);
    });

    it('should calculate cost for claude-haiku-4.5 correctly', () => {
      const cost = calculateCost({
        targetModel: 'claude-haiku-4.5',
        inputTokens: 100000,
        outputTokens: 10000,
        cacheReadTokens: 50000,
      });

      // input: 100000 * 1.1 / 1M = 0.11
      // output: 10000 * 5.5 / 1M = 0.055
      // cacheRead: 50000 * 0.11 / 1M = 0.0055
      // total = 0.1705
      expect(cost).toBe(0.1705);
    });
  });

  describe('getAllModelNames', () => {
    it('should return all model names', () => {
      const models = getAllModelNames();

      expect(models).toContain('claude-opus-4-5-thinking');
      expect(models).toContain('claude-sonnet-4-5-thinking');
      expect(models).toContain('gemini-3-flash');
      expect(models).toContain('gemini-3-pro-high');
      expect(models).toContain('claude-opus-4.5');
      expect(models).toContain('claude-sonnet-4.5');
      expect(models).toContain('claude-haiku-4.5');
      // Model list can grow as pricing config expands.
      expect(models.length).toBeGreaterThanOrEqual(7);
    });
  });

  describe('reloadPricing', () => {
    it('should reload pricing configuration', () => {
      // First call to get cached config
      const models1 = getAllModelNames();

      // Reload
      reloadPricing();

      // Get models again
      const models2 = getAllModelNames();

      // Should have same models
      expect(models1).toEqual(models2);
    });
  });
});
