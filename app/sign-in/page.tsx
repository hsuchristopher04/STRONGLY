import { redirect } from "next/navigation";
import { getAuthUser } from "../auth";
import SignInForm from "./sign-in-form";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  if (await getAuthUser()) redirect("/");
  return <SignInForm />;
}
