// Counsel's B7: noInterruptibleMemo on a namespace named Effect that is not effect's.
import * as Effect from "./memo.js";
declare const load: unknown;
export const memo = Effect.cached(load);
