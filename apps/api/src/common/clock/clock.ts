import { Global, Module } from "@nestjs/common";

/**
 * The current time, injected so date rules ("today") can be tested at any
 * moment — e.g. just after midnight in Zurich. Tests override it.
 */
export const CLOCK = Symbol("CLOCK");
export type Clock = () => Date;

/** The association's local time zone: "today" for follow-ups is Zurich's date, not the server's (UTC). */
export const APP_TIME_ZONE = "Europe/Zurich";

const zurichDay = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** The calendar date (YYYY-MM-DD) in Europe/Zurich at `now`. */
export function zurichDate(now: Date): string {
  return zurichDay.format(now);
}

@Global()
@Module({
  providers: [{ provide: CLOCK, useValue: (() => new Date()) satisfies Clock }],
  exports: [CLOCK],
})
export class ClockModule {}
