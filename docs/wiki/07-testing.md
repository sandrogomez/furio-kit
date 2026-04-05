# Testing

**TL;DR** — Tests are co-located with the code they test. Use Vitest with React Testing Library. Extract logic from Server Components into pure functions to keep it testable. Mock `fetch` and Server Actions; leave Zustand and `@org/ui-kit` adapters unmocked.

---

## Test placement

Place test files directly next to the source file they cover. Do not create a separate `__tests__` directory.

```
src/entities/product/ui/
  ProductCard.tsx
  ProductCard.test.tsx      ← co-located

src/entities/product/api/
  get-products.ts
  get-products.test.ts      ← co-located

src/features/add-to-cart/ui/
  AddToCartForm.tsx
  AddToCartForm.test.tsx    ← co-located
```

The naming convention is `<FileName>.test.tsx` for components and `<file-name>.test.ts` for non-component files.

---

## What to test per layer

| Layer | What to test | What NOT to test |
|---|---|---|
| `shared/ui` adapters | Prop mapping, correct underlying component renders | `@org/ui-kit` internals |
| `entities/api` | Zod parse behavior, error handling | Network calls (mock `fetch`) |
| `entities/ui` | Rendered output, props → DOM | Styling details |
| `features/ui` | User interactions, form submission, action calls | Server Action internals |
| `widgets` | Composition — correct children rendered | Child component behavior |

### On `@org/ui-kit`

Do not test `@org/ui-kit` components. They are tested by the design system package. Test only that your adapter passes the right props through and renders the expected output.

---

## Testing Server Components

jsdom cannot execute async Server Components directly. You cannot `render()` a component that `await`s a database call or `fetch()`.

The approach is to separate the two concerns:

1. **Extract data logic into pure functions.** Test those functions directly — they are plain async TypeScript with no JSX involved.
2. **Test the rendered output through Client Components.** A Client Component that receives data as props is fully testable. Test that the right data produces the right DOM.

### Example — testing the data function in isolation

Given this API function in `src/entities/product/api/get-products.ts`:

```ts
import { ProductListSchema, type Product } from '../model/types'

export async function getProducts(): Promise<Product[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/products`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  const data = await res.json()
  return ProductListSchema.parse(data)
}
```

Test the Zod parsing behavior and error handling directly, with `fetch` mocked:

```ts
// src/entities/product/api/get-products.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getProducts } from './get-products'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  mockFetch.mockReset()
})

describe('getProducts', () => {
  it('returns a parsed list of products on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 'prod-1',
          name: 'Headphones',
          price: 79.99,
          description: 'Over-ear.',
          imageUrl: 'https://example.com/img.jpg',
        },
      ],
    })

    const products = await getProducts()

    expect(products).toHaveLength(1)
    expect(products[0].name).toBe('Headphones')
  })

  it('throws when the response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' })

    await expect(getProducts()).rejects.toThrow('503 Service Unavailable')
  })

  it('throws when the response does not match the schema', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'prod-1' }], // missing required fields
    })

    await expect(getProducts()).rejects.toThrow()
  })
})
```

### Testing the rendered output

`ProductCard` is a Server Component but it contains no async work — it receives props. It renders fine in jsdom. For components that do `await` inside them, render their output by testing the Client Component children directly.

---

## Testing Client Components

Standard React Testing Library: render, query, assert, and simulate interactions with `userEvent`.

### Basic render and assert

```tsx
// src/entities/product/ui/ProductCard.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Product } from '../model/types'
import { ProductCard } from './ProductCard'

const mockProduct: Product = {
  id: 'prod-1',
  name: 'Wireless Headphones',
  price: 79.99,
  description: 'Over-ear noise-cancelling headphones.',
  imageUrl: 'https://example.com/headphones.jpg',
}

describe('ProductCard', () => {
  it('renders the product name', () => {
    render(<ProductCard product={mockProduct} />)
    expect(screen.getByText('Wireless Headphones')).toBeInTheDocument()
  })

  it('renders the formatted price', () => {
    render(<ProductCard product={mockProduct} />)
    expect(screen.getByText('$79.99')).toBeInTheDocument()
  })

  it('renders an image with the correct alt text', () => {
    render(<ProductCard product={mockProduct} />)
    expect(screen.getByRole('img', { name: 'Wireless Headphones' })).toBeInTheDocument()
  })
})
```

### Simulating user interaction

Use `@testing-library/user-event` for realistic event simulation. Import it as `userEvent` and call `userEvent.setup()` at the start of each test.

```tsx
// src/features/add-to-cart/ui/AddToCartForm.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AddToCartForm } from './AddToCartForm'

// Mock the Server Action — see the Mocking section below
vi.mock('../actions/add-to-cart-action', () => ({
  addToCartAction: vi.fn().mockResolvedValue({ success: true }),
}))

import { addToCartAction } from '../actions/add-to-cart-action'

describe('AddToCartForm', () => {
  it('renders the submit button', () => {
    render(<AddToCartForm productId="prod-1" />)
    expect(screen.getByRole('button', { name: /add to cart/i })).toBeInTheDocument()
  })

  it('calls the action with the product id on submit', async () => {
    const user = userEvent.setup()
    render(<AddToCartForm productId="prod-1" />)

    await user.click(screen.getByRole('button', { name: /add to cart/i }))

    expect(addToCartAction).toHaveBeenCalledOnce()

    const formData: FormData = (addToCartAction as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(formData.get('productId')).toBe('prod-1')
  })

  it('disables the button while pending', async () => {
    const user = userEvent.setup()
    // Make the action hang so we can inspect the pending state
    vi.mocked(addToCartAction).mockImplementationOnce(
      () => new Promise(() => {}),
    )
    render(<AddToCartForm productId="prod-1" />)

    await user.click(screen.getByRole('button', { name: /add to cart/i }))

    expect(screen.getByRole('button', { name: /adding/i })).toBeDisabled()
  })
})
```

---

## Mocking

### Mock `fetch` for API tests

Use `vi.stubGlobal` to replace the global `fetch`. Reset it in `beforeEach` so tests do not bleed into each other.

```ts
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  mockFetch.mockReset()
})
```

### Mock Server Actions for feature tests

Server Actions are regular async functions from the test's perspective. Mock them with `vi.mock` at the top of the file, before any imports that depend on them.

```ts
vi.mock('../actions/add-to-cart-action', () => ({
  addToCartAction: vi.fn().mockResolvedValue({ success: true }),
}))
```

This keeps feature tests fast and isolated — you are testing the UI behavior in response to a known action result, not the action itself. Test the action independently in `actions/add-to-cart-action.test.ts`.

### Do not mock Zustand

Test Zustand-connected components with the real store. The factory pattern (`createUIStore`) means each test gets a fresh store instance if you initialize it properly. Mocking the store produces tests that verify the mock, not the behavior.

If a component reads from `useUIStore`, render it inside a real `StoreProvider`:

```tsx
import { StoreProvider } from '@/shared/providers'

render(
  <StoreProvider>
    <MySidebarToggle />
  </StoreProvider>,
)
```

### Do not mock `@org/ui-kit`

Adapter tests verify that your adapter correctly maps props to the underlying component. If you mock `@org/ui-kit`, the test no longer checks the mapping — it only checks that you called a mock. Test the adapter's rendered output instead.

```tsx
// src/shared/ui/Button/Button.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button adapter', () => {
  it('renders children', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Save</Button>)

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(handleClick).toHaveBeenCalledOnce()
  })

  it('is disabled when the disabled prop is true', () => {
    render(<Button disabled>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})
```

---

## Running tests

| Command | Description |
|---|---|
| `pnpm test` | Run the full test suite once and exit |
| `pnpm test:watch` | Run in watch mode — reruns on file save |
| `pnpm test -- --coverage` | Run with V8 coverage report |

For coverage, Vitest outputs a summary in the terminal and writes a full report to `coverage/`. Open `coverage/index.html` in a browser for the line-by-line view.

To run a single test file during development, pass the file path as an additional argument:

```bash
pnpm test src/entities/product/ui/ProductCard.test.tsx
```

---

## Test configuration

### `vitest.config.ts`

```ts
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
```

| Option | Purpose |
|---|---|
| `plugins: [react()]` | Enables JSX transform and React Compiler support in tests |
| `environment: 'jsdom'` | Provides a browser-like DOM for React Testing Library |
| `globals: true` | Makes `describe`, `it`, `expect`, and `vi` available without imports |
| `setupFiles` | Runs `vitest.setup.ts` before every test file |
| `resolve.alias` | Maps `@/` to `src/` so test imports match the source imports exactly |

### `vitest.setup.ts`

```ts
import '@testing-library/jest-dom'
```

This single import extends Vitest's `expect` with the `@testing-library/jest-dom` matchers: `toBeInTheDocument()`, `toBeDisabled()`, `toHaveClass()`, `toHaveTextContent()`, and the rest. These matchers are available in every test file without any further setup.

---

**Next:** [08-ci-automation.md](./08-ci-automation.md) — GitHub Actions workflows, the architecture guard, Dependabot, and Claude Code triggers.
