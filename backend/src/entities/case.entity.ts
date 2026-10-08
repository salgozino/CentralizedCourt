import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from './user.entity';

export const CASE_STATUSES = ['awaiting_jurors', 'voting', 'resolved'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const SELECTION_METHODS = ['random', 'manual'] as const;
export type SelectionMethod = (typeof SELECTION_METHODS)[number];

/** A dispute. Immutable after creation except for status/result, which later slices advance. */
@Entity('cases')
export class Case {
  @PrimaryGeneratedColumn()
  id: number;

  /** Visibility follows ownership: the creator keeps seeing the case even if their creator role is removed. */
  @Index()
  @Column({ type: 'integer' })
  creatorId: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'creatorId' })
  creator: User;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  /** Outcome labels in the creator's order; votes will reference a label. */
  @Column({ type: 'simple-json' })
  outcomes: string[];

  /** Each juror's deadline is their draw time plus this window. */
  @Column({ type: 'integer' })
  voteWindowSeconds: number;

  /** Number of jurors (one vote each). */
  @Column({ type: 'smallint', default: 3 })
  panelSize: number;

  @Column({ type: 'varchar', length: 10, default: 'random' })
  selectionMethod: SelectionMethod;

  @Column({ type: 'varchar', length: 20, default: 'awaiting_jurors' })
  status: CaseStatus;

  /** Winning outcome label, set when the case is resolved. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  result: string | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
