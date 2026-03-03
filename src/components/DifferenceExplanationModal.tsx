import React from "react";
import { XIcon } from "lucide-react";

export interface ExplanationData {
  side: "Match" | "HR Issue" | "Software Issue" | "Check Required";
  reason: string;
  bgColor: string;
  textColor: string;
}

export interface BreakdownItem {
  label: string;
  value: number | string;
  isSubtraction?: boolean;
}

interface DifferenceExplanationModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  difference: number;
  explanation: ExplanationData;
  hrValue: number | string;
  softwareValue: number | string;
  softwareBreakdown: BreakdownItem[];
  valueUnit?: string;
}

export const DifferenceExplanationModal: React.FC<DifferenceExplanationModalProps> = ({
  isOpen,
  onClose,
  title,
  difference,
  explanation,
  hrValue,
  softwareValue,
  softwareBreakdown,
  valueUnit = "",
}) => {
  if (!isOpen) return null;

  const isIssue = Math.abs(difference) > 0.02;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className={`px-6 py-4 flex items-center justify-between border-b ${isIssue ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
          <h2 className={`text-lg font-bold ${isIssue ? 'text-red-800' : 'text-green-800'}`}>
            {title} Difference Analysis
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full p-1 transition-colors"
          >
            <XIcon size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: "calc(100vh - 100px)" }}>
          {/* Top Level Summary */}
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="text-center p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex-1">
              <div className="text-xs text-yellow-700 font-semibold mb-1">HR Total</div>
              <div className="text-xl font-bold text-yellow-900">
                {hrValue} {valueUnit}
              </div>
            </div>
            
            <div className="text-2xl font-black text-gray-300">VS</div>

            <div className="text-center p-3 bg-blue-50 border border-blue-200 rounded-lg flex-1">
              <div className="text-xs text-blue-700 font-semibold mb-1">Software Total</div>
              <div className="text-xl font-bold text-blue-900">
                {softwareValue} {valueUnit}
              </div>
            </div>
          </div>

          {/* Difference & Explanation */}
          <div className={`p-4 rounded-lg border mb-6 ${explanation.bgColor.replace('100', '50')} ${explanation.bgColor.replace('bg-', 'border-')}`}>
            <div className="flex justify-between items-center mb-2">
              <span className={`font-bold ${explanation.textColor}`}>Net Difference:</span>
              <span className={`text-xl font-black ${explanation.textColor}`}>
                {difference > 0 ? "+" : ""}
                {Number(difference).toFixed(2)} {valueUnit}
              </span>
            </div>
            {isIssue && (
              <div className="mt-3 pt-3 border-t border-black/10">
                <span className={`font-black ${explanation.textColor} mr-2`}>{explanation.side}:</span>
                <span className={`text-sm ${explanation.textColor}`}>{explanation.reason}</span>
              </div>
            )}
          </div>

          {/* Proof / Breakdown */}
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">Software Calculation Proof</h3>
            <div className="space-y-2">
              {softwareBreakdown.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">{item.label}</span>
                  <span className={`font-mono font-medium ${item.isSubtraction ? 'text-red-600' : 'text-gray-800'}`}>
                    {item.isSubtraction ? "-" : "+"} {item.value} {valueUnit}
                  </span>
                </div>
              ))}
              
              <div className="border-t border-gray-300 my-2 pt-2 flex justify-between items-center">
                <span className="font-bold text-gray-800">Final Software Total</span>
                <span className="font-mono font-bold text-blue-700 text-lg">
                  = {softwareValue} {valueUnit}
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-800 text-white font-medium rounded-lg shadow hover:bg-gray-900 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
