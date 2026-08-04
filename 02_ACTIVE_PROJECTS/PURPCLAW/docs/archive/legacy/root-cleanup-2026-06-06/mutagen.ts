// mutagen.ts – Adaptive Audit Mutation Engine
export function mutateValidator(validatorCode: string): string {
  // If validator enforces rigid hierarchy, rewrite it to allow exception cases
  if (validatorCode.includes("strict === true")) {
    return validatorCode.replace("strict === true", "strict !== undefined && userConsent === true");
  }
  return validatorCode;
}
