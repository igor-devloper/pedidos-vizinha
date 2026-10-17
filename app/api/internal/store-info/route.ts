import { NextResponse } from "next/server";

import { getFullStoreStatus } from "@/lib/business-hours";
import { DELIVERY_FEES } from "@/lib/delivery";
import { hasValidInternalAuthorization } from "@/lib/internal-auth";
import { buildStoreInfo } from "@/lib/whatsapp-schedule";

// Horários e regras de funcionamento da loja: fonte única para o bot do WhatsApp.
export async function GET(request: Request) {
  if (!hasValidInternalAuthorization(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const settings = await getFullStoreStatus();
  return NextResponse.json({
    ...buildStoreInfo({
      operationSchedule: settings.operationSchedule,
      minimumLeadHours: settings.minimumLeadHours,
      storeOpenManually: !settings.closedByOwner,
    }),
    allowMultipleOrdersPerSlot: settings.allowMultipleOrdersPerSlot,
    deliveryFees: DELIVERY_FEES.map(({ label, fee }) => ({ area: label, fee })),
  });
}
