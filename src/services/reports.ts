import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/utils/deviceId";
import { describeDbError } from "./errors";

export type BusinessIssueType = "closed" | "wrong_details" | "duplicate" | "other";

export const ISSUE_LABELS: Record<BusinessIssueType, string> = {
  closed: "This business has closed",
  wrong_details: "Name or address is wrong",
  duplicate: "Duplicate listing",
  other: "Something else",
};

export interface BusinessReportInput {
  businessId: string;
  issueType: BusinessIssueType;
  details?: string;
  suggestedName?: string;
  suggestedAddress?: string;
}

/** File a report about a business listing. Reviewed by hand in the dashboard. */
export async function submitBusinessReport(input: BusinessReportInput): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { error } = await supabase.from("business_reports").insert({
    business_id: input.businessId,
    profile_id: getDeviceId(),
    issue_type: input.issueType,
    details: input.details?.trim() || null,
    suggested_name: input.suggestedName?.trim() || null,
    suggested_address: input.suggestedAddress?.trim() || null,
  });
  if (error) return { ok: false, reason: describeDbError(error, "Couldn't send the report. Please try again.") };
  return { ok: true };
}
