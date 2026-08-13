import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: "2.5rem", maxWidth: 640 }}>
      <h1>Salon MVP — scaffold running</h1>
      <p>
        Phone-OTP login is wired up: <Link href="/login">go to /login</Link>.
        Run <code>npm run prisma:seed</code> first so there's a staff record
        to log in as (edit the phone number in <code>prisma/seed.ts</code> to
        your own, so the OTP actually reaches you).
      </p>
      <p>
        Check <code>/api/health</code> once <code>DATABASE_URL</code> is set
        to confirm Prisma can reach Postgres.
      </p>
    </main>
  );
}
