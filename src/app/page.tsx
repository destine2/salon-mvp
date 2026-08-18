import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: "2.5rem", maxWidth: 640 }}>
      <h1>Salon MVP — scaffold running</h1>
      <p>
        New salon? <Link href="/signup">Set up your salon</Link>. Already
        have an account? <Link href="/login">Log in</Link>.
      </p>
      <p>
        For local testing, <code>npm run prisma:seed</code> creates a test
        salon and prints an owner phone/password you can log in with
        immediately.
      </p>
      <p>
        Check <code>/api/health</code> once <code>DATABASE_URL</code> is set
        to confirm Prisma can reach Postgres.
      </p>
    </main>
  );
}
