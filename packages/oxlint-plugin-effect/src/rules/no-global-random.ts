/**
 * Ban `Math.random()` and `crypto.randomUUID()`.
 *
 * Use Effect Random service instead.
 *
 * Source: language-service/globalRandom, language-service/cryptoRandomUUID
 */
import { Rule } from "../vendor/effect-oxlint/index.js"

export const noGlobalRandom = Rule.banMultiple({
  name: "no-global-random",
  meta: { type: "suggestion" },
  specs: [
    { type: "member", object: "Math", property: "random", message: "Avoid Math.random(). Use Random service from 'effect'." },
    { type: "member", object: "crypto", property: ["randomUUID", "getRandomValues"], message: "Avoid crypto.randomUUID(). Use Random service from 'effect'." },
    { type: "member", object: "Bun", property: ["randomUUIDv7", "randomUUID"], message: "Avoid Bun.randomUUID(). Create a platform-independent service with Bun and Node layers." },
  ],
})
