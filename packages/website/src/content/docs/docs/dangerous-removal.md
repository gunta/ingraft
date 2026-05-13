---
title: Dangerous Removal
description: Remove a vendored tree from every commit in repository history.
---

Normal removal deletes the current vendor entry:

```sh
ingraft remove effect
```

History removal is different. It rewrites the repository so the vendored path is
removed from past commits too.

```sh
ingraft remove effect --history --confirm-history-rewrite
```

Use history removal only when the vendor tree made the repository too heavy or
accidentally committed files that must not remain in history. The command is
intentionally explicit because every collaborator must coordinate around the new
history afterward.

Before running it:

- Make a backup.
- Coordinate with collaborators.
- Confirm the target path.
- Expect force-push and reclone work.
