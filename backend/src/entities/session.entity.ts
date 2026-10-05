import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('sessions')
export class Session {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'simple-json' })
  data: Record<string, unknown>;

  @Index()
  @Column({ type: 'datetime' })
  expiresAt: Date;
}
