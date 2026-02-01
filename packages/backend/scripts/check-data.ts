import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 查看用户
  const users = await prisma.user.findMany();
  console.log('Users:', JSON.stringify(users, null, 2));

  // 查看 API Keys
  const apiKeys = await prisma.apiKey.findMany({ include: { modelMappings: true } });
  console.log('\nAPI Keys:', JSON.stringify(apiKeys, null, 2));

  // 查看账号
  const accounts = await prisma.thirdPartyAccount.findMany({ include: { quotas: true } });
  console.log('\nAccounts:', JSON.stringify(accounts, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
