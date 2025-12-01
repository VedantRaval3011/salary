"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePunchVerification } from "@/context/PunchVerificationContext";

export default function ProtectedRoute({ children }: { children: any }) {
  const router = useRouter();
  const { isVerified } = usePunchVerification();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    // If not verified, redirect to /punches
    if (!isVerified) {
      router.push("/punches");
    } else {
      setAllowed(true);
    }
  }, [isVerified, router]);

  if (!allowed) return null;

  return <>{children}</>;
}
