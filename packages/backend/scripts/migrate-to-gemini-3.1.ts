import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Migrating → gemini-3.1-pro-preview ===\n');

  // 1. 更新 ApiKeyModelMapping（覆盖旧名 gemini-3-pro-high 和中间态 gemini-3.1-pro）
  const mappings1 = await prisma.apiKeyModelMapping.updateMany({
    where: { targetModel: 'gemini-3-pro-high' },
    data: { targetModel: 'gemini-3.1-pro-preview' },
  });
  const mappings2 = await prisma.apiKeyModelMapping.updateMany({
    where: { targetModel: 'gemini-3.1-pro' },
    data: { targetModel: 'gemini-3.1-pro-preview' },
  });
  console.log(`[ApiKeyModelMapping] Updated ${mappings1.count + mappings2.count} rows`);

  // 2. 更新 AccountQuota — 需要处理唯一约束冲突
  // 先找出哪些账户同时拥有旧名和新名的配额记录
  const oldQuotas = await prisma.accountQuota.findMany({
    where: { modelName: { in: ['gemini-3-pro-high', 'gemini-3.1-pro'] } },
  });
  const newQuotas = await prisma.accountQuota.findMany({
    where: { modelName: 'gemini-3.1-pro-preview' },
  });
  const newQuotaAccountIds = new Set(newQuotas.map((q) => q.accountId));

  let deletedCount = 0;
  let updatedCount = 0;

  for (const oldQ of oldQuotas) {
    if (newQuotaAccountIds.has(oldQ.accountId)) {
      // 该账户已有 gemini-3.1-pro-preview 配额，删除旧记录
      await prisma.accountQuota.delete({ where: { id: oldQ.id } });
      deletedCount++;
    } else {
      // 该账户没有新配额，直接重命名
      await prisma.accountQuota.update({
        where: { id: oldQ.id },
        data: { modelName: 'gemini-3.1-pro-preview' },
      });
      newQuotaAccountIds.add(oldQ.accountId); // 防止同一账户的第二条旧记录冲突
      updatedCount++;
    }
  }
  console.log(`[AccountQuota] Updated ${updatedCount}, deleted ${deletedCount} conflicting rows`);

  // 3. 显示最终状态
  const finalMappings = await prisma.apiKeyModelMapping.findMany({
    where: { targetModel: 'gemini-3.1-pro-preview' },
    include: { apiKey: { select: { name: true } } },
  });
  console.log(`\nFinal gemini-3.1-pro-preview mappings (${finalMappings.length}):`);
  for (const m of finalMappings) {
    console.log(`  ${m.claudeModel} → ${m.platform}/${m.targetModel} (key: ${m.apiKey.name})`);
  }

  console.log('\n=== Migration complete ===');
}

main().catch(console.error).finally(() => prisma.$disconnect());
