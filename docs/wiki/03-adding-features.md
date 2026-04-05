# Adding Features

**TL;DR** — Use the Plop generators to scaffold each FSD slice, fill in the business logic, compose the slices into a widget, wrap the widget in a view, wire the view to an App Router route. This walkthrough builds a product listing page from scratch.

By the end you will have:

- An `entity` (product) with a Zod schema, data fetching, and a domain card component
- A `feature` (add-to-cart) with a Server Action and a client form
- A `widget` (product-section) that composes the entity and feature
- A `view` (products) that wraps the widget with a Suspense boundary
- An App Router route at `/products`
- A unit test for the `ProductCard` component

---

## Quick-Start Summary

```
1. pnpm generate entity   → "product"
2. pnpm generate feature  → "add-to-cart"
3. pnpm generate widget   → "product-section"
4. Manually create src/views/products/
5. Manually create app/products/page.tsx
6. Write a test for ProductCard
```

All imports between layers go through each slice's `index.ts`. Never import internal files directly from outside a slice.

---

## Step 1 — Create the Entity

Run the generator and enter `product` at the prompt:

```bash
pnpm generate entity
# > Slice name: product
```

The generator creates this tree:

```
src/entities/product/
  api/
    get-products.ts
  model/
    types.ts
  ui/
    ProductCard.tsx
  index.ts
```

Now fill in each file.

### `src/entities/product/model/types.ts`

Define the Zod schema and infer the TypeScript type from it. Every data-fetching function in `entities/*/api/` must parse its response through this schema before returning.

```ts
import { z } from 'zod'

export const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number().nonnegative(),
  description: z.string(),
  imageUrl: z.string().url(),
})

export const ProductListSchema = z.array(ProductSchema)

export type Product = z.infer<typeof ProductSchema>
```

### `src/entities/product/api/get-products.ts`

An async function that fetches from the API and parses the response through the schema. If the API returns data that does not match the schema, Zod throws and the error surfaces as a 500 — which is the correct behavior at a system boundary.

```ts
import { ProductListSchema, type Product } from '../model/types'

export async function getProducts(): Promise<Product[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/products`, {
    next: { revalidate: 60 },
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch products: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  return ProductListSchema.parse(data)
}
```

> `next: { revalidate: 60 }` tells Next.js to cache the response for 60 seconds and revalidate in the background. Remove it or set `{ cache: 'no-store' }` if you need live data on every request.

### `src/entities/product/ui/ProductCard.tsx`

A Server Component that renders a single product. It imports `Card` from the shared UI adapter layer and uses `cn()` for class composition.

```tsx
import { Card } from '@/shared/ui'
import { cn } from '@/shared/utils'
import type { Product } from '../model/types'

interface ProductCardProps {
  product: Product
  className?: string
}

export function ProductCard({ product, className }: ProductCardProps) {
  return (
    <Card className={cn('flex flex-col gap-4 p-4', className)}>
      <img
        src={product.imageUrl}
        alt={product.name}
        className="h-48 w-full rounded-md object-cover"
      />
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{product.name}</h2>
        <p className="text-sm text-gray-600">{product.description}</p>
      </div>
      <p className="mt-auto text-base font-bold">
        {new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        }).format(product.price)}
      </p>
    </Card>
  )
}
```

### `src/entities/product/index.ts`

The public API for this slice. External layers import from here — never from internal paths.

```ts
export { ProductCard } from './ui/ProductCard'
export { getProducts } from './api/get-products'
export type { Product } from './model/types'
```

---

## Step 2 — Create the Feature

Run the generator and enter `add-to-cart`:

```bash
pnpm generate feature
# > Slice name: add-to-cart
```

The generator creates:

```
src/features/add-to-cart/
  actions/
    add-to-cart-action.ts
  ui/
    AddToCartForm.tsx
  index.ts
```

### `src/features/add-to-cart/actions/add-to-cart-action.ts`

A Server Action. The `"use server"` directive makes this function callable directly from Client Components while keeping the implementation server-side. Validate all input with Zod before processing.

```ts
'use server'

import { z } from 'zod'

const AddToCartInputSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive().max(99),
})

export async function addToCartAction(formData: FormData) {
  const parsed = AddToCartInputSchema.safeParse({
    productId: formData.get('productId'),
    quantity: formData.get('quantity'),
  })

  if (!parsed.success) {
    return { success: false, error: parsed.error.flatten().fieldErrors }
  }

  const { productId, quantity } = parsed.data

  // Replace this with your actual cart service call:
  // await cartService.addItem({ productId, quantity })
  console.log('Adding to cart:', { productId, quantity })

  return { success: true }
}
```

### `src/features/add-to-cart/ui/AddToCartForm.tsx`

A Client Component because it owns form state and the submit handler. It receives `productId` as a prop from the server and calls the Server Action on submit.

```tsx
'use client'

import { useRef, useTransition } from 'react'
import { Button } from '@/shared/ui'
import { addToCartAction } from '../actions/add-to-cart-action'

interface AddToCartFormProps {
  productId: string
}

export function AddToCartForm({ productId }: AddToCartFormProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    startTransition(async () => {
      const result = await addToCartAction(formData)
      if (result.success) {
        formRef.current?.reset()
      }
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex items-center gap-2">
      <input type="hidden" name="productId" value={productId} />
      <input
        type="number"
        name="quantity"
        defaultValue={1}
        min={1}
        max={99}
        className="w-16 rounded-md border px-2 py-1 text-sm"
        aria-label="Quantity"
      />
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Adding…' : 'Add to Cart'}
      </Button>
    </form>
  )
}
```

### `src/features/add-to-cart/index.ts`

```ts
export { AddToCartForm } from './ui/AddToCartForm'
```

---

## Step 3 — Create the Widget

Run the generator and enter `product-section`:

```bash
pnpm generate widget
# > Slice name: product-section
```

The generator creates:

```
src/widgets/product-section/
  ui/
    ProductSection.tsx
  index.ts
```

### `src/widgets/product-section/ui/ProductSection.tsx`

A Server Component that fetches the product list and composes `ProductCard` with `AddToCartForm`. The widget owns the data fetch so the parent view does not need to know about it — this lets each widget stream independently when wrapped in `<Suspense>`.

```tsx
import { getProducts, ProductCard } from '@/entities/product'
import { AddToCartForm } from '@/features/add-to-cart'

export async function ProductSection() {
  const products = await getProducts()

  return (
    <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => (
        <div key={product.id} className="flex flex-col gap-3">
          <ProductCard product={product} />
          <AddToCartForm productId={product.id} />
        </div>
      ))}
    </section>
  )
}
```

### `src/widgets/product-section/index.ts`

```ts
export { ProductSection } from './ui/ProductSection'
```

---

## Step 4 — Create the View

Views are not scaffolded by the generator — create these files manually.

```
src/views/products/
  ui/
    ProductsPage.tsx
  index.ts
```

### `src/views/products/ui/ProductsPage.tsx`

A Server Component that wraps `ProductSection` in a `<Suspense>` boundary. The fallback renders while the async widget resolves and streams its HTML.

```tsx
import { Suspense } from 'react'
import { ProductSection } from '@/widgets/product-section'

function ProductSectionSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-80 animate-pulse rounded-lg bg-gray-200"
          aria-hidden
        />
      ))}
    </div>
  )
}

export function ProductsPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-8 text-2xl font-bold">Products</h1>
      <Suspense fallback={<ProductSectionSkeleton />}>
        <ProductSection />
      </Suspense>
    </main>
  )
}
```

### `src/views/products/index.ts`

```ts
export { ProductsPage } from './ui/ProductsPage'
```

---

## Step 5 — Wire to the App Route

Create the Next.js route file. The App Router maps `app/products/page.tsx` to the `/products` URL. Route files use a default export as required by Next.js.

```
app/products/
  page.tsx
```

### `app/products/page.tsx`

```tsx
import { ProductsPage } from '@/views/products'

export const metadata = {
  title: 'Products',
}

export default function Page() {
  return <ProductsPage />
}
```

Start the dev server and open `http://localhost:3000/products`.

```bash
pnpm dev
```

---

## Step 6 — Write a Test

Tests are co-located with the code they test. Create a test file next to `ProductCard.tsx`.

```
src/entities/product/ui/
  ProductCard.tsx
  ProductCard.test.tsx   ← new
```

### `src/entities/product/ui/ProductCard.test.tsx`

Test that the component renders the correct content from the product prop. Do not test `@org/ui-kit` internals — that is the design system package's responsibility.

```tsx
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

  it('renders the product description', () => {
    render(<ProductCard product={mockProduct} />)
    expect(
      screen.getByText('Over-ear noise-cancelling headphones.'),
    ).toBeInTheDocument()
  })

  it('renders an image with the correct alt text', () => {
    render(<ProductCard product={mockProduct} />)
    expect(
      screen.getByRole('img', { name: 'Wireless Headphones' }),
    ).toBeInTheDocument()
  })

  it('applies an additional className when provided', () => {
    const { container } = render(
      <ProductCard product={mockProduct} className="custom-class" />,
    )
    expect(container.firstChild).toHaveClass('custom-class')
  })
})
```

Run the tests:

```bash
pnpm test
```

---

## What You Built

| File | Layer | Rendering |
|---|---|---|
| `src/entities/product/model/types.ts` | entity | — |
| `src/entities/product/api/get-products.ts` | entity | server |
| `src/entities/product/ui/ProductCard.tsx` | entity | Server Component |
| `src/features/add-to-cart/actions/add-to-cart-action.ts` | feature | Server Action |
| `src/features/add-to-cart/ui/AddToCartForm.tsx` | feature | Client Component |
| `src/widgets/product-section/ui/ProductSection.tsx` | widget | Server Component (async) |
| `src/views/products/ui/ProductsPage.tsx` | view | Server Component |
| `app/products/page.tsx` | app | Server Component |

The import chain respects the FSD hierarchy at every step:

```
app/products/page.tsx
  → src/views/products          (view)
    → src/widgets/product-section  (widget)
      → src/entities/product       (entity)
      → src/features/add-to-cart   (feature)
        → src/shared/ui            (shared)
```

---

## Common Mistakes

**Importing from internals instead of the barrel**

```ts
// WRONG
import { ProductCard } from '@/entities/product/ui/ProductCard'

// CORRECT
import { ProductCard } from '@/entities/product'
```

**Calling fetch inside a Client Component for initial render**

Pass data as props from a Server Component instead. If you need client-side refetching, add TanStack Query after the initial data is hydrated.

**Skipping Zod parsing in `api/` functions**

Every `entities/*/api/` function must call `.parse()` or `.safeParse()` on the raw response. Do not return raw `any` data — the parse is the contract between your API and your application.

**Placing `"use client"` too high in the tree**

Mark only the leaf component that actually needs hooks or event handlers as `"use client"`. A widget that composes a client form does not need `"use client"` — only the form itself does.

---

**Next:** [04-state-management.md](./04-state-management.md) — Zustand for UI state, TanStack Query for server cache, and the SSR hydration handoff pattern.
