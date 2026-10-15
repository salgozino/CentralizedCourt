import type { CaseDetail, DrawResult, DrawnJuror } from '../api';

/** The seated panel in draw order, as the backend returns it: `jurorId` and `name`, never an email; no votes yet. */
export const drawnJurors: DrawnJuror[] = [
  {
    jurorId: 5,
    name: 'Juror 1',
    drawnAt: '2026-10-08T10:00:00.000Z',
    deadline: '2026-10-09T10:00:00.000Z',
    hasVoted: false,
    outcomeIndex: null,
  },
  {
    jurorId: 8,
    name: 'Juror 4',
    drawnAt: '2026-10-08T10:00:00.000Z',
    deadline: '2026-10-09T10:00:00.000Z',
    hasVoted: false,
    outcomeIndex: null,
  },
  {
    jurorId: 6,
    name: 'Juror 2',
    drawnAt: '2026-10-08T10:00:00.000Z',
    deadline: '2026-10-09T10:00:00.000Z',
    hasVoted: false,
    outcomeIndex: null,
  },
];

export const votingCase: CaseDetail = {
  id: 7,
  creatorId: 2,
  title: 'Late delivery dispute',
  description: 'The seller shipped two weeks after the agreed date.',
  outcomes: ['Buyer', 'Seller'],
  voteWindowSeconds: 86400,
  panelSize: 3,
  selectionMethod: 'random',
  status: 'voting',
  result: null,
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-08T10:00:00.000Z',
  jurors: drawnJurors,
};

/** Same shape as the backend `DrawOut`: the case (now `voting`, with its panel) and the panel again. */
export const drawResult: DrawResult = { case: votingCase, jurors: drawnJurors };
