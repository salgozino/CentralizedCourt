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

export const drawResult: DrawResult = {
  case: votingCase,
  jurors: [
    {
      userId: 5,
      email: 'juror1@example.com',
      drawnAt: '2026-10-08T10:00:00.000Z',
      deadline: '2026-10-09T10:00:00.000Z',
    },
    {
      userId: 8,
      email: 'juror4@example.com',
      drawnAt: '2026-10-08T10:00:00.000Z',
      deadline: '2026-10-09T10:00:00.000Z',
    },
    {
      userId: 6,
      email: 'juror2@example.com',
      drawnAt: '2026-10-08T10:00:00.000Z',
      deadline: '2026-10-09T10:00:00.000Z',
    },
  ],
};
