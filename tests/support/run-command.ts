/** Run a host command synchronously from the package root, for tests that drive the built tools. */
export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export const packageRoot = new URL("../..", import.meta.url).pathname;

export const runCommand = (
  command: ReadonlyArray<string>,
  cwd: string = packageRoot,
): CommandResult => {
  const result = Bun.spawnSync([...command], {
    cwd,
    env: process.env,
    stderr: "pipe",
    stdout: "pipe",
  });
  const decoder = new TextDecoder();
  return {
    exitCode: result.exitCode,
    stdout: decoder.decode(result.stdout),
    stderr: decoder.decode(result.stderr),
  };
};
