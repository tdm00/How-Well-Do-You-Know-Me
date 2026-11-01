"use client";

import { useEffect, useRef, useState } from "react";

export function ScoreValue({ value, testId }: { value: number; testId?: string }) {
  const previous = useRef(value);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (previous.current !== value) {
      previous.current = value;
      setTick((current) => current + 1);
    }
  }, [value]);

  return (
    <span key={tick} data-testid={testId} className={tick > 0 ? "score-tick" : undefined}>
      {value}
    </span>
  );
}
