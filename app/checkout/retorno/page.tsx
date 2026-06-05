import { CheckoutReturnClient } from "@/components/checkout-return-client";

export default async function CheckoutReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ external_reference?: string }>;
}) {
  const query = await searchParams;

  return (
    <CheckoutReturnClient externalReference={query.external_reference || ""} />
  );
}
