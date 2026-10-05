import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type LoginEventKind = 'request' | 'failure';

/** Per-IP record of code requests and failed verifications, used for throttling. */
@Entity('login_events')
@Index(['ip', 'kind', 'createdAt'])
export class LoginEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 45 })
  ip: string;

  @Column({ type: 'varchar', length: 10 })
  kind: LoginEventKind;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
