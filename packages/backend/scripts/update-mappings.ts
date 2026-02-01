import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 更新 sonnet 映射到 claude-opus-4-5-thinking
  const updated = await prisma.apiKeyModelMapping.updateMany({
    where: {
      claudeModel: 'sonnet',
      targetModel: 'claude-sonnet-4-5',
    },
    data: {
      targetModel: 'claude-opus-4-5-thinking',
    },
  });
  console.log(`Updated ${updated.count} sonnet mappings to claude-opus-4-5-thinking`);

  // 更新 haiku 映射到 claude-opus-4-5-thinking
  const updatedHaiku = await prisma.apiKeyModelMapping.updateMany({
    where: {
      claudeModel: 'haiku',
      targetModel: 'claude-sonnet-4-5',
    },
    data: {
      targetModel: 'claude-opus-4-5-thinking',
    },
  });
  console.log(`Updated ${updatedHaiku.count} haiku mappings to claude-opus-4-5-thinking`);

  // 显示更新后的映射
  const mappings = await prisma.apiKeyModelMapping.findMany({
    include: { apiKey: { select: { name: true } } },
  });
  console.log('\nUpdated Model Mappings:');
  mappings.forEach((m) => {
    console.log(`  ${m.claudeModel} -> ${m.platform}/${m.targetModel}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
