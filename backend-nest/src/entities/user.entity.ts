import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export const EXTRA_ROLES = ['creator', 'juror'] as const;

// Applied on write and on find() conditions, so lookups are case-insensitive too.
const lowercase = {
  to: (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : value),
  from: (value: unknown) => value,
};

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 254, unique: true, transformer: lowercase })
  email: string;

  @Column({ type: 'boolean', default: false })
  isAdmin: boolean;

  @Column({ type: 'boolean', default: false })
  isCreator: boolean;

  @Column({ type: 'boolean', default: false })
  isJuror: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'datetime' })
  dateJoined: Date;

  @Column({ type: 'datetime', nullable: true })
  lastLogin: Date | null;

  /** Sorted, always includes "user" (same as Django's User.roles). */
  get roles(): string[] {
    const roles = new Set<string>(['user']);
    if (this.isAdmin) roles.add('admin');
    if (this.isCreator) roles.add('creator');
    if (this.isJuror) roles.add('juror');
    return [...roles].sort();
  }
}
