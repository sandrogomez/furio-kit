import Link from 'next/link'

export default function ForbiddenPage() {
  return (
    <section className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="mb-2 text-4xl font-bold text-gray-900">403</h1>
      <p className="mb-6 text-gray-500">You don&apos;t have permission to access this page.</p>
      <Link href="/" className="text-sm text-blue-600 hover:underline">
        Go back home
      </Link>
    </section>
  )
}
