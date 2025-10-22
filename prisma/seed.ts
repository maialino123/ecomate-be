import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Get owner email from environment
  const ownerEmail = process.env.OWNER_EMAIL || 'owner@ecomate.com';
  const ownerPassword = 'Lmmt9981';

  // Delete existing owner if exists (to avoid duplicates)
  const existingOwner = await prisma.user.findFirst({
    where: { role: 'OWNER' },
  });

  if (existingOwner) {
    console.log(`⚠️  Owner account already exists: ${existingOwner.email}`);
    console.log('Deleting existing owner to recreate...');
    await prisma.user.delete({ where: { id: existingOwner.id } });
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(ownerPassword, 10);

  // Create Owner account
  const owner = await prisma.user.create({
    data: {
      email: ownerEmail,
      password: hashedPassword,
      username: 'Owner',
      firstName: 'Owner',
      lastName: 'Ecomate',
      role: 'OWNER',
      status: 'ACTIVE',
      require2FA: true,
    },
  });

  console.log('✅ Owner account created successfully!');
  console.log(`   Email: ${owner.email}`);
  console.log(`   Username: ${owner.username}`);
  console.log(`   Role: ${owner.role}`);
  console.log(`   2FA Enabled: ${owner.require2FA}`);
  console.log(`   Password: Lmmt9981`);
  console.log('\n⚠️  IMPORTANT: Change the owner password after first login!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
