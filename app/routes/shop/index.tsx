import type { ActionFunction, LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useEffect, useState } from "react";
import {
  ACH,
  AchOptions,
  AchTokenOptions,
  ApplePay,
  Card,
  LineItem,
  Payments,
  ShippingContact,
} from "@square/web-payments-sdk-types";

import { requireUserId } from "~/session.server";
import { payAction } from "./payment.server";

type LoaderData = {
  appId: string;
  locationId: string;
};

type TokenizedPaymentMethod = ApplePay | Card | ACH;

export const loader: LoaderFunction = async ({ request }) => {
  await requireUserId(request);

  return json<LoaderData>({
    appId: process.env.APP_ID!,
    locationId: process.env.LOCATION_ID!,
  });
};

export const action: ActionFunction = async function (args) {
  console.log("pay action", args);
  return await payAction(args);
};

export default function PaymentPage() {
  const data = useLoaderData() as LoaderData;
  const fetcher = useFetcher();

  const [card, setCard] = useState<Card | undefined>(undefined);
  const [applePay, setApplePay] = useState<ApplePay | undefined>(undefined);
  const [ach, setAch] = useState<ACH | undefined>(undefined);

  function buildPaymentRequest(payments: Payments) {
    const defaultShippingOptions = [
      {
        amount: "0.00",
        id: "shipping-option-1",
        label: "Free",
      },
      {
        amount: "10.00",
        id: "shipping-option-2",
        label: "Expedited",
      },
    ];

    let lineItems = [
      { amount: "2.00", label: "Item Cost" },
      { amount: "0.00", label: "Shipping" },
      { amount: "0.00", label: "Tax" },
    ];

    let total = calculateTotal(lineItems);

    const paymentRequestDetails: Parameters<typeof payments.paymentRequest>[0] =
      {
        countryCode: "US",
        currencyCode: "USD",
        lineItems,
        requestBillingContact: true,
        requestShippingContact: true,
        shippingOptions: defaultShippingOptions,
        total,
      };
    const req = payments.paymentRequest(paymentRequestDetails);

    req.addEventListener("shippingoptionchanged", (option: any) => {
      const newLineItems = setLineItems(lineItems, { shipping: option.amount });
      const total = calculateTotal(newLineItems);
      lineItems = newLineItems;

      return {
        lineItems,
        total,
      };
    });

    req.addEventListener(
      "shippingcontactchanged",
      (contact: ShippingContact) => {
        // Add your business logic here.
        // This tells you the address of the buyer, and allows you to update your shipping options
        // and pricing based on their location.
        const isCA = contact.state === "CA";

        const newShippingOptions = isCA
          ? defaultShippingOptions
          : [
              {
                id: "shipping-options-3",
                label: "Standard Shipping",
                amount: "15.00",
              },
              {
                id: "shipping-options-4",
                label: "Express Shipping",
                amount: "25.00",
              },
            ];

        const taxableItem = lineItems.find((lineItem) => {
          return lineItem.label === "Item Cost";
        });

        function calculateTax(...args: any[]) {
          return "5.00";
        }
        const tax = calculateTax(taxableItem?.amount, contact?.state);
        // Whenever the shipping contact is changed, the shipping option defaults to the
        // first option. This will lead to the shippingoptionchanged event being emitted for
        // each contact change when if shipping address is required.
        const newLineItems = setLineItems(lineItems, { Tax: tax });

        total = calculateTotal(newLineItems);
        lineItems = newLineItems;

        return {
          lineItems: newLineItems,
          shippingOptions: newShippingOptions,
          total,
        };
      }
    );

    return req;
  }

  function setLineItems(
    currentLineItems: LineItem[],
    newAmountsByLabel: Record<string, string>
  ) {
    // A list  of which newAmounts labels exist in the current line items.
    const updatedLineItem = new Set();

    // set the new amount for the line items that need to be updated.
    const newLineItems: LineItem[] = currentLineItems.map((lineItem) => {
      updatedLineItem.add(lineItem.label);
      if (newAmountsByLabel[lineItem.label] !== undefined) {
        return Object.assign({}, lineItem, {
          amount: newAmountsByLabel[lineItem.label],
        });
      }
      return lineItem;
    });

    // for line items that were not updated, add them to the new lineItem list.
    Object.entries(newAmountsByLabel).forEach(([label, amount]) => {
      if (!updatedLineItem.has(label)) {
        newLineItems.push({ label, amount, pending: false });
      }
    });

    return newLineItems;
  }

  async function tokenize(
    paymentMethod: TokenizedPaymentMethod,
    options: AchTokenOptions = {
      accountHolderName: "Maor Leger",
    }
  ) {
    const tokenResult = await paymentMethod.tokenize(options);
    if (tokenResult.status === "OK") {
      return tokenResult.token;
    } else {
      let errorMessage = `Tokenization failed with status: ${tokenResult.status}`;
      if (tokenResult.errors) {
        errorMessage += ` and errors: ${JSON.stringify(tokenResult.errors)}`;
      }

      throw new Error(errorMessage);
    }
  }

  function createPayment(locationId: string, token: string) {
    const body = {
      locationId,
      sourceId: token,
    };

    fetcher.submit(body, { method: "post" });
  }

  async function submitPayment(paymentMethod: TokenizedPaymentMethod) {
    if (!card) {
      throw new Error("no card??");
    }

    fetcher.state = "submitting";
    const token = await tokenize(paymentMethod);
    createPayment(data.locationId, token!);
  }

  useEffect(() => {
    async function asyncLoad() {
      if (!window.Square) {
        throw new Error("Square failed to load...");
      }

      let payments;
      try {
        payments = window.Square.payments(data.appId, data.locationId);
      } catch {
        throw new Error("missing-credentials");
      }

      let card;
      try {
        card = await payments.card();
        await card.attach("#card-container");
        setCard(card);
      } catch (e: any) {
        console.log(e);
      }

      try {
        const paymentRequest = buildPaymentRequest(payments);
        const applePay = await payments.applePay(paymentRequest);
        setApplePay(applePay);
      } catch (e: any) {
        console.log(e);
      }

      try {
        const ach = await payments.ach();
        setAch(ach);
      } catch (e) {
        console.log(e);
      }
    }

    asyncLoad();
  }, [data.appId, data.locationId]);

  const button = (
    disabled: boolean,
    paymentMethod: TokenizedPaymentMethod,
    text: string = "Pay a dollar"
  ) => {
    const btnClass = disabled
      ? "bg-blue-500 text-white font-bold py-2 px-4 rounded opacity-50 cursor-not-allowed"
      : "rounded bg-blue-500 py-2 px-4 font-bold text-white hover:bg-blue-700";
    return (
      <button className={btnClass} onClick={() => submitPayment(paymentMethod)}>
        {text}
      </button>
    );
  };

  return (
    <div className="flex h-full min-h-screen flex-col">
      <main className="flex h-full flex-col items-center  bg-white">
        <div id="card-container"></div>
        {card && button(fetcher.state !== "idle", card, "Pay with card")}
        {applePay &&
          button(fetcher.state !== "idle", applePay, "Pay with apple")}
        {fetcher.state === "idle" && fetcher.data?.success === true && (
          <p className="text-green-600">SUCCESS!</p>
        )}
        {ach && button(fetcher.state !== "idle", ach, "Pay with bank")}
      </main>
    </div>
  );
}
function calculateTotal(
  lineItems: { amount: string; label: string }[]
): LineItem {
  const amount = lineItems
    .reduce((total, lineItem) => {
      return total + parseFloat(lineItem.amount);
    }, 0.0)
    .toFixed(2);

  return { amount, label: "Total" };
}
