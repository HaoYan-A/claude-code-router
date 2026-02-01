import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const quotas = await prisma.accountQuota.findMany({
    where: { modelName: 'claude-sonnet-4-5' },
    include: { account: { select: { name: true, isActive: true, schedulable: true, status: true } } },
  });
  console.log('Claude Sonnet 4.5 Quotas:');
  quotas.forEach((q) => {
    console.log(`  ${q.account.name}: ${q.percentage}% (active=${q.account.isActive}, schedulable=${q.account.schedulable}, status=${q.account.status})`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
