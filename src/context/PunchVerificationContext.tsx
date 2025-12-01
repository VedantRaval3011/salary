"use client";
import React, { createContext, useContext, useState } from "react";

interface PunchVerificationContextType {
  isVerified: boolean;
  setVerified: (value: boolean) => void;
}

const PunchVerificationContext = createContext<PunchVerificationContextType>({
  isVerified: false,
  setVerified: () => {},
});

export function PunchVerificationProvider({ children }: { children: React.ReactNode }) {
  const [isVerified, setIsVerified] = useState(false);

  const setVerified = (value: boolean) => {
    setIsVerified(value);
  };

  return (
    <PunchVerificationContext.Provider value={{ isVerified, setVerified }}>
      {children}
    </PunchVerificationContext.Provider>
  );
}

export function usePunchVerification() {
  return useContext(PunchVerificationContext);
}
