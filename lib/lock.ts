export type LockDenial = "not-answering" | "already-locked" | "empty" | "too-long";

const MAX_ANSWER = 120;

export function checkLock(input: {
  phase: string;
  alreadyLocked: boolean;
  own: string;
  prediction: string;
}):
  | { ok: true; own: string; prediction: string }
  | { ok: false; reason: LockDenial } {
  if (input.phase !== "answering") {
    return { ok: false, reason: "not-answering" };
  }
  if (input.alreadyLocked) {
    return { ok: false, reason: "already-locked" };
  }
  const own = input.own.trim();
  const prediction = input.prediction.trim();
  if (!own || !prediction) {
    return { ok: false, reason: "empty" };
  }
  if (own.length > MAX_ANSWER || prediction.length > MAX_ANSWER) {
    return { ok: false, reason: "too-long" };
  }
  return { ok: true, own, prediction };
}

export function lockDenialMessage(reason: LockDenial): string {
  switch (reason) {
    case "not-answering":
      return "Answers are closed for this question.";
    case "already-locked":
      return "That answer is already locked.";
    case "empty":
      return "Type your answer and your guess before you lock.";
    case "too-long":
      return "Keep each answer to 120 characters.";
  }
}
