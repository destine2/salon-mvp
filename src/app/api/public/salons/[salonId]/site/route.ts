import { NextResponse } from "next/server";
import { withTenant } from "@/lib/tenant";

// Public data the salon's own website reads live, so edits in the dashboard
// show up there without a rebuild. Deliberately limited to what is already
// public on a salon's site — never staff, customers or finances. CORS is open
// because the site is a different origin; there is nothing private to protect.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { ...CORS, "Access-Control-Allow-Methods": "GET", "Access-Control-Max-Age": "86400" } });
}

export async function GET(_req: Request, { params }: { params: { salonId: string } }) {
  const site = await withTenant(params.salonId, async (tx) => {
    const salon = await tx.salon.findUnique({
      where: { id: params.salonId },
      select: { name: true, city: true, address: true, contactPhone: true, whatsappNumber: true },
    });
    if (!salon) return null;
    const [services, hours] = await Promise.all([
      tx.service.findMany({ where: { salonId: params.salonId }, select: { name: true, priceNaira: true, durationMin: true }, orderBy: { name: "asc" } }),
      tx.businessHours.findMany({ where: { salonId: params.salonId }, select: { weekday: true, opensMin: true, closesMin: true }, orderBy: { weekday: "asc" } }),
    ]);
    return { ...salon, services: services.map((s) => ({ ...s, priceNaira: Number(s.priceNaira) })), hours };
  });

  if (!site) return NextResponse.json({ ok: false, error: "Salon not found" }, { status: 404, headers: CORS });
  return NextResponse.json({ ok: true, site }, { headers: CORS });
}
