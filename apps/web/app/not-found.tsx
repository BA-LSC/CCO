import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page page-narrow">
      <div className="state-card">
        <h1>Page not found</h1>
        <p>The page you&apos;re looking for doesn&apos;t exist or was moved.</p>
        <Link href="/" className="btn btn-primary">
          Go home
        </Link>
      </div>
    </main>
  );
}
