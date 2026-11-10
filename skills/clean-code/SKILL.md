---
name: clean-code
description: Apply pragmatic, language- and framework-agnostic readability, guard-clause, and anti-conditional rules (early returns, lookup objects/maps, no nested try/catch, shallow branching) to code generation and review.
license: Apache-2.0
metadata:
  author: tomidev
  version: "1.0"
---

# Clean Code and Anti-Conditional Style

Apply this style to all code generation, refactoring, and code review. Keep logic direct, shallow, and predictable without dogma or overengineering.

## Core Rules

1. **Early returns and guard clauses**: Handle loading, error, empty, validation, and boundary conditions upfront. Exit early so the happy path runs flat at the bottom.
2. **Max 1 level of nested logic**: Avoid nesting `if` inside `if` or deep `if/else` branches. Flatten via guard clauses, helper extraction, or lookup structures.
3. **Lookup tables over branching ladders**: Use typed maps, dictionary objects, or records instead of `switch` or `else if` chains when mapping status, role, type, event, or variant to handlers/values.
4. **No nested try/catch**: Never nest `try/catch` blocks. Isolate fallible operations into focused, single-purpose functions or wrap distinct error boundaries cleanly.
5. **Discriminated dispatch over ad-hoc checks**: When variants differ in behavior or payload, model them explicitly (discriminated unions, polymorphic strategies, or typed records) rather than scattering repeated conditional checks across files.
6. **No ceremony for trivial checks**: Do not replace a simple `if (!x) return` or short ternary with factories, strategies, classes, or complex abstraction machinery.

## Style Examples

### Guard clauses & flat control flow

```text
// Bad: nested branching
function processOrder(order) {
  if (order) {
    if (order.isValid) {
      if (order.items.length > 0) {
        return execute(order);
      } else {
        throw new Error("Empty items");
      }
    } else {
      throw new Error("Invalid order");
    }
  }
  return null;
}

// Good: early return guard clauses
function processOrder(order) {
  if (!order) return null;
  if (!order.isValid) throw new Error("Invalid order");
  if (order.items.length === 0) throw new Error("Empty items");

  return execute(order);
}
```

### Lookup maps over `else if` / `switch`

```text
// Bad: long conditional ladder
function getStatusColor(status) {
  if (status === 'active') return 'green';
  if (status === 'pending') return 'yellow';
  if (status === 'failed') return 'red';
  return 'gray';
}

// Good: lookup table
const STATUS_COLORS = {
  active: 'green',
  pending: 'yellow',
  failed: 'red',
};

function getStatusColor(status) {
  return STATUS_COLORS[status] ?? 'gray';
}
```

### No nested try/catch

```text
// Bad: nested try/catch blocks
try {
  const data = parsePayload(raw);
  try {
    saveToDatabase(data);
  } catch (dbError) {
    logDbError(dbError);
    fallbackSave(data);
  }
} catch (parseError) {
  handleParseError(parseError);
}

// Good: isolate fallible boundaries into dedicated helpers
function safePersist(data) {
  try {
    return saveToDatabase(data);
  } catch (dbError) {
    logDbError(dbError);
    return fallbackSave(data);
  }
}

// Main logic stays flat
const data = parsePayloadOrHandle(raw);
if (data) safePersist(data);
```

## Pragmatic Simplification Tags

When reviewing or authoring diffs, examine unused behavior, duplicated implementations, and needless indirection using these diagnostic categories:

| Tag | When it applies |
| --- | --- |
| `delete` | Dead code or unused flexibility with no required consumer; verify callers before removal. |
| `stdlib` | Handwritten code duplicates a language/runtime standard library API with equivalent semantics. |
| `native` | A third-party dependency or wrapper duplicates a supported platform/runtime capability with equivalent behavior. |
| `reuse` | The repo already contains an equivalent utility or type; cite the exact path. |
| `yagni` | Speculative abstraction or trivial wrapper with demonstrated maintenance cost and no current domain, policy, DI, or test boundary value. |
| `shrink` | A clearer, more direct expression of the same logic and effects; fewer lines alone do not establish improvement without clarity. |

### Simplification finding format

```text
1. <path/to/file>:<line> — <tag>: <problem and concrete cost> → <proposed replacement>; <blocking|non-blocking>.
```
