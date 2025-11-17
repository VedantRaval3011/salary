"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ProtectedRoute({ children }: { children: any }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const status = localStorage.getItem("punchCheck");

    // If not checked or false → block user
    if (status !== "true") {
      router.push("/punches");
    } else {
      setAllowed(true);
    }
  }, []);

  if (!allowed) return null;

  return <>{children}</>;
}
