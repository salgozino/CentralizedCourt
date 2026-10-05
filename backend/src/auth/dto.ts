import { z } from 'zod';
import { User } from '../entities';

export const RequestCodeIn = z.object({ email: z.string() });
export const VerifyIn = z.object({ email: z.string(), code: z.string() });

export interface UserOut {
  id: number;
  email: string;
  roles: string[];
}

export const toUserOut = (user: User): UserOut => ({ id: user.id, email: user.email, roles: user.roles });
