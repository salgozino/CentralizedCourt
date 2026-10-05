import { Body, Controller, Get, NotFoundException, Param, Put, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { z } from 'zod';
import { CsrfGuard } from '../auth/csrf.guard';
import { UserOut, toUserOut } from '../auth/dto';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { User } from '../entities';
import { UnprocessableException } from '../http/errors';
import { ZodBodyPipe } from '../http/validation';
import { AdminGuard } from './admin.guard';

const RolesIn = z.object({ roles: z.array(z.enum(['creator', 'juror'])) });

/** Like ninja's `user_id: int`: digits only (optional sign), anything else is a 422. */
const parseUserId = (raw: string): number => {
  if (!/^[+-]?\d+$/.test(raw)) {
    throw new UnprocessableException([
      { type: 'int_parsing', loc: ['path', 'user_id'], msg: 'Input should be a valid integer, unable to parse string as an integer' },
    ]);
  }
  return Number(raw);
};

/** Guard order matters: authenticate (401), CSRF (403), admin (403); pipes only run after all guards pass. */
@Controller('admin')
@UseGuards(SessionAuthGuard, CsrfGuard, AdminGuard)
export class AdminController {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  @Get('users')
  async list(): Promise<UserOut[]> {
    return (await this.users.find({ order: { id: 'ASC' } })).map(toUserOut);
  }

  @Put('users/:userId/roles')
  async setRoles(@Param('userId') rawId: string, @Body(new ZodBodyPipe(RolesIn)) payload: z.infer<typeof RolesIn>): Promise<UserOut> {
    const id = parseUserId(rawId);
    // Beyond 2^53 the id cannot exist anyway (and would not round-trip through Number).
    const user = Number.isSafeInteger(id) ? await this.users.findOneBy({ id }) : null;
    if (!user) throw new NotFoundException('Not Found');
    user.isCreator = payload.roles.includes('creator');
    user.isJuror = payload.roles.includes('juror');
    await this.users.save(user);
    return toUserOut(user);
  }
}
