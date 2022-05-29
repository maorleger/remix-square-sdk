import type { LoaderFunction } from "@remix-run/node";
import { Form, Link, Outlet } from "@remix-run/react";

import { requireUserId } from "~/session.server";
import { useUser } from "~/utils";

export const loader: LoaderFunction = async ({ request }) => {
  await requireUserId(request);
  return null;
};

export default function ShopPage() {
  const user = useUser();

  return (
    <div className="flex flex-col">
      <header className="flex items-center justify-between bg-slate-800 p-4 text-white">
        <h1 className="text-3xl font-bold">
          <Link to=".">Shop</Link>
        </h1>
        <p>{user.email}</p>
        <Form action="/logout" method="post">
          <button
            type="submit"
            className="rounded bg-slate-600 py-2 px-4 text-blue-100 hover:bg-blue-500 active:bg-blue-600"
          >
            Logout
          </button>
        </Form>
      </header>

      <main className="flex bg-white">
        <div className="flex-1 p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
