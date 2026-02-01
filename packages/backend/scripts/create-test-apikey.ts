import { PrismaClient } from '@prisma/client';
import { randomBytes, createHash } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const userId = '790aa18e-5c30-4031-80af-a2b29939ce34'; // HaoYan-A

  // 生成 API Key
  const rawKey = `ccr_${randomBytes(32).toString('hex')}`;
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, 8);

  // 创建 API Key，配置模型映射
  const apiKey = await prisma.apiKey.create({
    data: {
      userId,
      name: 'Test Key - Sonnet to Claude 4.5',
      keyHash,
      keyPrefix,
      modelMappings: {
        create: [
          {
            claudeModel: 'sonnet',
            platform: 'antigravity',
            targetModel: 'claude-sonnet-4-5',
          },
          {
            claudeModel: 'opus',
            platform: 'antigravity',
            targetModel: 'claude-opus-4-5-thinking',
          },
          {
            claudeModel: 'haiku',
            platform: 'antigravity',
            targetModel: 'claude-sonnet-4-5', // haiku 也映射到 sonnet
          },
        ],
      },
    },
    include: { modelMappings: true },
  });

  console.log('Created API Key:');
  console.log('================');
  console.log('ID:', apiKey.id);
  console.log('Name:', apiKey.name);
  console.log('Raw Key (save this!):', rawKey);
  console.log('Key Prefix:', keyPrefix);
  console.log('\nModel Mappings:');
  apiKey.modelMappings.forEach((m) => {
    console.log(`  ${m.claudeModel} -> ${m.platform}/${m.targetModel}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
