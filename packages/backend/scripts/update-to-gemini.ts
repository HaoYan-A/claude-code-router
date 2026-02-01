import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 更新 sonnet 映射到 gemini-3-pro
  const updated = await prisma.apiKeyModelMapping.updateMany({
    where: {
      claudeModel: 'sonnet',
    },
    data: {
      targetModel: 'gemini-3-pro',
    },
  });
  console.log(`Updated ${updated.count} sonnet mappings to gemini-3-pro`);

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
