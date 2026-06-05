import { CheckoutReturnClient } from "@/components/checkout-return-client";

export default async function CheckoutReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ external_reference?: string; ref?: string }>;
}) {
  const query = await searchParams;

  return (
    <CheckoutReturnClient externalReference={query.ref || query.external_reference || ""} />
  );
}
