---
"oxlint-plugin-effect": minor
---

New recommended rule `noSharedTestHome`: a test's home, data and working directory are its own. A fixed path under the shared temp root (`/tmp`, `/var/tmp`, `/private/tmp`, `/dev/shm`, or `tmpdir()`) given to a home key is shared by every run and parallel suite, so a result depends on run order. The rule reads the value of an object property, JSX attribute, binding, parameter default, class field or assignment (`process.env.HOME = "/tmp"`) named `home`, `HOME`, `homeDir`, `homeDirectory`, `dataDir`, `cwd` or any `…Cwd`, plus the names the `keys` option adds, and reports it unless the value makes a unique directory (`mkdtemp*`, `makeTempDirectory*`). Test code is read whole; other files only inside a test layer (`static Test`, a `…TestLayer` binding, a `Test:` key).
