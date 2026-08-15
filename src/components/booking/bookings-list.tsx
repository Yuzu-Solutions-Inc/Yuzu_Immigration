"use client";

import { useTranslations } from "next-intl";

import { SurfaceCard } from "@/components/layout/surface-card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BookingListItem } from "@/lib/booking/bookings-list";
import { formatPriceCents } from "@/lib/booking/slots";

export function BookingsList({
  locale,
  bookings,
}: {
  locale: string;
  bookings: BookingListItem[];
}) {
  const t = useTranslations("bookings");

  if (bookings.length === 0) {
    return (
      <SurfaceCard className="p-6">
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("colWhen")}</TableHead>
            <TableHead>{t("colGuest")}</TableHead>
            <TableHead>{t("colService")}</TableHead>
            <TableHead>{t("colHost")}</TableHead>
            <TableHead>{t("colStatus")}</TableHead>
            <TableHead>{t("colPayment")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((booking) => (
            <TableRow key={booking.id}>
              <TableCell className="whitespace-nowrap text-sm">
                {new Date(booking.startsAt).toLocaleString(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </TableCell>
              <TableCell>
                <div className="text-sm font-medium text-brand">
                  {booking.guestName}
                </div>
                <div className="text-xs text-muted-foreground">
                  {booking.guestEmail}
                </div>
              </TableCell>
              <TableCell className="text-sm">{booking.serviceTitle}</TableCell>
              <TableCell className="text-sm">{booking.hostName}</TableCell>
              <TableCell>
                <Badge variant="secondary">
                  {booking.status === "confirmed"
                    ? t("statuses.confirmed")
                    : booking.status === "pending_payment"
                      ? t("statuses.pending_payment")
                      : booking.status === "cancelled"
                        ? t("statuses.cancelled")
                        : booking.status === "completed"
                          ? t("statuses.completed")
                          : booking.status === "no_show"
                            ? t("statuses.no_show")
                            : booking.status}
                </Badge>
              </TableCell>
              <TableCell>
                {booking.paymentStatus ? (
                  <div className="space-y-1">
                    <Badge
                      variant={
                        booking.paymentStatus === "paid"
                          ? "default"
                          : "outline"
                      }
                    >
                      {booking.paymentStatus === "paid"
                        ? t("payment.paid")
                        : booking.paymentStatus === "pending"
                          ? t("payment.pending")
                          : booking.paymentStatus === "failed"
                            ? t("payment.failed")
                            : booking.paymentStatus === "cancelled"
                              ? t("payment.cancelled")
                              : booking.paymentStatus === "expired"
                                ? t("payment.expired")
                                : booking.paymentStatus}
                    </Badge>
                    {booking.paymentAmountCents != null ? (
                      <p className="text-xs text-muted-foreground">
                        {formatPriceCents(
                          booking.paymentAmountCents,
                          locale,
                          booking.paymentCurrency ?? "CAD",
                        )}
                      </p>
                    ) : null}
                    {booking.payUrl ? (
                      <a
                        href={booking.payUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-xs font-medium text-action hover:underline"
                      >
                        {t("openPayLink")}
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {t("payment.none")}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SurfaceCard>
  );
}
