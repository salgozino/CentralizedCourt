import { z } from 'zod';

import { Case, CaseJuror, CaseStatus, SELECTION_METHODS, SelectionMethod } from '../entities';

export const MIN_VOTE_WINDOW_SECONDS = 60;
export const MAX_VOTE_WINDOW_SECONDS = 30 * 24 * 60 * 60;
export const MAX_PANEL_SIZE = 11;

const isUniqueIgnoringCase = (labels: string[]) => new Set(labels.map((l) => l.toLowerCase())).size === labels.length;

/** Unknown fields are rejected (422), so a client cannot slip in status, result or evidence. */
export const CreateCaseIn = z
  .strictObject({
    refusalWindowSeconds: z.number().int().min(60).max(MAX_VOTE_WINDOW_SECONDS).optional(),
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().min(1).max(5000),
    outcomes: z
      .array(z.string().trim().min(1).max(100))
      .min(2)
      .max(10)
      .refine(isUniqueIgnoringCase, 'Outcomes must be unique (case-insensitive)'),
    voteWindowSeconds: z.number().int().min(MIN_VOTE_WINDOW_SECONDS).max(MAX_VOTE_WINDOW_SECONDS),
    panelSize: z
      .number()
      .int()
      .min(1)
      .max(MAX_PANEL_SIZE)
      .refine((n) => n % 2 === 1, 'Panel size must be odd')
      .default(3),
    selectionMethod: z.enum(SELECTION_METHODS).default('random'),
  })
  .superRefine((value, ctx) => {
    if ((value.selectionMethod === 'manual') !== (value.refusalWindowSeconds !== undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['refusalWindowSeconds'],
        message: 'Refusal duration is required only for manual selection',
      });
    }
  });
export type CreateCaseIn = z.infer<typeof CreateCaseIn>;

/** Empty for random cases; manual cases list exactly panelSize distinct user ids, in panel order. */
export const DrawIn = z.strictObject({
  jurorIds: z
    .array(z.number().int().positive())
    .max(MAX_PANEL_SIZE)
    .refine((ids) => new Set(ids).size === ids.length, 'Juror ids must be distinct')
    .optional(),
});
export type DrawIn = z.infer<typeof DrawIn>;

/** A final vote: the index of one of the case outcomes (checked against the case by the controller). */
export const VoteIn = z.strictObject({
  outcomeIndex: z.number().int().min(0),
});
export type VoteIn = z.infer<typeof VoteIn>;

export interface CaseOut {
  id: number;
  creatorId: number;
  title: string;
  description: string;
  outcomes: string[];
  voteWindowSeconds: number;
  refusalWindowSeconds: number | null;
  panelSize: number;
  selectionMethod: SelectionMethod;
  status: CaseStatus;
  result: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const toCaseOut = (c: Case): CaseOut => ({
  id: c.id,
  creatorId: c.creatorId,
  title: c.title,
  description: c.description,
  outcomes: c.outcomes,
  voteWindowSeconds: c.voteWindowSeconds,
  refusalWindowSeconds: c.refusalWindowSeconds,
  panelSize: c.panelSize,
  selectionMethod: c.selectionMethod,
  status: c.status,
  result: c.result,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

export interface CaseDetailOut extends CaseOut {
  jurors: JurorOut[];
  assignmentHistory?: AssignmentOut[];
}

export interface JurorOut {
  jurorId: number;
  name: string;
  drawnAt: Date;
  deadline: Date;
  hasVoted: boolean;
  /** The juror's choice: public once the case is resolved; before that only the juror sees their own. */
  outcomeIndex: number | null;
}

/** Expects `user` to be loaded. `revealVote` decides whether the chosen outcome is shown to this viewer. */
export const toJurorOut = (j: CaseJuror, revealVote: boolean): JurorOut => ({
  jurorId: j.userId,
  name: j.user.name,
  drawnAt: j.drawnAt,
  deadline: j.deadline,
  hasVoted: j.outcomeIndex !== null,
  outcomeIndex: revealVote ? j.outcomeIndex : null,
});

/** A juror who can be picked for a manual panel: id and name only, never an email. */
export interface EligibleJurorOut {
  jurorId: number;
  name: string;
}

export interface DrawOut {
  case: CaseDetailOut;
  jurors: JurorOut[];
  assignmentHistory?: AssignmentOut[];
}

export const ReplaceIn = z.strictObject({
  position: z
    .number()
    .int()
    .min(0)
    .max(MAX_PANEL_SIZE - 1),
  jurorId: z.number().int().positive(),
});
export const RefuseIn = z.strictObject({});
export interface AssignmentOut {
  id: number;
  position: number;
  jurorId: number;
  name: string;
  selectedById: number | null;
  selectedByName: string | null;
  predecessorId: number | null;
  drawnAt: Date;
  refusalDeadline: Date | null;
  refusedAt: Date | null;
}
export const toAssignmentOut = (j: CaseJuror): AssignmentOut => ({
  id: j.id,
  position: j.position,
  jurorId: j.userId,
  name: j.user.name,
  selectedById: j.selectedById,
  selectedByName: j.selectedBy?.name ?? null,
  predecessorId: j.predecessorId,
  drawnAt: j.drawnAt,
  refusalDeadline: j.refusalDeadline,
  refusedAt: j.refusedAt,
});
