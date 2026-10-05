import { LoginCode } from './login-code.entity';
import { LoginEvent } from './login-event.entity';
import { Session } from './session.entity';
import { User } from './user.entity';

export const ENTITIES = [User, LoginCode, LoginEvent, Session];
export { LoginCode, LoginEvent, Session, User };
