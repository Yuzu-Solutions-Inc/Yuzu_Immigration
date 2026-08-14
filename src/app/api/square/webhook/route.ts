import { NextResponse } from "next/server";

import {
  loadPaymentById,
  loadPaymentByOrderId,
  markPaymentPaid,
} from "@/lib/square/payments";
import { verifySquareWebhookSignature } from "@/lib/square/oauth";
import { getAppBaseUrl } from "@/lib/app-url";

type SquareWebhookBody = {
  type?: string;
  data?: {
    type?: string;
    id?: string;
    object?: {
      payment?: {
        id?: string;
        status?: string;
        order_id?: string;
        note?: string;
      };
      order?: {
        id?: string;
        state?: string;
      };
    };
  };
};

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-square-hmacsha256-signature");
  const origin = await getAppBaseUrl();
  const notificationUrl = `${origin.replace(/\/$/, "")}/api/square/webhook`;

  if (
    !verifySquareWebhookSignature({
      signatureHeader: signature,
      body,
      notificationUrl,
    })
  ) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let parsed: SquareWebhookBody;
  try {
    parsed = JSON.parse(body) as SquareWebhookBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const eventType = parsed.type ?? "";
  const payment = parsed.data?.object?.payment;
  const order = parsed.data?.object?.order;

  try {
    if (
      (eventType === "payment.updated" || eventType === "payment.created") &&
      payment?.status === "COMPLETED"
    ) {
      let row = payment.order_id
        ? await loadPaymentByOrderId(payment.order_id)
        : null;
      if (!row && payment.note) {
        row = await loadPaymentById(payment.note);
      }
      if (row && row.status === "pending") {
        await markPaymentPaid({
          paymentId: row.id,
          squarePaymentId: payment.id ?? null,
          squareOrderId: payment.order_id ?? row.square_order_id,
        });
      }
    }

    if (
      eventType === "order.updated" &&
      order?.id &&
      (order.state === "COMPLETED" || order.state === "OPEN")
    ) {
      const row = await loadPaymentByOrderId(order.id);
      if (row && row.status === "pending" && order.state === "COMPLETED") {
        await markPaymentPaid({
          paymentId: row.id,
          squareOrderId: order.id,
        });
      }
    }
  } catch (error) {
    console.error("square webhook handler:", error);
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
