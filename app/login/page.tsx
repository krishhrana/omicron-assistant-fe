import { redirect } from "next/navigation";

export default function LoginPage() {
  redirect("/onboarding?step=1&mode=sign-in");
}
