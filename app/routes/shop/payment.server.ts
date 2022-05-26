import type { ActionFunction } from "@remix-run/server-runtime";
import { json } from "@remix-run/server-runtime";
import { nanoid } from "nanoid";
import type { CreatePaymentRequest } from "square";
import { ApiError } from "square";
import { client } from "~/square.server";
import retry from "async-retry";

export const payAction: ActionFunction = async function ({ params, request }) {
  const payload = await request.formData();
  console.log(payload);
  // if (!validatePaymentMethod(payload)) {
  //   return new Response("", { status: 400, statusText: "Bad Request" });
  // }
  const idempotencyKey = payload.get("idempotencyKey")?.toString() || nanoid();
  return await retry(async (bail, attempt) => {
    try {
      console.log("Creating payment", { attempt });

      const payment: CreatePaymentRequest = {
        idempotencyKey,
        locationId: payload.get("locationId")?.toString(),
        sourceId: payload.get("sourceId")?.toString()!,
        amountMoney: {
          amount: BigInt(100),
          currency: "USD",
        },
      };

      if (payload.has("customerId")) {
        payment.customerId = payload.get("customerId")?.toString();
      }
      if (payload.has("verificationToken")) {
        payment.verificationToken = payload
          .get("verificationToken")
          ?.toString();
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
