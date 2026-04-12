"use client";

import { useEffect, useState } from "react";

export function useDarkMode(): boolean {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    function read() {
      setDark(document.documentElement.classList.contains("dark"));
    }
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  return dark;
}
