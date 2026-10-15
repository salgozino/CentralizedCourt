import { InitialSchema1791217121849 } from './1791217121849-InitialSchema';
import { CreateCases1791407902997 } from './1791407902997-CreateCases';
import { CreateCaseJurors1791480908801 } from './1791480908801-CreateCaseJurors';
import { AddUserName1791572083979 } from './1791572083979-AddUserName';
import { AddJurorVotes1791900000000 } from './1791900000000-AddJurorVotes';
import { AddRefusal1792000000000 } from './1792000000000-AddRefusal';

// Explicit list (not a glob) so the same code works from src/ under ts-jest and from dist/.
export const MIGRATIONS = [
  InitialSchema1791217121849,
  CreateCases1791407902997,
  CreateCaseJurors1791480908801,
  AddUserName1791572083979,
  AddJurorVotes1791900000000,
  AddRefusal1792000000000,
];
