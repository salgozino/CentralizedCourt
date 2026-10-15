/** Current time for draw and voting rules. Overridden in tests so deadlines can be crossed without waiting. */
export type Clock = () => Date;
export const CLOCK = 'CLOCK';
export const systemClock: Clock = () => new Date();
