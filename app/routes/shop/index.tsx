import type { ActionFunction, LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useEffect, useState } from "react";
import type { ApplePay, Card } from "@square/web-payments-sdk-types";

import { requireUserId } from "~/session.server";
import { payAction } from "./payment.server";

type LoaderData = {
  appId: string;
  locationId: string;
};

type TokenizedPaymentMethod = ApplePay | Card;

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

  async function tokenize(paymentMethod: TokenizedPaymentMethod) {
    const tokenResult = await paymentMethod.tokenize();
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
        const paymentRequest = payments.paymentRequest({
          countryCode: "US",
          currencyCode: "USD",
          total: {
            amount: "1.00",
            label: "Total",
          },
        });
        const applePay = await payments.applePay(paymentRequest);
        setApplePay(applePay);
      } catch (e: any) {
        console.log(e);
        return;
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
  console.dir(fetcher);
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
      </main>
    </div>
  );
}
