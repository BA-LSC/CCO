"use client";

import { useCallback, useEffect, useState } from "react";
import { deriveApiHostname } from "@/lib/websocket-url";

type SetupReadOnlyUrlProps = {
  label: string;
  value: string;
  help?: React.ReactNode;
};

function SetupReadOnlyUrl({ label, value, help }: SetupReadOnlyUrlProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="field">
      <span>{label}</span>
      <div className="setup-readonly-url-row">
        <input readOnly value={value} className="setup-form-input" aria-readonly="true" />
        <button type="button" className="setup-btn-secondary setup-copy-btn" onClick={handleCopy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {help ? <span className="help-text">{help}</span> : null}
    </div>
  );
}

export { SetupReadOnlyUrl };
