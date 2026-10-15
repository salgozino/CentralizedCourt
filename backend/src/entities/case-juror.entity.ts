import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { Case } from './case.entity';
import { User } from './user.entity';

/** A durable assignment. Refused rows remain history; only rows with refusedAt=null grant a current seat. */
@Entity('case_jurors')
@Index(['caseId', 'userId'], { unique: true })
@Index('current_case_seat', ['caseId', 'position'], { unique: true, where: '"refusedAt" IS NULL' })
@Index('assignment_successor', ['predecessorId'], { unique: true, where: '"predecessorId" IS NOT NULL' })
export class CaseJuror {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  caseId: number;

  @ManyToOne(() => Case, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'caseId' })
  case: Case;

  @Index()
  @Column({ type: 'integer' })
  userId: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** Draw order, so manual assignments come back in the order given. */
  @Column({ type: 'smallint' })
  position: number;

  @Column({ type: 'datetime' })
  drawnAt: Date;

  /** Voting deadline; recalculated for the whole current panel when refusal ends. */
  @Column({ type: 'datetime' })
  deadline: Date;

  @Column({ type: 'integer', nullable: true })
  selectedById: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'selectedById' })
  selectedBy: User | null;

  @Column({ type: 'integer', nullable: true })
  predecessorId: number | null;

  @ManyToOne(() => CaseJuror, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'predecessorId' })
  predecessor: CaseJuror | null;

  @Column({ type: 'datetime', nullable: true })
  refusalDeadline: Date | null;

  @Column({ type: 'datetime', nullable: true })
  refusedAt: Date | null;

  /** Index into the case's outcomes; null until this juror votes. */
  @Column({ type: 'smallint', nullable: true })
  outcomeIndex: number | null;

  @Column({ type: 'datetime', nullable: true })
  votedAt: Date | null;
}
