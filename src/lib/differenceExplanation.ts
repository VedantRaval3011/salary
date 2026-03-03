export interface PDStats {
  lateDeduction: number;
  paidLeave: number;
  holidaysBase: number;
  grandTotal: number;
}

export function getSmartPresentDayExplanation(
  hrValue: number,
  stats: PDStats
): { side: "Match" | "HR Issue" | "Software Issue" | "Check Required"; reason: string; bgColor: string; textColor: string } {
  const softwareValue = stats.grandTotal;
  const diff = hrValue - softwareValue;
  const absDiff = Math.abs(diff);

  if (absDiff <= 0.05)
    return {
      side: "Match",
      reason: "Values match perfectly.",
      bgColor: "bg-green-100",
      textColor: "text-green-800",
    };

  // HR is lower than software (Software > HR)
  if (diff < -0.05) {
    if (stats.paidLeave > 0 && Math.abs(absDiff - stats.paidLeave) <= 0.1) {
      return {
        side: "HR Issue",
        reason: `HR likely missed adding the ${stats.paidLeave} Paid Leave (PL) days.`,
        bgColor: "bg-red-100",
        textColor: "text-red-800",
      };
    }
    if (stats.holidaysBase > 0 && Math.abs(absDiff - stats.holidaysBase) <= 0.1) {
      return {
        side: "HR Issue",
        reason: `HR likely missed adding the ${stats.holidaysBase} Holiday days.`,
        bgColor: "bg-red-100",
        textColor: "text-red-800",
      };
    }
    if (stats.lateDeduction > 0 && Math.abs(absDiff - stats.lateDeduction) <= 0.1) {
      return {
        side: "Software Issue",
        reason: `Software deducted ${stats.lateDeduction} days for late marks, but HR might have given manual grace.`,
        bgColor: "bg-orange-100",
        textColor: "text-orange-800",
      };
    }

    return {
      side: "Check Required",
      reason:
        "Software calculated more days. HR might have missed Holidays, Paid Leaves, or applied extra manual deductions.",
      bgColor: "bg-yellow-100",
      textColor: "text-yellow-800",
    };
  }
  // HR is higher than software (HR > Software)
  else {
    if (stats.lateDeduction > 0 && Math.abs(diff - stats.lateDeduction) <= 0.1) {
      return {
        side: "HR Issue",
        reason: `HR likely forgot to apply the ${stats.lateDeduction} late deduction days.`,
        bgColor: "bg-red-100",
        textColor: "text-red-800",
      };
    }
    return {
      side: "Check Required",
      reason:
        "HR calculated more days. HR might have manually granted extra present days or ignored late deductions.",
      bgColor: "bg-yellow-100",
      textColor: "text-yellow-800",
    };
  }
}

export interface LateStats {
  totalMinus4: number; // in minutes
}

export function getSmartLateExplanation(
  hrValueHours: number,
  stats: LateStats
): { side: "Match" | "HR Issue" | "Software Issue" | "Check Required"; reason: string; bgColor: string; textColor: string } {
  const softwareValueHours = stats.totalMinus4 / 60;
  const diff = hrValueHours - softwareValueHours; // + means HR is higher
  const absDiff = Math.abs(diff);

  if (absDiff <= 0.05)
    return {
      side: "Match",
      reason: "Values match perfectly.",
      bgColor: "bg-green-100",
      textColor: "text-green-800",
    };

  if (diff > 0) {
    return {
      side: "HR Issue",
      reason:
        "HR calculated more late hours. HR might have penalized for manual reasons not present in the punch data.",
      bgColor: "bg-red-100",
      textColor: "text-red-800",
    };
  } else {
    return {
      side: "Check Required",
      reason:
        "Software calculated more late hours. HR might have given manual relaxation, or software has missing out-punches inflating the late time.",
      bgColor: "bg-yellow-100",
      textColor: "text-yellow-800",
    };
  }
}

export interface OTStats {
  fullNightOTInMinutes: number;
  worker9to6OTMinutes: number;
  staffGrantedOTMinutes: number;
  workerGrantedOTMinutes: number;
  grantedFromSheetStaffMinutes: number;
  grandTotalMinutes: number;
}

export function getSmartOTExplanation(
  hrValueHours: number,
  stats: OTStats
): { side: "Match" | "HR Issue" | "Software Issue" | "Check Required"; reason: string; bgColor: string; textColor: string } {
  const softwareValueHours = stats.grandTotalMinutes / 60;
  const diff = hrValueHours - softwareValueHours; // + means HR is higher
  const absDiffHours = Math.abs(diff);

  if (absDiffHours <= 0.05)
    return {
      side: "Match",
      reason: "Values match perfectly.",
      bgColor: "bg-green-100",
      textColor: "text-green-800",
    };

  if (diff < -0.05) {
    // Software > HR
    // Did HR miss full night OT?
    const fnHours = stats.fullNightOTInMinutes / 60;
    if (fnHours > 0 && Math.abs(absDiffHours - fnHours) <= 0.1) {
      return {
        side: "HR Issue",
        reason: `HR likely missed adding the ${fnHours.toFixed(1)} hrs of Full Night OT.`,
        bgColor: "bg-red-100",
        textColor: "text-red-800",
      };
    }

    // Did HR miss Sunday/Holiday OT for staff?
    const staffGrantedHours = stats.staffGrantedOTMinutes / 60;
    if (staffGrantedHours > 0 && Math.abs(absDiffHours - staffGrantedHours) <= 0.1) {
      return {
        side: "HR Issue",
        reason: `HR likely missed adding ${staffGrantedHours.toFixed(1)} hrs of Weekend/Holiday OT.`,
        bgColor: "bg-red-100",
        textColor: "text-red-800",
      };
    }

    // Did HR miss custom 9 to 6 OT?
    const worker9to6Hours = stats.worker9to6OTMinutes / 60;
    if (worker9to6Hours > 0 && Math.abs(absDiffHours - worker9to6Hours) <= 0.1) {
      return {
        side: "HR Issue",
        reason: `HR likely missed calculating OT based on custom 9-to-6 timings.`,
        bgColor: "bg-red-100",
        textColor: "text-red-800",
      };
    }

    return {
      side: "Check Required",
      reason:
        "Software calculated more OT. HR might have missed Weekend/Holiday OT, capped the hours, or reduced OT manually.",
      bgColor: "bg-yellow-100",
      textColor: "text-yellow-800",
    };
  } else {
    // HR > Software
    const fnHours = stats.fullNightOTInMinutes / 60;
    if (fnHours > 0 && Math.abs(diff - fnHours) <= 0.1) {
      return {
        side: "Software Issue",
        reason: "Software calculation diff matches Full Night OT. HR might have added it twice.",
        bgColor: "bg-orange-100",
        textColor: "text-orange-800",
      };
    }

    return {
      side: "Check Required",
      reason:
        "HR calculated more OT. HR likely added manual extra OT hours or there's a missing grant sheet in software.",
      bgColor: "bg-yellow-100",
      textColor: "text-yellow-800",
    };
  }
}
