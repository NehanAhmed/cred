## Summary

<!-- Describe the change and why it is needed. Link the issue it fixes, if any. -->

## Linked issue

<!-- Example: Closes #123. Omit if there is no issue. -->

## Type of change

<!-- Mark the relevant box. -->

- [ ] Bug fix
- [ ] New feature
- [ ] New adapter
- [ ] Refactor
- [ ] Documentation
- [ ] Dependency update
- [ ] Test change

## Checklist

- [ ] Tests were added or updated for the new or changed behavior.
- [ ] `pnpm turbo run build lint typecheck test` passes.
- [ ] A changeset was added if a published package's behavior, API, or runtime dependencies changed.
- [ ] Documentation was updated when behavior or configuration changed.
- [ ] The layering rules are respected: core imports no adapter library, storage and email adapters
      import core only, and the Express adapter is the composition layer.
