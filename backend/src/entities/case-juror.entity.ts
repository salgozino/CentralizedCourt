import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { Case } from './case.entity';
import { User } from './user.entity';

/** A juror drawn (or manually assigned) to a case; their vote window starts at drawnAt. */
@Entity('case_jurors')
@Index(['caseId', 'userId'], { unique: true })
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

  /** drawnAt + the case's voteWindowSeconds. */
  @Column({ type: 'datetime' })
  deadline: Date;
}
