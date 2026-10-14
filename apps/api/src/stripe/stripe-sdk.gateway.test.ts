import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { ProviderUnavailableError, ValidationFailedError } from "../common/errors/api-error.js";
import { StripeSdkGateway } from "./stripe-sdk.gateway.js";

/**
 * The real SDK adapter against a recording HTTP client: the exact requests
 * Stripe would receive, and how its answers map to our plain data. No
 * network; the key is a shape-valid fake.
 */
interface Recorded {
  method: string;
  path: string;
  params: URLSearchParams;
  idempotencyKey: string | null;
}

function gatewayAnswering(answer: (call: Recorded) => { status?: number; body: unknown }) {
  const calls: Recorded[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? init.body : "";
    const call = {
      method: init?.method ?? "GET",
      path: url.pathname,
      params: new URLSearchParams(init?.method === "POST" ? body : url.search),
      idempotencyKey: headers.get("idempotency-key"),
    };
    calls.push(call);
    const { status = 200, body: json } = answer(call);
    return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json", "request-id": "req_test" } });
  }) as typeof fetch;
  const gateway = new StripeSdkGateway("sk_test_FAKEKEYFORTESTS0000", "whsec_FAKE", Stripe.createFetchHttpClient(fetchFn));
  return { gateway, calls };
}

const checkoutInput = {
  currency: "CHF",
  amount: 1250,
  paymentMethodTypes: ["card" as const],
  productName: "Donation to the Global Experiment",
  successUrl: "https://globalexperiment.org/donate/thank-you?currency=CHF&amount=12.50&frequency=once&session_id={CHECKOUT_SESSION_ID}",
  cancelUrl: "https://globalexperiment.org/donate?currency=CHF&amount=12.50&frequency=once&canceled=1",
  idempotencyKey: "donation-checkout:3b9d6bcd-bbfd-4b2b-9b13-4b7c8e9b1c11:0123456789abcdef",
};

const balance = (values: Record<string, unknown> = {}) => ({ object: "balance_transaction", id: "txn_1", currency: "eur", amount: 1000, fee: 59, net: 941, exchange_rate: null, ...values });

describe("StripeSdkGateway", () => {
  it("creates a one-off donation Checkout: donate button, no customer, donation metadata, idempotency key", async () => {
    const { gateway, calls } = gatewayAnswering(() => ({ body: { id: "cs_test_abc", object: "checkout.session", url: "https://checkout.stripe.com/c/pay/cs_test_abc" } }));
    expect(await gateway.createCheckoutSession({ ...checkoutInput, mode: "payment" })).toEqual({ id: "cs_test_abc", url: "https://checkout.stripe.com/c/pay/cs_test_abc" });

    const [call] = calls;
    expect(call!.method).toBe("POST");
    expect(call!.path).toBe("/v1/checkout/sessions");
    expect(call!.idempotencyKey).toBe(checkoutInput.idempotencyKey);
    expect(Object.fromEntries(call!.params)).toEqual({
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "chf",
      "line_items[0][price_data][unit_amount]": "1250",
      "line_items[0][price_data][product_data][name]": "Donation to the Global Experiment",
      "payment_method_types[0]": "card",
      "managed_payments[enabled]": "false",
      "adaptive_pricing[enabled]": "false",
      success_url: checkoutInput.successUrl,
      cancel_url: checkoutInput.cancelUrl,
      locale: "auto",
      "metadata[kind]": "donation",
      submit_type: "donate",
      customer_creation: "if_required",
      "payment_intent_data[metadata][kind]": "donation",
      "payment_intent_data[description]": "Donation to the Global Experiment",
    });
  });

  it("creates a monthly donation Checkout as a subscription with a monthly price", async () => {
    const { gateway, calls } = gatewayAnswering(() => ({ body: { id: "cs_test_sub", object: "checkout.session", url: "https://checkout.stripe.com/c/pay/cs_test_sub" } }));
    await gateway.createCheckoutSession({ ...checkoutInput, mode: "subscription", productName: "Monthly donation to the Global Experiment" });
    const params = Object.fromEntries(calls[0]!.params);
    expect(params).toMatchObject({
      mode: "subscription",
      "line_items[0][price_data][recurring][interval]": "month",
      "subscription_data[metadata][kind]": "donation",
      "subscription_data[description]": "Monthly donation to the Global Experiment",
    });
    // One-off-only parameters are not sent (Stripe rejects them in subscription mode).
    for (const key of ["submit_type", "customer_creation", "payment_intent_data[metadata][kind]"]) expect(params).not.toHaveProperty(key);
  });

  it("maps Stripe's refusal of a method to a validation error, and outages to 502", async () => {
    const refusing = gatewayAnswering(() => ({
      status: 400,
      body: { error: { type: "invalid_request_error", message: "The payment method type provided: sepa_debit is invalid." } },
    }));
    const refused = await refusing.gateway.createCheckoutSession({ ...checkoutInput, mode: "payment" }).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(ValidationFailedError);
    // Diagnostics for the log, without Stripe's message text.
    expect((refused as { stripe?: unknown }).stripe).toEqual({ type: "invalid_request_error", code: null, param: null, requestId: "req_test" });

    const down = gatewayAnswering(() => ({ status: 500, body: { error: { type: "api_error", message: "Internal" } } }));
    await expect(down.gateway.getCharge("ch_1")).rejects.toBeInstanceOf(ProviderUnavailableError);
    await expect(down.gateway.listRefunds("ch_1")).rejects.toBeInstanceOf(ProviderUnavailableError);

    const unauthorized = gatewayAnswering(() => ({ status: 401, body: { error: { type: "invalid_request_error", message: "Invalid API Key provided" } } }));
    await expect(unauthorized.gateway.getSubscription("sub_1")).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("reads a Checkout session, recognising our donation marker", async () => {
    const { gateway } = gatewayAnswering(() => ({
      body: { id: "cs_test_1", object: "checkout.session", mode: "payment", status: "complete", payment_status: "paid", payment_intent: "pi_1", subscription: null, metadata: { kind: "donation" } },
    }));
    expect(await gateway.getCheckoutSession("cs_test_1")).toEqual({
      id: "cs_test_1",
      mode: "payment",
      status: "complete",
      paymentStatus: "paid",
      paymentIntentId: "pi_1",
      subscriptionId: null,
      donation: true,
    });
  });

  it("reads a PaymentIntent's charge with its balance transaction (fee), upper-casing currencies", async () => {
    const { gateway, calls } = gatewayAnswering(() => ({
      body: {
        id: "pi_1",
        object: "payment_intent",
        metadata: { kind: "donation" },
        latest_charge: { id: "ch_1", object: "charge", amount: 1000, currency: "eur", created: 1_760_520_600, status: "succeeded", metadata: {}, balance_transaction: balance() },
      },
    }));
    expect(await gateway.getPaymentIntentCharge("pi_1")).toEqual({
      id: "ch_1",
      amount: 1000,
      currency: "EUR",
      created: new Date(1_760_520_600 * 1000),
      status: "succeeded",
      donation: true,
      balance: { currency: "EUR", amount: 1000, fee: 59, net: 941, exchangeRate: null },
    });
    expect(calls[0]!.params.get("expand[0]")).toBe("latest_charge.balance_transaction");
  });

  it("reports no balance while Stripe hasn't settled, and settlement in another currency", async () => {
    const pending = gatewayAnswering(() => ({
      body: { id: "ch_1", object: "charge", amount: 2000, currency: "usd", created: 1, status: "succeeded", metadata: {}, balance_transaction: null, payment_intent: { id: "pi_1", metadata: { kind: "donation" } } },
    }));
    expect(await pending.gateway.getCharge("ch_1")).toMatchObject({ donation: true, balance: null });

    const converted = gatewayAnswering(() => ({
      body: {
        id: "ch_2",
        object: "charge",
        amount: 2000,
        currency: "usd",
        created: 1,
        status: "succeeded",
        metadata: {},
        payment_intent: "pi_2",
        balance_transaction: balance({ currency: "eur", amount: 1840, fee: 83, net: 1757, exchange_rate: 0.92 }),
      },
    }));
    expect(await converted.gateway.getCharge("ch_2")).toMatchObject({
      donation: false, // no marker on the charge, intent not expanded
      balance: { currency: "EUR", amount: 1840, fee: 83, net: 1757, exchangeRate: 0.92 },
    });
  });

  it("lists every refund of a charge across pages", async () => {
    const refund = (id: string, status: string) => ({ id, object: "refund", amount: 100, currency: "eur", created: 2, status, balance_transaction: balance({ amount: -100, fee: 0, net: -100 }) });
    const { gateway, calls } = gatewayAnswering((call) =>
      call.params.get("starting_after")
        ? { body: { object: "list", data: [refund("re_3", "pending")], has_more: false, url: "/v1/refunds" } }
        : { body: { object: "list", data: [refund("re_1", "succeeded"), refund("re_2", "succeeded")], has_more: true, url: "/v1/refunds" } },
    );
    const refunds = await gateway.listRefunds("ch_1");
    expect(refunds.map((item) => [item.id, item.status, item.balance?.amount])).toEqual([
      ["re_1", "succeeded", -100],
      ["re_2", "succeeded", -100],
      ["re_3", "pending", -100],
    ]);
    expect(calls[0]!.params.get("charge")).toBe("ch_1");
    expect(calls[1]!.params.get("starting_after")).toBe("re_2");
  });

  it("finds an invoice's charge through its paid invoice payment and the subscription's marker", async () => {
    const { gateway, calls } = gatewayAnswering((call) => {
      if (call.path === "/v1/invoices/in_1")
        return {
          body: { id: "in_1", object: "invoice", amount_paid: 1000, parent: { type: "subscription_details", subscription_details: { subscription: "sub_1", metadata: { kind: "donation" } } } },
        };
      if (call.path === "/v1/invoice_payments")
        return { body: { object: "list", has_more: false, url: "/v1/invoice_payments", data: [{ id: "inpay_1", object: "invoice_payment", status: "paid", payment: { type: "payment_intent", payment_intent: "pi_9" } }] } };
      return {
        body: {
          id: "pi_9",
          object: "payment_intent",
          metadata: {},
          latest_charge: { id: "ch_9", object: "charge", amount: 1000, currency: "chf", created: 3, status: "succeeded", metadata: {}, balance_transaction: balance({ currency: "chf" }) },
        },
      };
    });
    expect(await gateway.getInvoiceCharge("in_1")).toEqual({
      donation: true,
      subscriptionId: "sub_1",
      charge: expect.objectContaining({ id: "ch_9", currency: "CHF", amount: 1000, donation: true }),
    });
    expect(calls.map((call) => call.path)).toEqual(["/v1/invoices/in_1", "/v1/invoice_payments", "/v1/payment_intents/pi_9"]);
    expect(calls[1]!.params.get("status")).toBe("paid");
  });

  it("reads nothing more for an invoice with nothing paid (e.g. a trial)", async () => {
    const { gateway, calls } = gatewayAnswering(() => ({ body: { id: "in_2", object: "invoice", amount_paid: 0, parent: null } }));
    expect(await gateway.getInvoiceCharge("in_2")).toEqual({ donation: false, subscriptionId: null, charge: null });
    expect(calls).toHaveLength(1);
  });

  it("reads a subscription's monthly amount and dates", async () => {
    const { gateway } = gatewayAnswering(() => ({
      body: {
        id: "sub_1",
        object: "subscription",
        status: "canceled",
        currency: "usd",
        start_date: 1_760_000_000,
        canceled_at: 1_762_000_000,
        metadata: { kind: "donation" },
        items: { object: "list", data: [{ id: "si_1", quantity: 1, price: { id: "price_1", unit_amount: 500 } }] },
      },
    }));
    expect(await gateway.getSubscription("sub_1")).toEqual({
      id: "sub_1",
      status: "canceled",
      currency: "USD",
      amount: 500,
      startedAt: new Date(1_760_000_000 * 1000),
      canceledAt: new Date(1_762_000_000 * 1000),
      donation: true,
    });
  });
});
