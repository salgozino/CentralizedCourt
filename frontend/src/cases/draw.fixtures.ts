import type { Case, DrawResult } from '../api';

export const votingCase: Case = {
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
};

/** Same shape as the backend `DrawOut`: jurors carry `jurorId` and `name`, never an email. */
export const drawResult: DrawResult = {
  case: votingCase,
  jurors: [
    {
      jurorId: 5,
      name: 'Juror 1',
      drawnAt: '2026-10-08T10:00:00.000Z',
      deadline: '2026-10-09T10:00:00.000Z',
    },
    {
      jurorId: 8,
      name: 'Juror 4',
      drawnAt: '2026-10-08T10:00:00.000Z',
      deadline: '2026-10-09T10:00:00.000Z',
    },
    {
      jurorId: 6,
      name: 'Juror 2',
      drawnAt: '2026-10-08T10:00:00.000Z',
      deadline: '2026-10-09T10:00:00.000Z',
    },
  ],
};
