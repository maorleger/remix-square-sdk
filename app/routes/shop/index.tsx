import type { ActionFunction, LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import React, { useEffect, useState } from "react";
import type {
  ACH,
  AchTokenOptions,
  ApplePay,
  Card,
  Payments,
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
  const [name, setName] = useState("");

  function onNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    setName(e.target.value);
  }

  function createPayment(locationId: string, token: string) {
    const body = {
      locationId,
      sourceId: token,
    };

    fetcher.submit(body, { method: "post" });
  }

  async function submitPayment(paymentMethod: TokenizedPaymentMethod) {
    fetcher.state = "submitting";

    // Skipping validation here as its just a playground
    const options: AchTokenOptions = {
      accountHolderName: name || "",
    };

    const token = await tokenize(paymentMethod, options);
    return createPayment(data.locationId, token!);
  }

  useEffect(() => {
    const initializers = {
      card: async (payments: Payments) => {
        let card;
        card = await payments.card();
        await card.attach("#card-container");
        setCard(card);
      },
      applePay: async (payments: Payments) => {
        const paymentRequest = buildPaymentRequest(payments);
        const applePay = await payments.applePay(paymentRequest);
        setApplePay(applePay);
      },
      ach: async (payments: Payments) => {
        const ach = await payments.ach();
        setAch(ach);
      },
    };

    async function asyncLoad() {
      if (!window.Square) {
        throw new Error("Square failed to load...");
      }

      const payments = window.Square.payments(data.appId, data.locationId);
      const initPromises = Object.values(initializers).map((p) =>
        p(payments).catch((err) => {
          console.error(err);
        })
      );
      await Promise.all(initPromises);
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
      <button
        disabled={disabled}
        className={btnClass}
        onClick={() => submitPayment(paymentMethod)}
      >
        {text}
      </button>
    );
  };

  const achForm = (disabled: boolean, paymentMethod: ACH) => (
    <div className="flex items-center border-b border-teal-500 py-2">
      <input
        className="mr-3 w-full appearance-none border-none bg-transparent py-1 px-2 leading-tight text-gray-700 focus:outline-none"
        type="text"
        value={name}
        onChange={onNameChange}
        placeholder="Full name"
        aria-label="Full name"
      ></input>
      {button(!name || disabled, paymentMethod, "Pay with ACH")}
    </div>
  );

  return (
    <div className="flex h-full min-h-screen flex-col">
      <main className="flex h-full flex-col items-center  bg-white">
        <div id="card-container"></div>
        <div className="flex-col">
          {card && button(fetcher.state !== "idle", card, "Pay with card")}
          {applePay &&
            button(fetcher.state !== "idle", applePay, "Pay with apple")}
          {fetcher.state === "idle" && fetcher.data?.success === true && (
            <p className="text-green-600">SUCCESS!</p>
          )}
          {ach && achForm(fetcher.state !== "idle", ach)}
        </div>
      </main>
    </div>
  );
}
