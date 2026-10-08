import { InitialSchema1791217121849 } from './1791217121849-InitialSchema';
import { CreateCases1791407902997 } from './1791407902997-CreateCases';

// Explicit list (not a glob) so the same code works from src/ under ts-jest and from dist/.
export const MIGRATIONS = [InitialSchema1791217121849, CreateCases1791407902997];
