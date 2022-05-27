import type {
  ACH,
  AchTokenOptions,
  ApplePay,
  Card,
  LineItem,
  Payments,
  ShippingContact,
  TokenResult,
} from "@square/web-payments-sdk-types";

export type TokenizedPaymentMethod = ApplePay | Card | ACH;

export async function tokenize(
  paymentMethod: TokenizedPaymentMethod,
  options?: AchTokenOptions
): Promise<string | undefined> {
  let tokenResult: TokenResult;
  if (options) {
    tokenResult = await paymentMethod.tokenize(options);
  } else {
    tokenResult = await (paymentMethod as ApplePay | Card).tokenize();
  }

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

export function buildPaymentRequest(payments: Payments) {
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

  const paymentRequestDetails: Parameters<typeof payments.paymentRequest>[0] = {
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

  req.addEventListener("shippingcontactchanged", (contact: ShippingContact) => {
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
    })!;

    function calculateTax(amount: string, state?: string) {
      let taxPercent = 0.06;

      switch (state) {
        case "CA":
          taxPercent = 0.1;
          break;
        case "GA":
          taxPercent = 0.075;
          break;
        case "MI":
          taxPercent = 0.05;
          break;
      }

      const taxAmount = parseFloat(amount) * taxPercent;
      return taxAmount.toFixed(2);
    }

    const tax = calculateTax(taxableItem.amount, contact.state);
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
  });

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
