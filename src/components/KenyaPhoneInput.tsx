import React, { useState, useEffect, useRef } from 'react';
import { Smartphone, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';
import {
  extractKenyanSubscriberDigits,
  isValidKenyanPhone,
  verifyMpesaRecipient,
  VerifyRecipientResponse,
} from '../services/mpesaService';

interface KenyaPhoneInputProps {
  value: string;
  onChange: (fullPhone: string, rawDigits: string) => void;
  onVerifiedChange?: (verifiedInfo: VerifyRecipientResponse | null) => void;
  label?: string;
  autoVerify?: boolean;
  disabled?: boolean;
  required?: boolean;
}

export const KenyaPhoneInput: React.FC<KenyaPhoneInputProps> = ({
  value,
  onChange,
  onVerifiedChange,
  label = 'M-Pesa Phone Number (Kenya)',
  autoVerify = false,
  disabled = false,
}) => {
  const [digits, setDigits] = useState<string>(() => extractKenyanSubscriberDigits(value));
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifiedData, setVerifiedData] = useState<VerifyRecipientResponse | null>(null);
  const [verificationError, setVerificationError] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep internal digits synced if value prop changes externally
  useEffect(() => {
    const extracted = extractKenyanSubscriberDigits(value);
    if (extracted !== digits) {
      setDigits(extracted);
      if (verifiedData) {
        setVerifiedData(null);
        if (onVerifiedChange) onVerifiedChange(null);
      }
    }
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const cleanDigits = extractKenyanSubscriberDigits(raw);
    setDigits(cleanDigits);

    const fullPhone = cleanDigits.length > 0 ? `254${cleanDigits}` : '';
    onChange(fullPhone, cleanDigits);

    // Reset verification when phone is edited or deleted
    if (verifiedData) setVerifiedData(null);
    if (verificationError) setVerificationError('');
    if (onVerifiedChange) onVerifiedChange(null);
  };

  const handleClear = () => {
    setDigits('');
    onChange('', '');
    setVerifiedData(null);
    setVerificationError('');
    if (onVerifiedChange) onVerifiedChange(null);
    inputRef.current?.focus();
  };

  const handleVerify = async (phoneDigitsToVerify?: string) => {
    const d = phoneDigitsToVerify || digits;
    if (d.length !== 9) {
      setVerificationError('Please enter all 9 digits (e.g. 712 345 678).');
      return;
    }

    const fullPhone = `254${d}`;
    if (!isValidKenyanPhone(fullPhone)) {
      setVerificationError('Number must start with 7 or 1 (Safaricom M-Pesa).');
      return;
    }

    setIsVerifying(true);
    setVerificationError('');

    try {
      const res = await verifyMpesaRecipient(fullPhone);
      if (res.success && res.verified) {
        setVerifiedData(res);
        setVerificationError('');
        if (onVerifiedChange) onVerifiedChange(res);
      } else {
        setVerifiedData(null);
        setVerificationError(res.error || 'Recipient name could not be verified on M-Pesa.');
        if (onVerifiedChange) onVerifiedChange(null);
      }
    } catch {
      setVerificationError('Network error verifying recipient.');
      if (onVerifiedChange) onVerifiedChange(null);
    } finally {
      setIsVerifying(false);
    }
  };

  // Optional auto-verify when explicitly enabled
  useEffect(() => {
    if (autoVerify && digits.length === 9) {
      const full = `254${digits}`;
      if (isValidKenyanPhone(full) && !verifiedData && !isVerifying) {
        handleVerify(digits);
      }
    }
  }, [digits, autoVerify]);

  // Formatter for display: "712 345 678"
  const formatDisplayDigits = (val: string) => {
    if (!val) return '';
    if (val.length <= 3) return val;
    if (val.length <= 6) return `${val.slice(0, 3)} ${val.slice(3)}`;
    return `${val.slice(0, 3)} ${val.slice(3, 6)} ${val.slice(6, 9)}`;
  };

  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex justify-between items-center text-xs font-semibold text-[#D1B9B3]">
          <span>{label}</span>
          <span className="text-[10px] font-mono text-[#9B97A2]">Kenya (+254)</span>
        </div>
      )}

      {/* Input container with fixed Kenya prefix */}
      <div
        className={`flex items-center rounded-2xl bg-[#140E1B] border transition-colors overflow-hidden ${
          verificationError
            ? 'border-[#946069]'
            : verifiedData
            ? 'border-emerald-500/70 focus-within:border-emerald-400'
            : 'border-[#382B44] focus-within:border-[#763698]'
        }`}
      >
        {/* Country Code Prefix Badge */}
        <div className="flex items-center px-3 py-2.5 bg-[#1E1627] border-r border-[#382B44] shrink-0 select-none">
          <span className="text-xs font-mono font-bold text-[#F8F0E7]">+254</span>
        </div>

        {/* 9-digit Subscriber Number input */}
        <div className="relative flex-1 flex items-center">
          <input
            ref={inputRef}
            type="tel"
            disabled={disabled}
            value={formatDisplayDigits(digits)}
            onChange={handleInputChange}
            placeholder="7XX XXX XXX"
            maxLength={20} // Allows pasting full international formats
            className="w-full bg-transparent pl-3.5 pr-24 py-2.5 text-sm font-mono font-bold text-[#F8F0E7] placeholder-[#554653] focus:outline-none disabled:opacity-50"
          />

          <div className="absolute right-2.5 flex items-center gap-1.5">
            {/* Quick Clear / Delete Button */}
            {digits.length > 0 && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                title="Clear phone number"
                className="w-5 h-5 rounded-full bg-[#2A1E37] text-[#9B97A2] hover:text-[#F8F0E7] hover:bg-[#3D2B50] flex items-center justify-center transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}

            {isVerifying ? (
              <Loader2 className="w-4 h-4 text-[#763698] animate-spin" />
            ) : verifiedData ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : digits.length === 9 ? (
              <button
                type="button"
                onClick={() => handleVerify()}
                title="Verify Recipient via Hakikisha"
                className="text-[11px] font-mono font-bold text-emerald-300 hover:text-emerald-200 bg-emerald-950/60 hover:bg-emerald-900/80 px-2.5 py-1 rounded-lg border border-emerald-500/50 transition-all active:scale-95 shadow-sm"
              >
                Verify
              </button>
            ) : (
              <Smartphone className="w-4 h-4 text-[#554653]" />
            )}
          </div>
        </div>
      </div>

      {/* Verification Feedback */}
      {isVerifying && (
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#D1B9B3] px-1 py-0.5">
          <Loader2 className="w-3 h-3 animate-spin text-[#763698]" />
          <span>Verifying receiver name via Safaricom Hakikisha...</span>
        </div>
      )}

      {/* Verified Receiver Card */}
      {verifiedData && (
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <div className="font-mono font-bold text-[#F8F0E7] text-xs truncate">
                {verifiedData.name}
              </div>
              <div className="font-mono text-[10px] text-emerald-400/80">
                Hakikisha Verified · Safaricom M-Pesa
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClear}
            title="Clear recipient"
            className="text-[10px] font-mono text-[#9B97A2] hover:text-[#F8F0E7] px-2 py-1 rounded-lg bg-[#22172F] border border-[#3C2E49] transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {verificationError && (
        <div className="flex items-center justify-between gap-1.5 text-[11px] text-[#946069] px-1 font-mono">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3 h-3 shrink-0" />
            <span>{verificationError}</span>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="text-[10px] underline text-[#D1B9B3] hover:text-white"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
};
