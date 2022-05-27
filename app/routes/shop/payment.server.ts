import type { ActionFunction } from "@remix-run/server-runtime";
import { json } from "@remix-run/server-runtime";
import { nanoid } from "nanoid";
import type { CreatePaymentRequest } from "square";
import { ApiError } from "square";
import { client } from "~/square.server";
import retry from "async-retry";

export const action: ActionFunction = async function ({ request }) {
  const payload = await request.formData();

  const {
    idempotencyKey,
    locationId,
    sourceId,
    customerId,
    verificationToken,
  } = getRequestData(payload);

  return await retry(async (bail, attempt) => {
    try {
      console.log("Creating payment", { attempt });

      const payment: CreatePaymentRequest = {
        idempotencyKey,
        locationId,
        sourceId,
        amountMoney: {
          amount: BigInt(100),
          currency: "USD",
        },
      };

      if (customerId) {
        payment.customerId = customerId;
      }

      if (verificationToken) {
        payment.verificationToken = verificationToken;
      }

      const { result, statusCode } = await client.paymentsApi.createPayment(
        payment
      );

      console.log("payment succeeded!", { result, statusCode });

      return json({
        success: true,
        payment: {
          id: result.payment?.id,
          status: result.payment?.status,
          receiptUrl: result.payment?.receiptUrl,
          orderId: result.payment?.orderId,
        },
      });
    } catch (ex) {
      if (ex instanceof ApiError) {
        console.error(ex.errors);
        bail(ex);
      } else {
        console.error(`Error creating payment on attempt ${attempt}: ${ex}`);
        throw ex;
      }
    }
  });
};

interface RequestData {
  idempotencyKey: string;
  locationId: string;
  sourceId: string;
  customerId?: string;
  verificationToken?: string;
}

function getRequestData(formData: FormData): RequestData {
  const getRequiredString = (key: string) => {
    if (!formData.has(key)) {
      throw new Error(`Missing required field ${key}`);
    }
    return formData.get(key)!.toString();
  };

  const requestData = {
    idempotencyKey: formData.get("idempotencyKey")?.toString() || nanoid(),
    locationId: getRequiredString("locationId"),
    sourceId: getRequiredString("sourceId"),
    customerId: formData.get("customerId")?.toString(),
    verificationToken: formData.get("verificationToken")?.toString(),
  };

  return requestData;
}
