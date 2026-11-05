import { NextResponse } from "next/server";
import { getShop, resetShop } from "@/server/shop";
import { withVisitor } from "@/server/visitor";

export const dynamic = "force-dynamic";

export const GET = withVisitor(() => NextResponse.json(getShop()));

export const POST = withVisitor(() => NextResponse.json(resetShop()));
