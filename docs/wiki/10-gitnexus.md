# GitNexus — Code Intelligence

GitNexus builds a knowledge graph of the codebase and exposes it through MCP tools. It understands call graphs, execution flows, and blast radius — things that grep and file search cannot reason about.

furio-kit is indexed as **furio-kit**: 797 symbols, 932 relationships, 9 functional clusters, 6 execution flows.

---

## 1. When to Use GitNexus

| Task | Use GitNexus |
|---|---|
| "How does authentication work?" | `gitnexus_query({query: "authentication"})` — returns the AuthFlow execution trace |
| "What breaks if I change X?" | `gitnexus_impact({target: "X"})` — blast radius at depth 1/2/3 |
| "Who calls this function?" | `gitnexus_context({name: "functionName"})` — incoming calls + processes |
| "Why is this bug happening?" | `gitnexus_query({query: "symptom"})` + trace the execution flow |
| Renaming a symbol across files | `gitnexus_rename({...})` — call-graph-aware, not find-and-replace |
| Before committing | `gitnexus_detect_changes()` — verify only expected symbols changed |

Use `gitnexus_query` for concepts and workflows; use `gitnexus_context` for a single symbol. Both are faster and more accurate than grepping for most exploration tasks.

---

## 2. Project-Specific Queries

These queries are useful for furio-kit's architecture:

```ts
// Find all execution flows related to authentication and session handling
gitnexus_query({ query: "authentication session validation" })

// Find the data flow from API response through Zod validation to UI
gitnexus_query({ query: "Zod schema parse entity api" })

// Find all components that interact with the Zustand store
gitnexus_query({ query: "Zustand store UI state" })

// Understand the proxy/middleware request lifecycle
gitnexus_query({ query: "proxy request middleware auth" })

// Find all adapter components in shared/ui
gitnexus_query({ query: "shared ui adapter org ui-kit" })
```

---

## 3. Impact Analysis Before Editing

Before editing any function, class, or method, run impact analysis to understand the blast radius:

```ts
// Check what calls authAdapter.validateRequest
gitnexus_impact({ target: "validateRequest", direction: "upstream" })

// Check what createUIStore affects downstream
gitnexus_impact({ target: "createUIStore", direction: "downstream" })
```

Impact levels:
- **LOW** — safe to edit; few callers, no critical flows
- **MEDIUM** — review callers before changing the signature
- **HIGH / CRITICAL** — warn the user before proceeding; changes to core symbols like `authAdapter`, `proxy`, `env` propagate broadly

---

## 4. Execution Flows

GitNexus identified 6 execution flows in furio-kit. Read them at:

```
gitnexus://repo/furio-kit/processes
```

| Flow (actual name) | What it traces |
|---|---|
| `ValidateRequest → GetAuth0Session` | proxy.ts → authAdapter.validateRequest → Auth0 session check → redirect or continue |
| `ValidateRequest → ValidateJwt` | proxy.ts → authAdapter.validateRequest → JWT decode → permission check |
| `Page → GetUsers` | Server Component → entities/user/api → Zod parse → props |
| `Page → Cn` | Component render → cn() utility → className composition |
| `AppLayout → CreateUIStore` | app/(app)/layout → StoreProvider → createUIStore → useUIStore |
| `LoginPage → Button` | Login view → shared/ui/Button adapter → @org/ui-kit Button |

To get the full step-by-step trace for a flow:

```ts
// Read via MCP resource (use the actual flow name from the table above)
gitnexus://repo/furio-kit/process/ValidateRequest → GetAuth0Session
```

---

## 5. Functional Clusters

The codebase is divided into 9 functional clusters. Read all of them at:

```
gitnexus://repo/furio-kit/clusters
```

Key clusters:
- **Auth** — proxy.ts, authAdapter, permissions, session types
- **SharedUI** — all adapter components in shared/ui
- **Observability** — logger, error-tracker
- **Entities** — user entity (api, model, ui)
- **Providers** — StoreProvider, QueryProvider, UIStoreContext

---

## 6. Keeping the Index Fresh

The GitNexus index reflects the code at the time `npx gitnexus analyze` was last run. After significant changes (new files, renamed symbols, structural refactoring), re-index:

```bash
npx gitnexus analyze
```

Check index freshness at any time:

```bash
npx gitnexus status
```

Or read the context resource — it reports the last-indexed timestamp:

```
gitnexus://repo/furio-kit/context
```

> The `.gitnexus/` directory is gitignored. Each developer and CI run maintains its own local index.

### When the MCP server holds the database

If `npx gitnexus analyze` fails with a lock error (`.gitnexus/lbug`), the MCP server has the KuzuDB database open. In this case, use the MCP tools directly instead of CLI — `gitnexus_query`, `gitnexus_context`, etc. all read from the already-open database.

---

## 7. Renaming Symbols

Never use find-and-replace for renaming functions, classes, or methods. Use `gitnexus_rename`, which walks the call graph and produces confidence-tagged edits across all affected files:

```ts
gitnexus_rename({
  oldName: "validateRequest",
  newName: "authenticateRequest",
  scope: "shared/auth"
})
```

The result includes every file that references the symbol, the specific lines to change, and a confidence score for each edit. Review before applying.

---

## 8. Raw Graph Queries

For custom queries, read the schema first and then use `gitnexus_cypher`:

```
gitnexus://repo/furio-kit/schema
```

Example: find all functions that call `authAdapter.validateRequest`:

```cypher
MATCH (caller)-[:CodeRelation {type: 'CALLS'}]->(f:Function {name: "validateRequest"})
RETURN caller.name, caller.filePath
```
