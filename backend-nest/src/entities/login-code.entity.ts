import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('login_codes')
export class LoginCode {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  userId: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 64 })
  codeHash: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @Column({ type: 'datetime' })
  expiresAt: Date;

  @Column({ type: 'datetime', nullable: true })
  usedAt: Date | null;

  @Column({ type: 'smallint', default: 0 })
  failedAttempts: number;
}
