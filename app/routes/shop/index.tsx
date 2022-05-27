import type { ActionFunction, LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useEffect, useState } from "react";
import type {
  ACH,
  AchTokenOptions,
  ApplePay,
  Card,
} from "@square/web-payments-sdk-types";

import { action as serverPayAction } from "./payment.server";
import type { TokenizedPaymentMethod } from "./utils";
import { tokenize } from "./utils";
import { buildPaymentRequest } from "./utils";
import config from "~/config.server";

type LoaderData = {
  appId: string;
  locationId: string;
};

export const loader: LoaderFunction = async ({ request }) => {
  return json<LoaderData>({
    appId: config.squareAppId,
    locationId: config.squareLocationId,
  });
};

export const action: ActionFunction = async (args) =>
  await serverPayAction(args);

export default function PaymentPage() {
  const data = useLoaderData() as LoaderData;
  const fetcher = useFetcher();

  const [card, setCard] = useState<Card | undefined>(undefined);
  const [applePay, setApplePay] = useState<ApplePay | undefined>(undefined);
  const [ach, setAch] = useState<ACH | undefined>(undefined);

  function createPayment(locationId: string, token: string) {
    const body = {
      locationId,
      sourceId: token,
    };

    fetcher.submit(body, { method: "post" });
  }

  async function submitPayment(
    paymentMethod: TokenizedPaymentMethod,
    options?: AchTokenOptions
  ) {
    fetcher.state = "submitting";

    const token = await tokenize(paymentMethod, options);
    return createPayment(data.locationId, token!);
  }

  useEffect(() => {
    async function asyncLoad() {
      if (!window.Square) {
        throw new Error("Square failed to load...");
      }

      let payments;
      payments = window.Square.payments(data.appId, data.locationId);

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
