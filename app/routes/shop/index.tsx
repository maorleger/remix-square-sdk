import type { ActionFunction, LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import React, { useEffect, useState } from "react";
import type {
  ACH,
  AchTokenOptions,
  ApplePay,
  Card,
  ChargeVerifyBuyerDetails,
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
  const [payments, setPayments] = useState<Payments | undefined>(undefined);

  function onNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    setName(e.target.value);
  }

  function createPayment(
    locationId: string,
    token: string,
    verificationToken?: string
  ) {
    const body = {
      locationId,
      sourceId: token,
    };

    if (verificationToken) {
      Object.assign(body, { verificationToken });
    }

    console.log(body);

    fetcher.submit(body, { method: "post" });
  }

  async function submitPayment(
    paymentMethod: TokenizedPaymentMethod,
    shouldVerify: boolean = false
  ) {
    fetcher.state = "submitting";

    // Skipping validation here as its just a playground
    const options: AchTokenOptions = {
      accountHolderName: name || "",
    };

    const token = await tokenize(paymentMethod, options);
    if (!token) {
      throw new Error("missing token from result");
    }
    let verificationToken;
    if (shouldVerify) {
      verificationToken = await verifyBuyer(payments!, token);
    }
    return createPayment(data.locationId, token!, verificationToken);
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
      setPayments(payments);
      const initPromises = Object.values(initializers).map((p) =>
        p(payments).catch((err) => {
          console.error(err);
        })
      );
      await Promise.all(initPromises);
    }

    asyncLoad();
  }, [data.appId, data.locationId]);

  async function verifyBuyer(
    payments: Payments,
    token: string
  ): Promise<string> {
    const verificationDetails: ChargeVerifyBuyerDetails = {
      amount: "1.00",
      /* collected from the buyer */
      billingContact: {
        addressLines: ["199 Main street"],
        familyName: "L",
        givenName: "Maor",
        email: "ml@example.com",
        countryCode: "US",
        phone: "3214563987",
        // region: "LND",
        city: "Kirkland",
      },
      currencyCode: "USD",
      intent: "CHARGE",
    };

    const verificationResults = await payments.verifyBuyer(
      token,
      verificationDetails
    );

    if (!verificationResults?.token) {
      throw new Error("3ds verification unsuccessful");
    }
    return verificationResults.token;
  }

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
        onClick={() => submitPayment(paymentMethod, true)}
      >
        {text}
      </button>
    );
  };

  const container = (title: string, children: any) => (
    <div className="m-5">
      <div className="block max-w-sm rounded-lg bg-white p-6 shadow-lg">
        <h5 className="mb-2 text-xl font-medium leading-tight text-gray-900">
          {title}
        </h5>
        {children}
      </div>
    </div>
  );

  const cardComponent = (card?: Card) => {
    const body = (
      <div>
        <div id="card-container"></div>
        {card && button(fetcher.state !== "idle", card, "Pay with card")}
      </div>
    );

    return container("Pay with card", body);
  };

  const applePayComponent = (applePay: ApplePay) => {
    const body = (
      <div className="flex-col">
        {button(fetcher.state !== "idle", applePay, "Pay with apple")}
      </div>
    );

    return container("Pay with Apple", body);
  };

  const achComponent = (ach: ACH) => {
    const disabled = fetcher.state !== "idle" || name.length === 0;
    const body = (
      <div className="flex items-center border-b border-teal-500 py-2">
        <input
          className="mr-3 w-full appearance-none border-none bg-transparent py-1 px-2 leading-tight text-gray-700 focus:outline-none"
          type="text"
          value={name}
          onChange={onNameChange}
          placeholder="Full name"
          aria-label="Full name"
        ></input>
        {button(disabled, ach, "Pay with ACH")}
      </div>
    );

    return container("Pay with ACH", body);
  };

  const resultComponent = () => {
    return (
      fetcher.state === "idle" &&
      fetcher.data?.success === true && (
        <p className="text-green-600">SUCCESS!</p>
      )
    );
  };

  return (
    <div className="flex flex-col items-center">
      {cardComponent(card)}
      {ach && achComponent(ach)}
      {applePay && applePayComponent(applePay)}
      {resultComponent()}
    </div>
  );
}
