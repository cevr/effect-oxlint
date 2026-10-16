// Probes for requireForceKillAfter's array-parameter reading (O3).
import { ChildProcess } from "effect/process";

interface Options {
  readonly cwd?: string;
  readonly forceKillAfter?: string;
}

// P1: options parameter typed as an object: may hold forceKillAfter, must pass.
export const p1 = (cmd: string, args: ReadonlyArray<string>, options: Options) =>
  ChildProcess.make(cmd, args, options);

// P2: rest parameter as the arguments, no options: true report.
export const p2 = (cmd: string, ...args: string[]) => ChildProcess.make(cmd, args);

// P3: array parameter with options naming forceKillAfter: must pass.
export const p3 = (cmd: string, args: string[]) =>
  ChildProcess.make(cmd, args, { forceKillAfter: "1 second" });

// P4: a union-typed parameter: may hold the options, must pass.
export const p4 = (cmd: string, args: string[] | Options) => ChildProcess.make(cmd, args as never);

// P5: a union-typed parameter passed bare: may hold the options, must pass.
export const p5 = (cmd: string, second: ReadonlyArray<string> | Options) =>
  // @ts-expect-error probe
  ChildProcess.make(cmd, second);

// P6: a tuple-typed parameter is an array: report expected (no options).
export const p6 = (cmd: string, args: [string, string]) => ChildProcess.make(cmd, args);

// P7: an optional array parameter with a fallback: the arguments, no options.
export const p7 = (cmd: string, args?: ReadonlyArray<string>) => ChildProcess.make(cmd, args ?? []);

// P8: a parameter named like options but typed as an array: the arguments.
export const p8 = (cmd: string, options: Array<string>) => ChildProcess.make(cmd, options);

// P9: an untyped parameter: may hold the options, must pass.
export const p9 = (cmd: string, rest: any) => ChildProcess.make(cmd, rest);

// P10: a generic parameter: may hold the options, must pass.
export const p10 = <T>(cmd: string, rest: T) => ChildProcess.make(cmd, rest as never);
