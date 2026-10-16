// Counsel's B5: requireForceKillAfter on a command whose kill signal is SIGKILL.
import { ChildProcess } from "effect/process";
// K1: SIGKILL first: no child can ignore it.
export const hard = ChildProcess.make("git", ["status"], { killSignal: "SIGKILL" });
// K2: SIGINT: the spawner sends SIGINT, not SIGTERM.
export const int = ChildProcess.make("git", ["status"], { killSignal: "SIGINT" });
// K3: for contrast, the default signal and no forceKillAfter.
export const plain = ChildProcess.make("git", ["status"], { cwd: "." });
