import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const mappings = await prisma.apiKeyModelMapping.findMany({
    include: { apiKey: { select: { name: true } } },
  });
  console.log('Model Mappings:');
  mappings.forEach((m) => {
    console.log(`  ${m.claudeModel} -> ${m.platform}/${m.targetModel} (API Key: ${m.apiKey.name})`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
