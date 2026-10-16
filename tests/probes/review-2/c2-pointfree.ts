// Counsel's B3: noPointFreeLog on a logger that is not the callback.
// P1: the logger is forEach's thisArg; it is never called.
[1].forEach(() => {}, console.log);
// P2: the logger is reduce's initial accumulator; it is never called.
[1, 2].reduce((logger, _value) => logger, console.log);
// P3: the logger is the reducer itself: it prints (accumulator, value, index, array).
[1, 2].reduce<void>(console.log, undefined);
// P4: for contrast, a true report.
[1, 2].forEach(console.log);
