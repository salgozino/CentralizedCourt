import { DataSource } from 'typeorm';
import { User } from '../entities';

// email -> extra roles (the base "user" role is implicit).
export const SEED_USERS: Record<string, Array<'admin' | 'creator' | 'juror'>> = {
  'admin@example.com': ['admin'],
  'creator1@example.com': ['creator'],
  'creator2@example.com': ['creator'],
  'juror1@example.com': ['juror'],
  'juror2@example.com': ['juror'],
  'juror3@example.com': ['juror'],
  'juror4@example.com': ['juror'],
  'juror5@example.com': ['juror'],
  'user@example.com': [],
};

/** Idempotent: existing users are left untouched (roles included). */
export async function seedUsers(dataSource: DataSource): Promise<{ created: number; existing: number }> {
  const repo = dataSource.getRepository(User);
  let created = 0;
  for (const [email, extra] of Object.entries(SEED_USERS)) {
    if (await repo.existsBy({ email })) continue;
    await repo.insert({
      email,
      isAdmin: extra.includes('admin'),
      isCreator: extra.includes('creator'),
      isJuror: extra.includes('juror'),
    });
    created += 1;
  }
  return { created, existing: Object.keys(SEED_USERS).length - created };
}
