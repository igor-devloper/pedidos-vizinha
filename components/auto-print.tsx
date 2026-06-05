"use client";

import { useEffect } from "react";

export function AutoPrint({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (enabled) {
      window.print();
    }
  }, [enabled]);

  return null;
}
