"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PunchesPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to main page - punch verification happens there now
    router.push("/");
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent mb-4"></div>
        <p className="text-gray-600">Redirecting...</p>
      </div>
    </div>
  );
}
